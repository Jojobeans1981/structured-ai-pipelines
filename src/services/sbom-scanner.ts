/**
 * Software Bill of Materials (SBOM) scanner.
 * Generates a CycloneDX-compatible SBOM from project files and flags known
 * vulnerable or suspicious dependencies. Runs entirely in-memory (no Trivy/Syft
 * binary required) — uses static analysis of package manifests.
 */

interface SBOMComponent {
  type: 'library';
  name: string;
  version: string;
  purl: string; // Package URL spec
  scope: 'required' | 'optional' | 'dev';
}

interface VulnerabilityFlag {
  package: string;
  version: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  description: string;
}

export interface SBOMResult {
  components: SBOMComponent[];
  vulnerabilities: VulnerabilityFlag[];
  totalDeps: number;
  directDeps: number;
  report: string;
}

// Known problematic packages/versions (static list — a real scanner would use a vulnerability DB)
const KNOWN_VULNERABILITIES: Array<{
  package: string;
  versionRange?: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  description: string;
}> = [
  { package: 'event-stream', severity: 'critical', description: 'Supply chain attack — malicious code injected in v3.3.6' },
  { package: 'flatmap-stream', severity: 'critical', description: 'Malicious package used in event-stream attack' },
  { package: 'ua-parser-js', versionRange: '<0.7.33', severity: 'critical', description: 'Cryptominer/password stealer injected in versions 0.7.29-0.7.32' },
  { package: 'colors', versionRange: '>1.4.0', severity: 'high', description: 'Author sabotaged v1.4.1+ with infinite loop' },
  { package: 'faker', versionRange: '>5.5.3', severity: 'high', description: 'Author sabotaged v6.6.6 — use @faker-js/faker instead' },
  { package: 'node-ipc', versionRange: '>=10.1.1', severity: 'critical', description: 'Protestware — destructive code targeting specific geolocations' },
  { package: 'lodash', versionRange: '<4.17.21', severity: 'medium', description: 'Prototype pollution vulnerability' },
  { package: 'minimist', versionRange: '<1.2.6', severity: 'medium', description: 'Prototype pollution vulnerability' },
  { package: 'json5', versionRange: '<2.2.2', severity: 'medium', description: 'Prototype pollution vulnerability' },
  { package: 'semver', versionRange: '<7.5.2', severity: 'medium', description: 'ReDoS vulnerability' },
  { package: 'tar', versionRange: '<6.1.9', severity: 'high', description: 'Arbitrary file creation/overwrite' },
  { package: 'jsonwebtoken', versionRange: '<9.0.0', severity: 'high', description: 'Insecure default algorithm allows token forging' },
  { package: 'axios', versionRange: '<1.6.0', severity: 'medium', description: 'SSRF vulnerability via server-side requests' },
  { package: 'express', versionRange: '<4.19.2', severity: 'medium', description: 'Open redirect vulnerability' },
];

// Packages that are commonly deprecated or have better alternatives
const DEPRECATED_PACKAGES: Record<string, string> = {
  'request': 'Use axios, node-fetch, or undici instead',
  'moment': 'Use date-fns or dayjs instead (moment is in maintenance mode)',
  'faker': 'Use @faker-js/faker instead (original was sabotaged)',
  'querystring': 'Use URLSearchParams (built-in) instead',
  'uuid': 'Use crypto.randomUUID() (built-in since Node 19) instead',
};

