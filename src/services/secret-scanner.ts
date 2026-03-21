interface SecretFinding {
  type: string;
  file: string;
  line: number;
  snippet: string;
}

interface ScanResult {
  findings: SecretFinding[];
  scannedFiles: number;
  clean: boolean;
}

const SECRET_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/ },
  { name: 'AWS Secret Key', regex: /(?:aws_secret_access_key|AWS_SECRET)\s*[=:]\s*['"]?[A-Za-z0-9/+=]{40}/ },
  { name: 'Generic API Key', regex: /(?:api[_-]?key|apikey)\s*[=:]\s*['"][A-Za-z0-9_\-]{20,}['"]/ },
  { name: 'Generic Secret', regex: /(?:secret|password|passwd|token)\s*[=:]\s*['"][^'"]{8,}['"]/ },
  { name: 'Private Key', regex: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/ },
  { name: 'Anthropic Key', regex: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: 'OpenAI Key', regex: /sk-[A-Za-z0-9]{32,}/ },
  { name: 'Groq Key', regex: /gsk_[A-Za-z0-9]{20,}/ },
  { name: 'GitHub Token', regex: /gh[pousr]_[A-Za-z0-9]{36,}/ },
  { name: 'Stripe Key', regex: /sk_(?:live|test)_[A-Za-z0-9]{20,}/ },
  { name: 'Database URL with Password', regex: /(?:postgres|mysql|mongodb):\/\/[^:]+:[^@\s]{4,}@/ },
  { name: 'Bearer Token', regex: /Bearer\s+[A-Za-z0-9_\-.]{20,}/ },
  { name: 'Hardcoded .env Value', regex: /process\.env\.\w+\s*\|\|\s*['"][^'"]{8,}['"]/ },
];

// Files that commonly contain secrets but shouldn't be in generated code
const SUSPICIOUS_FILES = ['.env', '.env.local', '.env.production', 'credentials.json', 'serviceAccountKey.json'];

export class SecretScanner {
  /**
   * Scan generated files for potential secrets/credentials.
   * Non-blocking — returns findings but doesn't prevent pipeline progress.
   */
  static scan(files: Array<{ filePath: string; content: string }>): ScanResult {
    const findings: SecretFinding[] = [];

    for (const file of files) {
      // Check for suspicious file names
      const filename = file.filePath.split('/').pop() || '';
      if (SUSPICIOUS_FILES.some((s) => filename === s || filename.startsWith(s))) {
        findings.push({
          type: 'Suspicious File',
          file: file.filePath,
          line: 0,
          snippet: `File "${filename}" should not be in generated code`,
        });
      }

      // Scan content line by line
      const lines = file.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Skip comments that describe patterns (don't flag documentation)
        if (line.trim().startsWith('//') || line.trim().startsWith('#') || line.trim().startsWith('*')) {
          continue;
        }

        for (const pattern of SECRET_PATTERNS) {
          if (pattern.regex.test(line)) {
            // Don't flag template literals or env references that are properly configured
            if (line.includes('process.env.') && !line.includes('||')) continue;
            if (line.includes('import.meta.env.')) continue;

            findings.push({
              type: pattern.name,
              file: file.filePath,
              line: i + 1,
              snippet: line.trim().substring(0, 80) + (line.trim().length > 80 ? '...' : ''),
            });
          }
        }
      }
    }

    return {
      findings,
      scannedFiles: files.length,
      clean: findings.length === 0,
    };
  }

  /**
   * Format scan results as a markdown block to append to artifacts.
   */
  static formatResults(result: ScanResult): string {
    if (result.clean) {
      return `\n\n---\n\n🔒 **Secret Scan: CLEAN** (${result.scannedFiles} files scanned, no secrets detected)`;
    }

    let output = `\n\n---\n\n⚠️ **Secret Scan: ${result.findings.length} POTENTIAL SECRET(S) DETECTED**\n\n`;
    output += `Scanned ${result.scannedFiles} files.\n\n`;

    for (const finding of result.findings) {
      output += `- **${finding.type}** in \`${finding.file}\`${finding.line > 0 ? ` (line ${finding.line})` : ''}\n`;
      if (finding.snippet) {
        output += `  \`${finding.snippet}\`\n`;
      }
    }

    output += '\n> These may be false positives. Review before shipping to production.';
    return output;
  }
}
