import { type ProjectType } from '@/src/types/dag';

interface ResolvedDependency {
  packageName: string;
  importedFrom: string[];
  isDev: boolean;
  suggestedVersion: string;
}

export interface DependencyResolution {
  dependencies: ResolvedDependency[];
  devDependencies: ResolvedDependency[];
  missingFromPackageJson: string[];
  report: string;
}

// Well-known versions for common packages
const KNOWN_VERSIONS: Record<string, string> = {
  react: '^18.3.1',
  'react-dom': '^18.3.1',
  'react-router-dom': '^6.28.0',
  '@tanstack/react-query': '^5.60.0',
  tailwindcss: '^3.4.0',
  zustand: '^5.0.0',
  axios: '^1.7.0',
  zod: '^3.23.0',
  'lucide-react': '^0.460.0',
  'class-variance-authority': '^0.7.0',
  clsx: '^2.1.0',
  'tailwind-merge': '^2.5.0',
  'framer-motion': '^11.11.0',
  'date-fns': '^4.1.0',
  next: '^14.2.0',
  express: '^4.21.0',
  fastify: '^5.1.0',
  vite: '^6.0.0',
  '@vitejs/plugin-react': '^4.3.0',
  typescript: '^5.6.0',
  postcss: '^8.4.0',
  autoprefixer: '^10.4.0',
  vitest: '^2.1.0',
  jsdom: '^25.0.0',
  '@testing-library/react': '^16.0.0',
  '@testing-library/jest-dom': '^6.6.0',
  eslint: '^9.14.0',
  prettier: '^3.4.0',
  '@types/react': '^18.3.0',
  '@types/react-dom': '^18.3.0',
  '@types/node': '^22.9.0',
  '@types/express': '^5.0.0',
};

// Packages that imply other packages
const IMPLICIT_DEPS: Record<string, string[]> = {
  react: ['react-dom'],
  tailwindcss: ['postcss', 'autoprefixer'],
  vite: ['@vitejs/plugin-react'],
  next: ['react', 'react-dom'],
  '@radix-ui/react-slot': ['react', 'react-dom'],
};

// Dev dependency patterns
const DEV_PATTERNS = [
  /^@types\//,
  /^vitest$/,
  /^eslint/,
  /^prettier$/,
  /^@testing-library\//,
  /^typescript$/,
  /^postcss$/,
  /^autoprefixer$/,
  /^@vitejs\//,
  /^jsdom$/,
  /^tailwindcss$/,
];

export class DependencyResolver {
  /**
   * Scan project files, extract imports, and return all required npm packages.
   */
  static resolve(
    projectFiles: Array<{ filePath: string; content: string }>,
    projectType: ProjectType
  ): DependencyResolution {
    if (projectType !== 'node') {
      return { dependencies: [], devDependencies: [], missingFromPackageJson: [], report: '' };
    }

    // Collect all imports across all files
    const packageImports = new Map<string, Set<string>>(); // packageName -> set of files importing it

    for (const file of projectFiles) {
      if (!file.filePath.match(/\.(tsx?|jsx?|mjs|cjs)$/)) continue;

      const imports = DependencyResolver.extractImports(file.content);
      for (const imp of imports) {
        if (DependencyResolver.isLocalImport(imp)) continue;
        const pkgName = DependencyResolver.getPackageName(imp);
        if (!pkgName) continue;
        // Skip node built-ins
        if (DependencyResolver.isNodeBuiltin(pkgName)) continue;

        if (!packageImports.has(pkgName)) {
          packageImports.set(pkgName, new Set());
        }
        packageImports.get(pkgName)!.add(file.filePath);
      }
    }

    // Add implicit dependencies
    const allPackages = new Set(packageImports.keys());
    for (const [pkg, impliedPkgs] of Object.entries(IMPLICIT_DEPS)) {
      if (allPackages.has(pkg)) {
        for (const implied of impliedPkgs) {
          if (!packageImports.has(implied)) {
            packageImports.set(implied, new Set([`(implicit from ${pkg})`]));
          }
        }
      }
    }

    // Detect framework-specific deps from file patterns
    DependencyResolver.detectFrameworkDeps(projectFiles, packageImports);

    // Classify as dep vs devDep
    const dependencies: ResolvedDependency[] = [];
    const devDependencies: ResolvedDependency[] = [];

    for (const [pkgName, files] of packageImports) {
      const isDev = DEV_PATTERNS.some((p) => p.test(pkgName));
      const entry: ResolvedDependency = {
        packageName: pkgName,
        importedFrom: Array.from(files),
        isDev,
        suggestedVersion: KNOWN_VERSIONS[pkgName] || 'latest',
      };
      if (isDev) {
        devDependencies.push(entry);
      } else {
        dependencies.push(entry);
      }
    }

    // Check against existing package.json
    const pkgFile = projectFiles.find((f) => f.filePath === 'package.json');
    const missingFromPackageJson = DependencyResolver.auditPackageJson(
      pkgFile?.content || null,
      [...dependencies, ...devDependencies]
    );

    // Build report
    let report = '';
    if (missingFromPackageJson.length > 0) {
      report += `**Missing from package.json:** ${missingFromPackageJson.join(', ')}\n`;
    }
    report += `**Dependencies found:** ${dependencies.length} runtime, ${devDependencies.length} dev\n`;

    return { dependencies, devDependencies, missingFromPackageJson, report };
  }

