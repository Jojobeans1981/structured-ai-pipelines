"""
Validation Agent – evaluates generated source code across multiple languages.

Scans a repository for supported languages, runs lint / test / coverage / security
pipelines, and produces a deterministic JSON readiness report.
"""

import argparse
import json
import logging
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

import yaml

logger = logging.getLogger("validation_agent")

# ──────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Validation Agent – evaluate generated code")
    p.add_argument("--repo", required=True, help="Absolute path to the generated repo")
    p.add_argument("--config", default="/app/config.yaml", help="Path to config.yaml")
    p.add_argument("--output", default=None, help="Write JSON report to file (default: stdout)")
    p.add_argument("--verbose", action="store_true", help="Enable DEBUG logging")
    return p.parse_args()


# ──────────────────────────────────────────────────────────────
# Config loader
# ──────────────────────────────────────────────────────────────

def load_config(path: str) -> dict[str, Any]:
    p = Path(path)
    if not p.exists():
        logger.error("Config file not found: %s", path)
        sys.exit(1)
    with open(p, "r") as f:
        return yaml.safe_load(f)


# ──────────────────────────────────────────────────────────────
# Language detection
# ──────────────────────────────────────────────────────────────

def detect_languages(repo: Path, lang_config: dict[str, Any]) -> list[str]:
    """Walk the repo and return sorted list of detected language keys."""
    ext_to_lang: dict[str, str] = {}
    for lang_name, lang_def in lang_config.items():
        for ext in lang_def.get("extensions", []):
            ext_to_lang[ext] = lang_name

    found: set[str] = set()
    for root, _dirs, files in os.walk(repo):
        # Skip common vendored / generated directories
        rel = os.path.relpath(root, repo)
        skip = any(
            part in ("node_modules", ".git", "vendor", "__pycache__", "dist", ".next", "bin", "obj")
            for part in Path(rel).parts
        )
        if skip:
            continue
        for fname in files:
            ext = os.path.splitext(fname)[1].lower()
            if ext in ext_to_lang:
                found.add(ext_to_lang[ext])

    return sorted(found)


# ──────────────────────────────────────────────────────────────
# Command execution
# ──────────────────────────────────────────────────────────────