export class SBOMScanner {
  /**
   * Generate SBOM and vulnerability scan from project files.
   * Works entirely from in-memory file contents — no filesystem or external tools needed.
   */
  static scan(projectFiles: Array<{ filePath: string; content: string }>): SBOMResult {
    const components: SBOMComponent[] = [];
    const vulnerabilities: VulnerabilityFlag[] = [];

    // Parse package.json
    const pkgFile = projectFiles.find((f) => f.filePath === 'package.json');
    if (pkgFile) {
      try {
        const pkg = JSON.parse(pkgFile.content);
        const deps = pkg.dependencies || {};
        const devDeps = pkg.devDependencies || {};

        // Process dependencies
        for (const [name, version] of Object.entries(deps)) {
          const cleanVersion = String(version).replace(/^[\^~>=<]/, '');
          components.push({
            type: 'library',
            name,
            version: cleanVersion,
            purl: `pkg:npm/${name.replace('/', '%2F')}@${cleanVersion}`,
            scope: 'required',
          });
        }

        // Process devDependencies
        for (const [name, version] of Object.entries(devDeps)) {
          const cleanVersion = String(version).replace(/^[\^~>=<]/, '');
          components.push({
            type: 'library',
            name,
            version: cleanVersion,
            purl: `pkg:npm/${name.replace('/', '%2F')}@${cleanVersion}`,
            scope: 'dev',
          });
        }
      } catch { /* malformed package.json */ }
    }

    // Parse requirements.txt
    const reqFile = projectFiles.find((f) => f.filePath === 'requirements.txt');
    if (reqFile) {
      const lines = reqFile.content.split('\n');
      for (const line of lines) {
        const match = line.trim().match(/^([a-zA-Z0-9_-]+)(?:[=<>!~]+(.+))?$/);
        if (match) {
          components.push({
            type: 'library',
            name: match[1],
            version: match[2] || 'latest',
            purl: `pkg:pypi/${match[1]}@${match[2] || 'latest'}`,
            scope: 'required',
          });
        }
      }
    }

    // Parse go.mod
    const goModFile = projectFiles.find((f) => f.filePath === 'go.mod');
    if (goModFile) {
      const requireMatches = goModFile.content.matchAll(/^\s+(\S+)\s+(v[\d.]+)/gm);
      for (const match of requireMatches) {
        components.push({
          type: 'library',
          name: match[1],
          version: match[2],
          purl: `pkg:golang/${match[1]}@${match[2]}`,
          scope: 'required',
        });
      }
    }

    // Check for known vulnerabilities
    for (const comp of components) {
      for (const vuln of KNOWN_VULNERABILITIES) {
        if (comp.name === vuln.package) {
          vulnerabilities.push({
            package: comp.name,
            version: comp.version,
            severity: vuln.severity,
            description: vuln.description,
          });
        }
      }

      // Check for deprecated packages
      if (DEPRECATED_PACKAGES[comp.name]) {
        vulnerabilities.push({
          package: comp.name,
          version: comp.version,
          severity: 'info',
          description: `Deprecated: ${DEPRECATED_PACKAGES[comp.name]}`,
        });
      }
    }

    // Sort vulnerabilities by severity
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    vulnerabilities.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    const directDeps = components.filter((c) => c.scope === 'required').length;

    // Build report
    let report = `**Components:** ${components.length} (${directDeps} direct, ${components.length - directDeps} dev)\n`;

    if (vulnerabilities.length > 0) {
      const critical = vulnerabilities.filter((v) => v.severity === 'critical').length;
      const high = vulnerabilities.filter((v) => v.severity === 'high').length;
      const medium = vulnerabilities.filter((v) => v.severity === 'medium').length;
      const info = vulnerabilities.filter((v) => v.severity === 'info').length;

      report += `**Findings:** ${critical} critical, ${high} high, ${medium} medium, ${info} info\n\n`;

      for (const vuln of vulnerabilities) {
        const icon = vuln.severity === 'critical' ? '🔴'
          : vuln.severity === 'high' ? '🟠'
            : vuln.severity === 'medium' ? '🟡'
              : vuln.severity === 'info' ? 'ℹ️' : '⚪';
        report += `- ${icon} **${vuln.package}@${vuln.version}** (${vuln.severity}): ${vuln.description}\n`;
      }
    } else {
      report += '**Findings:** No known vulnerabilities detected.\n';
    }

    return {
      components,
      vulnerabilities,
      totalDeps: components.length,
      directDeps,
      report,
    };
  }

  /**
   * Generate a CycloneDX SBOM JSON document.
   */
  static toCycloneDX(result: SBOMResult, projectName: string): string {
    const sbom = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      version: 1,
      metadata: {
        timestamp: new Date().toISOString(),
        component: {
          type: 'application',
          name: projectName,
          version: '0.0.1',
        },
        tools: [{ vendor: 'Gauntlet Forge', name: 'sbom-scanner', version: '1.0.0' }],
      },
      components: result.components.map((c) => ({
        type: c.type,
        name: c.name,
        version: c.version,
        purl: c.purl,
        scope: c.scope,
      })),
      vulnerabilities: result.vulnerabilities.map((v) => ({
        id: `FORGE-${v.package}-${v.severity}`,
        source: { name: 'Gauntlet Forge SBOM Scanner' },
        ratings: [{ severity: v.severity }],
        description: v.description,
        affects: [{ ref: v.package }],
      })),
    };

    return JSON.stringify(sbom, null, 2);
  }
}