  /**
   * Build a complete package.json dependencies object from resolved deps.
   */
  static buildDepsObject(deps: ResolvedDependency[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (const dep of deps.sort((a, b) => a.packageName.localeCompare(b.packageName))) {
      result[dep.packageName] = dep.suggestedVersion;
    }
    return result;
  }

  /**
   * Extract import specifiers from file content.
   */
  private static extractImports(content: string): string[] {
    const imports: string[] = [];

    // ES imports: import ... from 'specifier'
    const esImports = content.matchAll(/(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g);
    for (const match of esImports) {
      imports.push(match[1]);
    }

    // require('specifier')
    const requireImports = content.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
    for (const match of requireImports) {
      imports.push(match[1]);
    }

    // Dynamic import('specifier')
    const dynamicImports = content.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
    for (const match of dynamicImports) {
      imports.push(match[1]);
    }

    return imports;
  }

  private static isLocalImport(specifier: string): boolean {
    return specifier.startsWith('.') || specifier.startsWith('/');
  }

  /**
   * Extract the npm package name from an import specifier.
   * '@scope/pkg/deep' -> '@scope/pkg'
   * 'lodash/merge' -> 'lodash'
   */
  private static getPackageName(specifier: string): string {
    if (specifier.startsWith('@')) {
      const parts = specifier.split('/');
      return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;
    }
    return specifier.split('/')[0];
  }

  private static isNodeBuiltin(pkgName: string): boolean {
    const builtins = new Set([
      'assert', 'buffer', 'child_process', 'cluster', 'console', 'constants',
      'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http', 'http2',
      'https', 'module', 'net', 'os', 'path', 'perf_hooks', 'process',
      'punycode', 'querystring', 'readline', 'repl', 'stream', 'string_decoder',
      'sys', 'timers', 'tls', 'tty', 'url', 'util', 'v8', 'vm', 'worker_threads',
      'zlib', 'node:fs', 'node:path', 'node:url', 'node:crypto', 'node:http',
      'node:https', 'node:stream', 'node:util', 'node:os', 'node:child_process',
      'node:events', 'node:buffer', 'node:net', 'node:tls', 'node:dns',
      'node:readline', 'node:zlib', 'node:worker_threads', 'node:timers',
    ]);
    return builtins.has(pkgName);
  }

  /**
   * Detect framework-specific dependencies from file contents and structure.
   */
  private static detectFrameworkDeps(
    projectFiles: Array<{ filePath: string; content: string }>,
    packageImports: Map<string, Set<string>>
  ): void {
    const hasReact = packageImports.has('react');
    const hasTsx = projectFiles.some((f) => f.filePath.endsWith('.tsx'));
    const hasTs = projectFiles.some((f) => f.filePath.endsWith('.ts') || f.filePath.endsWith('.tsx'));

    // If tsx files exist but react not imported (common LLM omission), add it
    if (hasTsx && !hasReact) {
      packageImports.set('react', new Set(['(inferred from .tsx files)']));
      packageImports.set('react-dom', new Set(['(inferred from .tsx files)']));
    }

    // If TypeScript files exist, need typescript
    if (hasTs && !packageImports.has('typescript')) {
      packageImports.set('typescript', new Set(['(inferred from .ts/.tsx files)']));
    }

    // If TypeScript + React, need @types
    if (hasTs && (hasReact || hasTsx)) {
      if (!packageImports.has('@types/react')) {
        packageImports.set('@types/react', new Set(['(inferred from React + TypeScript)']));
      }
      if (!packageImports.has('@types/react-dom')) {
        packageImports.set('@types/react-dom', new Set(['(inferred from React + TypeScript)']));
      }
    }

    // Check for Tailwind usage in CSS files
    const hasTailwind = projectFiles.some(
      (f) => f.content.includes('@tailwind') || f.content.includes('tailwindcss')
    );
    if (hasTailwind && !packageImports.has('tailwindcss')) {
      packageImports.set('tailwindcss', new Set(['(inferred from @tailwind directives)']));
    }

    // Check for Vite config
    const hasViteConfig = projectFiles.some(
      (f) => f.filePath === 'vite.config.ts' || f.filePath === 'vite.config.js'
    );
    if (hasViteConfig && !packageImports.has('vite')) {
      packageImports.set('vite', new Set(['(inferred from vite.config)']));
    }
  }

  /**
   * Check which required packages are missing from package.json.
   */
  private static auditPackageJson(
    packageJsonContent: string | null,
    allPackages: ResolvedDependency[]
  ): string[] {
    if (!packageJsonContent) return allPackages.map((p) => p.packageName);

    try {
      const pkg = JSON.parse(packageJsonContent);
      const declared = new Set([
        ...Object.keys(pkg.dependencies || {}),
        ...Object.keys(pkg.devDependencies || {}),
        ...Object.keys(pkg.peerDependencies || {}),
      ]);

      return allPackages
        .map((p) => p.packageName)
        .filter((name) => !declared.has(name));
    } catch {
      return allPackages.map((p) => p.packageName);
    }
  }
}