def run_command(cmd: str, cwd: str, timeout: int = 300) -> dict[str, Any]:
    """Run a shell command and return stdout, stderr, exit_code."""
    logger.debug("  CMD: %s", cmd)
    try:
        result = subprocess.run(
            cmd,
            shell=True,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return {
            "command": cmd,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "exit_code": result.returncode,
        }
    except subprocess.TimeoutExpired:
        return {
            "command": cmd,
            "stdout": "",
            "stderr": f"TIMEOUT after {timeout}s",
            "exit_code": -1,
        }
    except FileNotFoundError as e:
        return {
            "command": cmd,
            "stdout": "",
            "stderr": f"Command not found: {e}",
            "exit_code": 127,
        }


def run_phase(phase_name: str, commands: list[str], cwd: str) -> list[dict[str, Any]]:
    """Execute all commands for a pipeline phase, return list of results."""
    results = []
    for cmd in commands:
        r = run_command(cmd, cwd)
        r["phase"] = phase_name
        results.append(r)
        logger.info("  [%s] exit=%d  %s", phase_name, r["exit_code"], cmd[:80])
    return results


# ──────────────────────────────────────────────────────────────
# Metric parsers
# ──────────────────────────────────────────────────────────────

def count_lint_errors(phase_results: list[dict[str, Any]]) -> int:
    """Count total lint error lines from lint phase outputs."""
    total = 0
    for r in phase_results:
        if r.get("phase") != "lint":
            continue
        combined = r["stdout"] + r["stderr"]
        # Count non-empty output lines that look like lint findings.
        # Flake8 format: file.py:line:col: E### message
        # ESLint compact: /path/file.js: line X, col Y, Error - ...
        # General: any line with a file-path-like prefix
        lines = [l.strip() for l in combined.splitlines() if l.strip()]
        # Filter to lines that contain a colon-separated path pattern
        error_lines = [
            l for l in lines
            if re.search(r"[a-zA-Z0-9_/\\]+\.\w+:\d+", l)
        ]
        total += len(error_lines)

        # Also check for flake8 --count summary line (e.g. "42")
        for l in lines:
            m = re.match(r"^(\d+)\s*$", l)
            if m:
                # If flake8 --count emits a bare number, use that instead
                count_val = int(m.group(1))
                if count_val > total:
                    total = count_val

    return total


def check_tests_passed(phase_results: list[dict[str, Any]]) -> bool:
    """Return True if all test commands exited 0."""
    test_results = [r for r in phase_results if r.get("phase") == "test"]
    if not test_results:
        return True  # No tests to fail
    return all(r["exit_code"] == 0 for r in test_results)


def has_tests(phase_results: list[dict[str, Any]]) -> bool:
    """Return True if any test phase produced meaningful output."""
    for r in phase_results:
        if r.get("phase") != "test":
            continue
        combined = r["stdout"] + r["stderr"]
        # Check for common "no tests" indicators
        if any(kw in combined.lower() for kw in [
            "no tests", "no test", "0 tests", "test suite empty",
            "no tests found", "collected 0 items",
        ]):
            continue
        if combined.strip():
            return True
    return False


def parse_coverage(phase_results: list[dict[str, Any]]) -> float | None:
    """Extract coverage percentage from coverage phase outputs."""
    percentages: list[float] = []

    for r in phase_results:
        if r.get("phase") != "coverage":
            continue
        combined = r["stdout"] + r["stderr"]

        # Python coverage report --format=total → single number like "85"
        for line in combined.splitlines():
            stripped = line.strip()
            m = re.match(r"^(\d+(?:\.\d+)?)\s*%?\s*$", stripped)
            if m:
                percentages.append(float(m.group(1)))
                break

        # Generic: "XX% " or "XX.X%" anywhere
        for m in re.finditer(r"(\d+(?:\.\d+)?)\s*%", combined):
            percentages.append(float(m.group(1)))

        # Go cover: "total:\t(statements)\tXX.X%"
        m = re.search(r"total:\s*\(statements\)\s*(\d+(?:\.\d+)?)%", combined)
        if m:
            percentages.append(float(m.group(1)))

        # Jest: "All files.*\|\s*(\d+(?:\.\d+)?)"
        m = re.search(r"All files[^|]*\|\s*(\d+(?:\.\d+)?)", combined)
        if m:
            percentages.append(float(m.group(1)))

    if not percentages:
        return None

    # Deduplicate and average
    unique = sorted(set(percentages))
    return round(sum(unique) / len(unique), 2)


def count_security_findings(phase_results: list[dict[str, Any]]) -> int:
    """Count total security findings from security phase outputs."""
    total = 0

    for r in phase_results:
        if r.get("phase") != "security":
            continue
        combined = r["stdout"] + r["stderr"]

        # Bandit JSON → count results array length
        try:
            data = json.loads(combined)
            if isinstance(data, dict) and "results" in data:
                total += len(data["results"])
                continue
            if isinstance(data, dict) and "vulnerabilities" in data:
                total += data["vulnerabilities"]
                continue
        except (json.JSONDecodeError, TypeError):
            pass

        # npm audit JSON → advisories count
        try:
            data = json.loads(combined)
            if isinstance(data, dict) and "advisories" in data:
                total += len(data["advisories"])
                continue
            if isinstance(data, dict) and "metadata" in data:
                vuln = data["metadata"].get("vulnerabilities", {})
                total += sum(v for v in vuln.values() if isinstance(v, int))
                continue
        except (json.JSONDecodeError, TypeError):
            pass

        # Generic: count lines containing severity-like keywords
        for line in combined.splitlines():
            if re.search(r"(severity|vuln|CVE-|GHSA-|critical|high|medium|low)", line, re.IGNORECASE):
                total += 1

    return total


# ──────────────────────────────────────────────────────────────
# Readiness evaluation
# ──────────────────────────────────────────────────────────────

def evaluate_readiness(
    metrics: dict[str, Any],
    thresholds: dict[str, Any],
    has_test_output: bool,
) -> dict[str, Any]:
    """Evaluate overall readiness against thresholds."""
    details: list[str] = []
    status = "ready"

    cov = metrics.get("coverage_percent")
    lint = metrics.get("lint_errors", 0)
    sec = metrics.get("security_findings", 0)
    tests_ok = metrics.get("tests_passed", True)

    max_lint = thresholds.get("max_lint_errors", 0)
    max_sec = thresholds.get("max_security_findings", 0)
    min_cov = thresholds.get("coverage_percent", 80)

    if not tests_ok:
        status = "tests_failed"
        details.append("One or more test suites failed")

    if not has_test_output:
        status = "no_tests"
        details.append("No test output detected for any language")

    if lint > max_lint:
        status = "lint_issues"
        details.append(f"Lint errors ({lint}) exceed threshold ({max_lint})")

    if sec > max_sec:
        status = "security_issues"
        details.append(f"Security findings ({sec}) exceed threshold ({max_sec})")

    if cov is not None and cov < min_cov:
        status = "insufficient_coverage"
        details.append(f"Coverage ({cov}%) below threshold ({min_cov}%)")
    elif cov is None:
        # Only flag if tests exist but coverage couldn't be determined
        if has_test_output:
            status = "needs_coverage"
            details.append("Coverage could not be determined from tool output")

    # If multiple issues, the status reflects the most critical one.
    # Priority: tests_failed > security_issues > lint_issues > insufficient_coverage > no_tests > needs_coverage
    # The above if-chain is ordered lowest→highest priority so the last match wins.
    # We already have that: tests_failed sets first, but gets overwritten. Reverse:
    issue_priority = [
        "needs_coverage", "no_tests", "insufficient_coverage",
        "lint_issues", "security_issues", "tests_failed",
    ]
    if details:
        # Recalculate: pick highest priority issue
        found_statuses = []
        if not tests_ok:
            found_statuses.append("tests_failed")
        if sec > max_sec:
            found_statuses.append("security_issues")
        if lint > max_lint:
            found_statuses.append("lint_issues")
        if cov is not None and cov < min_cov:
            found_statuses.append("insufficient_coverage")
        if not has_test_output:
            found_statuses.append("no_tests")
        if cov is None and has_test_output:
            found_statuses.append("needs_coverage")

        for s in reversed(issue_priority):
            if s in found_statuses:
                status = s
                break
    else:
        status = "ready"

    return {"status": status, "details": sorted(details)}


# ──────────────────────────────────────────────────────────────
# Per-language pipeline
# ──────────────────────────────────────────────────────────────

def run_language_pipeline(
    lang_name: str,
    lang_config: dict[str, Any],
    repo_path: str,
) -> dict[str, Any]:
    """Run the full validation pipeline for one language."""
    logger.info("── %s ──", lang_name.upper())

    all_results: list[dict[str, Any]] = []
    phases = ["setup", "lint", "test", "coverage", "security"]

    for phase in phases:
        commands = lang_config.get(phase, [])
        if not commands:
            logger.debug("  No commands for phase: %s", phase)
            continue
        results = run_phase(phase, commands, repo_path)
        all_results.extend(results)

    # Compute per-language metrics
    lint_errors = count_lint_errors(all_results)
    tests_passed = check_tests_passed(all_results)
    coverage_pct = parse_coverage(all_results)
    security_count = count_security_findings(all_results)
    has_test = has_tests(all_results)

    return {
        "language": lang_name,
        "metrics": {
            "lint_errors": lint_errors,
            "tests_passed": tests_passed,
            "coverage_percent": coverage_pct,
            "security_findings": security_count,
            "has_tests": has_test,
        },
        "commands": [
            {
                "phase": r["phase"],
                "command": r["command"],
                "exit_code": r["exit_code"],
                "stdout_lines": len(r["stdout"].splitlines()),
                "stderr_lines": len(r["stderr"].splitlines()),
            }
            for r in all_results
        ],
    }


# ──────────────────────────────────────────────────────────────
# Aggregation
# ──────────────────────────────────────────────────────────────

def aggregate_metrics(lang_results: list[dict[str, Any]]) -> dict[str, Any]:
    """Aggregate metrics across all languages."""
    total_lint = sum(r["metrics"]["lint_errors"] for r in lang_results)
    all_tests_passed = all(r["metrics"]["tests_passed"] for r in lang_results)
    total_security = sum(r["metrics"]["security_findings"] for r in lang_results)

    coverages = [
        r["metrics"]["coverage_percent"]
        for r in lang_results
        if r["metrics"]["coverage_percent"] is not None
    ]
    avg_coverage = round(sum(coverages) / len(coverages), 2) if coverages else None

    return {
        "lint_errors": total_lint,
        "tests_passed": all_tests_passed,
        "coverage_percent": avg_coverage,
        "security_findings": total_security,
    }


# ──────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────

def main() -> None:
    args = parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # Validate repo path
    repo = Path(args.repo).resolve()
    if not repo.exists() or not repo.is_dir():
        logger.error("Repository path does not exist or is not a directory: %s", repo)
        sys.exit(1)

    # Load config
    config = load_config(args.config)
    lang_config = config.get("languages", {})
    thresholds = config.get("thresholds", {})

    # Detect languages
    languages = detect_languages(repo, lang_config)
    if not languages:
        logger.warning("No supported languages detected in %s", repo)
        report = {
            "repo_path": str(repo),
            "languages": [],
            "aggregated_metrics": {
                "lint_errors": 0,
                "tests_passed": True,
                "coverage_percent": None,
                "security_findings": 0,
            },
            "readiness": {
                "status": "no_tests",
                "details": ["No supported languages detected in repository"],
            },
            "results": [],
        }
    else:
        logger.info("Detected languages: %s", ", ".join(languages))

        # Run per-language pipelines
        lang_results = []
        for lang in languages:
            if lang not in lang_config:
                logger.warning("No config for language: %s", lang)
                continue
            result = run_language_pipeline(lang, lang_config[lang], str(repo))
            lang_results.append(result)

        # Aggregate
        agg = aggregate_metrics(lang_results)
        any_tests = any(r["metrics"]["has_tests"] for r in lang_results)
        readiness = evaluate_readiness(agg, thresholds, any_tests)

        report = {
            "repo_path": str(repo),
            "languages": languages,
            "aggregated_metrics": agg,
            "readiness": readiness,
            "results": lang_results,
        }

    # Output
    report_json = json.dumps(report, indent=2, sort_keys=False)

    if args.output:
        out_path = Path(args.output)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(report_json + "\n")
        logger.info("Report written to %s", out_path)
    else:
        print(report_json)


if __name__ == "__main__":
    main()
