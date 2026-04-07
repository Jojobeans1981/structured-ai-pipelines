# Validation Agent

A production-ready, multi-language code validation agent designed to sit at the end of a software factory pipeline. It scans a generated repository, detects which languages are present, and runs lint, test, coverage, and security checks — producing a deterministic JSON readiness report.

## Supported Languages

| Language | Lint | Test | Coverage | Security |
|----------|------|------|----------|----------|
| Python | flake8 | pytest | coverage.py | bandit |
| Node.js | eslint | jest | jest --coverage | npm audit |
| Java | checkstyle (mvn) | mvn test | jacoco | OWASP dependency-check |
| Go | golint | go test | go tool cover | govulncheck |
| .NET | dotnet format | dotnet test | XPlat Code Coverage | dotnet list --vulnerable |

## Build

```bash
docker build -t factory/validation-agent:latest .
```

## Run

Mount the generated repo into the container and pass `--repo`:

```bash
docker run --rm \
  -v /path/to/generated-repo:/repo:ro \
  factory/validation-agent:latest \
  --repo /repo
```

### Write report to file

```bash
docker run --rm \
  -v /path/to/generated-repo:/repo:ro \
  -v /tmp/reports:/reports \
  factory/validation-agent:latest \
  --repo /repo --output /reports/validation.json
```

### Verbose logging

```bash
docker run --rm \
  -v /path/to/generated-repo:/repo:ro \
  factory/validation-agent:latest \
  --repo /repo --verbose
```

### Custom config

```bash
docker run --rm \
  -v /path/to/generated-repo:/repo:ro \
  -v /path/to/my-config.yaml:/app/config.yaml:ro \
  factory/validation-agent:latest \
  --repo /repo
```

## JSON Report Format

```json
{
  "repo_path": "/repo",
  "languages": ["python", "node"],
  "aggregated_metrics": {
    "lint_errors": 3,
    "tests_passed": true,
    "coverage_percent": 87.5,
    "security_findings": 0
  },
  "readiness": {
    "status": "lint_issues",
    "details": ["Lint errors (3) exceed threshold (0)"]
  },
  "results": [
    {
      "language": "python",
      "metrics": { ... },
      "commands": [ ... ]
    }
  ]
}
```

### Readiness Statuses

| Status | Meaning |
|--------|---------|
| `ready` | All checks pass thresholds — code is production-ready |
| `tests_failed` | One or more test suites exited non-zero |
| `security_issues` | Security findings exceed `max_security_findings` threshold |
| `lint_issues` | Lint errors exceed `max_lint_errors` threshold |
| `insufficient_coverage` | Coverage below `coverage_percent` threshold |
| `no_tests` | No test output detected for any language |
| `needs_coverage` | Tests exist but coverage could not be parsed from output |

Statuses are prioritized: `tests_failed` > `security_issues` > `lint_issues` > `insufficient_coverage` > `no_tests` > `needs_coverage`.

## Thresholds

Default thresholds in `config.yaml`:

```yaml
thresholds:
  coverage_percent: 80      # Minimum code coverage %
  max_lint_errors: 0         # Maximum allowed lint errors
  max_security_findings: 0   # Maximum allowed security findings
```

Override by mounting a custom `config.yaml`.

## Security

- The container runs as a non-root user (`validator`), making it safe to execute untrusted generated code.
- Each command is run in a subprocess with a 5-minute timeout.
- The repo is mounted read-only (`:ro`) by convention.

## Idempotency

The agent produces the same JSON output when run twice on the same repo. No timestamps, random IDs, or non-deterministic elements are included in the report. Lists are sorted deterministically.

## Example One-Liner

```bash
docker run --rm -v "$(pwd)/my-generated-app:/repo:ro" factory/validation-agent:latest --repo /repo | jq .readiness.status
```
