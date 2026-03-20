import { extractFilesFromArtifact } from '@/src/services/file-manager';

interface ValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
  filesChecked: number;
  rejectedFiles: string[];
}

// Map tech stack keywords to allowed file extensions
const STACK_EXTENSIONS: Record<string, string[]> = {
  react: ['.ts', '.tsx', '.js', '.jsx', '.css', '.scss', '.html', '.json', '.svg', '.png', '.ico', '.md'],
  typescript: ['.ts', '.tsx', '.js', '.jsx', '.d.ts', '.json', '.css', '.scss', '.html', '.svg', '.md'],
  javascript: ['.js', '.jsx', '.mjs', '.cjs', '.json', '.css', '.html', '.svg', '.md'],
  vite: ['.ts', '.tsx', '.js', '.jsx', '.css', '.html', '.json', '.svg', '.md'],
  nextjs: ['.ts', '.tsx', '.js', '.jsx', '.css', '.scss', '.html', '.json', '.svg', '.md', '.prisma'],
  python: ['.py', '.pyi', '.toml', '.cfg', '.txt', '.json', '.yaml', '.yml', '.md', '.html', '.css'],
  rust: ['.rs', '.toml', '.json', '.md'],
  go: ['.go', '.mod', '.sum', '.json', '.yaml', '.md'],
  tailwind: ['.css', '.ts', '.tsx', '.js', '.jsx', '.json', '.html'],
};

// File extensions that should NEVER appear in a web frontend project
const WRONG_STACK_FILES: Record<string, string[]> = {
  react: ['.py', '.rb', '.java', '.go', '.rs', '.php', '.cs', '.swift', '.kt'],
  typescript: ['.py', '.rb', '.java', '.go', '.rs', '.php', '.cs', '.swift', '.kt'],
  vite: ['.py', '.rb', '.java', '.go', '.rs', '.php', '.cs', '.swift', '.kt'],
  nextjs: ['.py', '.rb', '.java', '.go', '.rs', '.php', '.cs', '.swift', '.kt'],
};

// Config files that indicate wrong stack
const WRONG_STACK_CONFIGS: Record<string, string[]> = {
  react: ['requirements.txt', 'setup.py', 'Pipfile', 'Gemfile', 'go.mod', 'Cargo.toml', 'pom.xml', 'build.gradle'],
  typescript: ['requirements.txt', 'setup.py', 'Pipfile', 'Gemfile', 'go.mod', 'Cargo.toml', 'pom.xml', 'build.gradle'],
};

export class OutputValidator {
  /**
   * Validate that generated output matches the expected tech stack.
   * Called after a phase-executor or fix-executor stage completes.
   */
  static validate(artifactContent: string, prdContext: string): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      warnings: [],
      errors: [],
      filesChecked: 0,
      rejectedFiles: [],
    };

    // Extract the tech stack from the PRD context
    const detectedStacks = OutputValidator.detectStack(prdContext);
    if (detectedStacks.length === 0) {
      result.warnings.push('Could not detect tech stack from PRD — skipping file extension validation');
      return result;
    }

    // Extract files from the artifact
    const files = extractFilesFromArtifact(artifactContent);
    result.filesChecked = files.length;

    if (files.length === 0) {
      result.warnings.push('No files extracted from output — nothing to validate');
      return result;
    }

    // Build the banned extensions list
    const bannedExtensions = new Set<string>();
    const bannedConfigs = new Set<string>();
    for (const stack of detectedStacks) {
      const wrongExts = WRONG_STACK_FILES[stack] || [];
      wrongExts.forEach((ext) => bannedExtensions.add(ext));
      const wrongConfigs = WRONG_STACK_CONFIGS[stack] || [];
      wrongConfigs.forEach((cfg) => bannedConfigs.add(cfg));
    }

    // Check each file
    for (const file of files) {
      const ext = OutputValidator.getExtension(file.filePath);
      const filename = file.filePath.split('/').pop() || '';

      // Check for wrong-stack extensions
      if (bannedExtensions.has(ext)) {
        result.errors.push(
          `File "${file.filePath}" has extension "${ext}" which doesn't match the ${detectedStacks.join('+')} stack`
        );
        result.rejectedFiles.push(file.filePath);
        result.valid = false;
      }

      // Check for wrong-stack config files
      if (bannedConfigs.has(filename)) {
        result.errors.push(
          `File "${filename}" is a ${OutputValidator.guessLanguage(filename)} config file — doesn't belong in a ${detectedStacks.join('+')} project`
        );
        result.rejectedFiles.push(file.filePath);
        result.valid = false;
      }

      // Check for empty files
      if (file.content.trim().length === 0) {
        result.warnings.push(`File "${file.filePath}" is empty`);
      }

      // Check for placeholder content
      if (file.content.includes('TODO') || file.content.includes('FIXME') || file.content.includes('implement later')) {
        result.warnings.push(`File "${file.filePath}" contains placeholder content (TODO/FIXME)`);
      }
    }

    return result;
  }

  /**
   * Detect the tech stack from PRD/context text.
   */
  private static detectStack(text: string): string[] {
    const lower = text.toLowerCase();
    const stacks: string[] = [];

    if (lower.includes('react')) stacks.push('react');
    if (lower.includes('typescript') || lower.includes('.tsx')) stacks.push('typescript');
    if (lower.includes('javascript') && !lower.includes('typescript')) stacks.push('javascript');
    if (lower.includes('vite')) stacks.push('vite');
    if (lower.includes('next.js') || lower.includes('nextjs')) stacks.push('nextjs');
    if (lower.includes('python') || lower.includes('django') || lower.includes('flask') || lower.includes('fastapi')) stacks.push('python');
    if (lower.includes('rust') || lower.includes('cargo')) stacks.push('rust');
    if (lower.includes('golang') || lower.includes(' go ') || lower.includes('go module')) stacks.push('go');

    return stacks;
  }

  private static getExtension(filePath: string): string {
    const parts = filePath.split('.');
    if (parts.length < 2) return '';
    return '.' + parts[parts.length - 1];
  }

  private static guessLanguage(filename: string): string {
    if (filename.includes('requirements') || filename.includes('setup.py') || filename.includes('Pipfile')) return 'Python';
    if (filename.includes('Gemfile')) return 'Ruby';
    if (filename.includes('go.mod')) return 'Go';
    if (filename.includes('Cargo.toml')) return 'Rust';
    if (filename.includes('pom.xml') || filename.includes('build.gradle')) return 'Java';
    return 'unknown';
  }

  /**
   * Filter out rejected files from an artifact, returning the cleaned content.
   */
  static filterRejectedFiles(artifactContent: string, rejectedFiles: string[]): string {
    if (rejectedFiles.length === 0) return artifactContent;

    let cleaned = artifactContent;
    for (const filePath of rejectedFiles) {
      // Remove code blocks that reference the rejected file
      const escaped = filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Match: heading with filename, then code block
      const pattern = new RegExp(
        `(?:###?\\s*[^\\n]*${escaped}[^\\n]*\\n+)?` +
        `\`\`\`[^\\n]*\\n[\\s\\S]*?\`\`\`\\n*`,
        'g'
      );
      cleaned = cleaned.replace(pattern, `<!-- REMOVED: ${filePath} (wrong tech stack) -->\n`);
    }
    return cleaned;
  }
}
