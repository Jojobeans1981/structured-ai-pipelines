import { type ProjectType } from '@/src/types/dag';
import { DependencyResolver } from '@/src/services/dependency-resolver';

interface GeneratedFile {
  filePath: string;
  content: string;
  language: string;
  reason: string;
}

export interface CompletenessResult {
  files: GeneratedFile[];
  report: string;
}

function isGodotProject(files: Array<{ filePath: string }>): boolean {
  return files.some((f) =>
    f.filePath === 'project.godot' ||
    f.filePath.endsWith('.tscn') ||
    f.filePath.endsWith('.gd') ||
    f.filePath.startsWith('addons/')
  );
}

function isUnityProject(files: Array<{ filePath: string }>): boolean {
  return files.some((f) =>
    f.filePath.startsWith('Assets/') ||
    f.filePath.startsWith('ProjectSettings/') ||
    f.filePath.endsWith('.unity') ||
    f.filePath.endsWith('.asmdef') ||
    f.filePath.endsWith('.meta')
  );
}

function isUnrealProject(files: Array<{ filePath: string }>): boolean {
  return files.some((f) =>
    f.filePath.endsWith('.uproject') ||
    f.filePath.startsWith('Config/') ||
    f.filePath.startsWith('Content/') ||
    f.filePath.startsWith('Source/')
  );
}

export function detectProjectType(files: Array<{ filePath: string }>): ProjectType {
  if (isGodotProject(files)) return 'godot';
  if (isUnityProject(files)) return 'unity';
  if (isUnrealProject(files)) return 'unreal';
  if (files.some((f) => f.filePath === 'package.json')) return 'node';
  if (files.some((f) => f.filePath === 'requirements.txt' || f.filePath === 'pyproject.toml')) return 'python';
  if (files.some((f) => f.filePath === 'go.mod')) return 'go';
  if (files.some((f) => f.filePath === 'index.html')) return 'static';
  // Infer node if JS/TS source files exist even without package.json
  if (files.some((f) => /\.(tsx?|jsx?)$/.test(f.filePath))) return 'node';
  return 'unknown';
}

export class CompletenessPass {
  private static readonly NON_NPM_RUNTIME_PACKAGES = new Set([
    'godot',
    'unity',
    'unreal',
    'unreal-engine',
    'gamemaker',
    'game-maker',
  ]);

  /**
   * Scan project files and generate any missing critical scaffolding.
   */
  static run(
    projectFiles: Array<{ filePath: string; content: string }>,
    projectType: ProjectType
  ): CompletenessResult {
    const files: GeneratedFile[] = [];
    const existing = new Set(projectFiles.map((f) => f.filePath));
    const reportLines: string[] = [];

    if (projectType === 'node' || projectType === 'unknown') {
      // Check for JS/TS files to confirm this is a node project
      const hasJsTs = projectFiles.some((f) => /\.(tsx?|jsx?)$/.test(f.filePath));
      if (!hasJsTs && projectType === 'unknown') {
        return { files: [], report: 'No JS/TS files found — completeness pass skipped.\n' };
      }

      // 0. Repair broken package.json (invalid JSON)
      const repairResult = CompletenessPass.repairPackageJson(projectFiles, existing);
      if (repairResult) {
        files.push(repairResult);
        reportLines.push(`- Repaired \`package.json\` (${repairResult.reason})`);
        // Update existing set so checkPackageJson doesn't try to create a new one
        // and reconcile sees the repaired version
        existing.add('package.json');
      }

      // 1. package.json
      const pkgResult = CompletenessPass.checkPackageJson(projectFiles, existing);
      if (pkgResult) {
        files.push(pkgResult);
        reportLines.push(`- Generated \`package.json\` (${pkgResult.reason})`);
      }

      // 2. Reconcile existing package.json dependencies
      const reconcileResult = CompletenessPass.reconcilePackageJson(projectFiles, existing);
      if (reconcileResult) {
        files.push(reconcileResult);
        reportLines.push(`- Updated \`package.json\` (${reconcileResult.reason})`);
      }

      // 3. tsconfig.json
      const tsResult = CompletenessPass.checkTsConfig(projectFiles, existing);
      if (tsResult) {
        files.push(tsResult);
        reportLines.push(`- Generated \`tsconfig.json\` (${tsResult.reason})`);
      }

      // 4. Vite config
      const viteResult = CompletenessPass.checkViteConfig(projectFiles, existing);
      if (viteResult) {
        files.push(viteResult);
        reportLines.push(`- Generated \`vite.config.ts\` (${viteResult.reason})`);
      }

      // 5. Entry points
      const entryResults = CompletenessPass.checkEntryPoints(projectFiles, existing);
      for (const entry of entryResults) {
        files.push(entry);
        reportLines.push(`- Generated \`${entry.filePath}\` (${entry.reason})`);
      }

      // 6. Tailwind config
      const tailwindResult = CompletenessPass.checkTailwindConfig(projectFiles, existing);
      if (tailwindResult) {
        files.push(tailwindResult);
        reportLines.push(`- Generated \`tailwind.config.js\` (${tailwindResult.reason})`);
      }

      // 7. PostCSS config
      const postcssResult = CompletenessPass.checkPostCssConfig(projectFiles, existing);
      if (postcssResult) {
        files.push(postcssResult);
        reportLines.push(`- Generated \`postcss.config.js\` (${postcssResult.reason})`);
      }
    }

    if (projectType === 'godot' || projectType === 'unity' || projectType === 'unreal') {
      reportLines.push(`- Detected \`${projectType}\` engine project; skipped Node/Vite scaffolding and preserved engine runtime layout`);
    }

    // 8. .env.example (all project types)
    const envResult = CompletenessPass.checkEnvExample(projectFiles, existing);
    if (envResult) {
      files.push(envResult);
      reportLines.push(`- Generated \`.env.example\` (${envResult.reason})`);
    }

    // 9. .gitignore
    const gitignoreResult = CompletenessPass.checkGitignore(projectFiles, existing, projectType);
    if (gitignoreResult) {
      files.push(gitignoreResult);
      reportLines.push(`- Generated \`.gitignore\``);
    }

    const report = files.length > 0
      ? `**Scaffolded ${files.length} missing file(s):**\n${reportLines.join('\n')}\n\n`
      : 'All critical scaffolding files present.\n\n';

    return { files, report };
  }

  private static normalizeNodePackageJson(
    pkg: Record<string, unknown>,
    projectFiles: Array<{ filePath: string; content: string }>
  ): { pkg: Record<string, unknown>; changed: boolean; reasons: string[] } {
    const dependencies = { ...((pkg.dependencies || {}) as Record<string, string>) };
    const devDependencies = { ...((pkg.devDependencies || {}) as Record<string, string>) };
    const scripts = { ...((pkg.scripts || {}) as Record<string, string>) };
    const reasons: string[] = [];
    let changed = false;

    const hasReactFiles = projectFiles.some(
      (f) => f.filePath.endsWith('.tsx') || f.content.includes("from 'react'") || f.content.includes('from "react"')
    );
    const hasViteConfig = projectFiles.some((f) => /^vite\.config\.(ts|js|mjs)$/.test(f.filePath));
    const hasNextConfig = projectFiles.some((f) => /^next\.config\.(ts|js|mjs)$/.test(f.filePath));
    const isViteProject = !hasNextConfig && (hasViteConfig || !!dependencies.react || !!devDependencies.vite || scripts.dev === 'vite');

    const setDep = (
      bucket: Record<string, string>,
      packageName: string,
      version: string,
      reason: string
    ) => {
      if (bucket[packageName] !== version) {
        bucket[packageName] = version;
        changed = true;
        if (!reasons.includes(reason)) reasons.push(reason);
      }
    };

    const removeUnsupportedPackages = (bucket: Record<string, string>) => {
      for (const packageName of Object.keys(bucket)) {
        if (CompletenessPass.NON_NPM_RUNTIME_PACKAGES.has(packageName)) {
          delete bucket[packageName];
          changed = true;
          if (!reasons.includes('removed unsupported non-npm runtime packages')) {
            reasons.push('removed unsupported non-npm runtime packages');
          }
        }
      }
    };

    removeUnsupportedPackages(dependencies);
    removeUnsupportedPackages(devDependencies);

    if (hasReactFiles || dependencies.react || dependencies['react-dom']) {
      setDep(dependencies, 'react', '^18.3.1', 'aligned React runtime versions');
      setDep(dependencies, 'react-dom', '^18.3.1', 'aligned React runtime versions');
      setDep(devDependencies, '@types/react', '^18.3.12', 'aligned React type packages');
      setDep(devDependencies, '@types/react-dom', '^18.3.1', 'aligned React type packages');
    }

    if (isViteProject) {
      setDep(devDependencies, 'vite', '^5.4.14', 'aligned Vite toolchain versions');
      setDep(devDependencies, '@vitejs/plugin-react', '^4.3.4', 'aligned Vite toolchain versions');

      if (!scripts.dev || scripts.dev.includes('--hostname')) {
        scripts.dev = 'vite';
        changed = true;
        if (!reasons.includes('normalized Vite scripts')) reasons.push('normalized Vite scripts');
      }
      if (!scripts.build) {
        scripts.build = 'vite build';
        changed = true;
        if (!reasons.includes('added missing Vite scripts')) reasons.push('added missing Vite scripts');
      }
      if (!scripts.preview) {
        scripts.preview = 'vite preview';
        changed = true;
        if (!reasons.includes('added missing Vite scripts')) reasons.push('added missing Vite scripts');
      }
    }

    if (devDependencies['@testing-library/react']) {
      setDep(devDependencies, '@testing-library/react', '^16.3.0', 'aligned React testing packages');
      setDep(devDependencies, '@testing-library/jest-dom', '^6.6.3', 'aligned React testing packages');
      setDep(devDependencies, 'jsdom', '^25.0.1', 'aligned React testing packages');
      setDep(devDependencies, 'vitest', '^2.1.8', 'aligned React testing packages');
    }

    if (!(pkg as { type?: string }).type) {
      pkg.type = 'module';
      changed = true;
      if (!reasons.includes('set package type to module')) reasons.push('set package type to module');
    }

    pkg.dependencies = Object.fromEntries(Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b)));
    pkg.devDependencies = Object.fromEntries(Object.entries(devDependencies).sort(([a], [b]) => a.localeCompare(b)));
    pkg.scripts = scripts;

    return { pkg, changed, reasons };
  }

  /**
   * If package.json exists but is invalid JSON, attempt to repair it.
   * Tries to extract what it can, then regenerates from imports.
   */
  private static repairPackageJson(
    projectFiles: Array<{ filePath: string; content: string }>,
    existing: Set<string>
  ): GeneratedFile | null {
    if (!existing.has('package.json')) return null;

    const pkgFile = projectFiles.find((f) => f.filePath === 'package.json');
    if (!pkgFile) return null;

    // Try to parse — if valid, no repair needed
    try {
      JSON.parse(pkgFile.content);
      return null;
    } catch {
      // Invalid JSON — regenerate from imports
    }

    // Try to salvage the name from the broken JSON
    const nameMatch = pkgFile.content.match(/"name"\s*:\s*"([^"]+)"/);
    const projectName = nameMatch ? nameMatch[1] : 'generated-project';

    // Resolve deps from source files
    const resolution = DependencyResolver.resolve(projectFiles, 'node');
    const deps = DependencyResolver.buildDepsObject(resolution.dependencies);
    const devDeps = DependencyResolver.buildDepsObject(resolution.devDependencies);

    // Detect framework
    const hasReact = resolution.dependencies.some((d) => d.packageName === 'react');
    const hasVite = resolution.devDependencies.some((d) => d.packageName === 'vite');
    const hasNext = resolution.dependencies.some((d) => d.packageName === 'next');
    const hasExpress = resolution.dependencies.some((d) => d.packageName === 'express');

    let scripts: Record<string, string>;
    if (hasNext) {
      scripts = { dev: 'next dev', build: 'next build', start: 'next start' };
    } else if (hasVite || hasReact) {
      scripts = { dev: 'vite', build: 'vite build', preview: 'vite preview' };
      if (!devDeps['vite']) devDeps['vite'] = '^5.4.14';
      if (!devDeps['@vitejs/plugin-react']) devDeps['@vitejs/plugin-react'] = '^4.3.4';
    } else if (hasExpress) {
      scripts = { dev: 'tsx watch src/index.ts', build: 'tsc', start: 'node dist/index.js' };
    } else {
      scripts = { dev: 'vite', build: 'vite build', preview: 'vite preview' };
      if (!devDeps['vite']) devDeps['vite'] = '^5.4.14';
    }

    let pkg: Record<string, unknown> = {
      name: projectName,
      private: true,
      version: '0.0.1',
      type: 'module',
      scripts,
      dependencies: deps,
      devDependencies: devDeps,
    };
    const normalized = CompletenessPass.normalizeNodePackageJson(pkg, projectFiles);
    pkg = normalized.pkg;

    return {
      filePath: 'package.json',
      content: JSON.stringify(pkg, null, 2),
      language: 'json',
      reason: 'existing package.json was invalid JSON — regenerated from imports',
    };
  }

  private static checkPackageJson(
    projectFiles: Array<{ filePath: string; content: string }>,
    existing: Set<string>
  ): GeneratedFile | null {
    if (existing.has('package.json')) return null;

    const hasJsTs = projectFiles.some((f) => /\.(tsx?|jsx?)$/.test(f.filePath));
    if (!hasJsTs) return null;

    // Resolve dependencies from imports
    const resolution = DependencyResolver.resolve(projectFiles, 'node');
    const deps = DependencyResolver.buildDepsObject(resolution.dependencies);
    const devDeps = DependencyResolver.buildDepsObject(resolution.devDependencies);

    // Detect framework for scripts
    const hasReact = resolution.dependencies.some((d) => d.packageName === 'react');
    const hasVite = resolution.dependencies.some((d) => d.packageName === 'vite') ||
                    resolution.devDependencies.some((d) => d.packageName === 'vite');
    const hasNext = resolution.dependencies.some((d) => d.packageName === 'next');
    const hasExpress = resolution.dependencies.some((d) => d.packageName === 'express');

    let scripts: Record<string, string>;
    if (hasNext) {
      scripts = { dev: 'next dev', build: 'next build', start: 'next start', lint: 'next lint' };
    } else if (hasVite || hasReact) {
      scripts = { dev: 'vite', build: 'vite build', preview: 'vite preview' };
      // Ensure vite is in devDeps
      if (!devDeps['vite']) devDeps['vite'] = '^5.4.14';
      if (!devDeps['@vitejs/plugin-react']) devDeps['@vitejs/plugin-react'] = '^4.3.4';
    } else if (hasExpress) {
      scripts = { dev: 'tsx watch src/index.ts', build: 'tsc', start: 'node dist/index.js' };
    } else {
      scripts = { dev: 'vite', build: 'vite build', preview: 'vite preview' };
      if (!devDeps['vite']) devDeps['vite'] = '^5.4.14';
    }

    let pkg: Record<string, unknown> = {
      name: 'generated-project',
      private: true,
      version: '0.0.1',
      type: 'module',
      scripts,
      dependencies: deps,
      devDependencies: devDeps,
    };
    const normalized = CompletenessPass.normalizeNodePackageJson(pkg, projectFiles);
    pkg = normalized.pkg;

    return {
      filePath: 'package.json',
      content: JSON.stringify(pkg, null, 2),
      language: 'json',
      reason: `${resolution.dependencies.length} deps inferred from imports`,
    };
  }

  private static reconcilePackageJson(
    projectFiles: Array<{ filePath: string; content: string }>,
    existing: Set<string>
  ): GeneratedFile | null {
    if (!existing.has('package.json')) return null;

    const pkgFile = projectFiles.find((f) => f.filePath === 'package.json');
    if (!pkgFile) return null;

    let pkg: Record<string, unknown>;
    try {
      pkg = JSON.parse(pkgFile.content);
    } catch {
      return null;
    }

    const resolution = DependencyResolver.resolve(projectFiles, 'node');
    if (resolution.missingFromPackageJson.length === 0) return null;

    // Merge missing deps
    const currentDeps = (pkg.dependencies || {}) as Record<string, string>;
    const currentDevDeps = (pkg.devDependencies || {}) as Record<string, string>;

    let added = 0;
    for (const dep of resolution.dependencies) {
      if (!currentDeps[dep.packageName] && !currentDevDeps[dep.packageName]) {
        currentDeps[dep.packageName] = dep.suggestedVersion;
        added++;
      }
    }
    for (const dep of resolution.devDependencies) {
      if (!currentDeps[dep.packageName] && !currentDevDeps[dep.packageName]) {
        currentDevDeps[dep.packageName] = dep.suggestedVersion;
        added++;
      }
    }

    if (added === 0) return null;

    const normalized = CompletenessPass.normalizeNodePackageJson(pkg, projectFiles);
    pkg = normalized.pkg;

    // Sort keys
    const sortObj = (obj: Record<string, string>) =>
      Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));

    pkg.dependencies = sortObj((pkg.dependencies || {}) as Record<string, string>);
    pkg.devDependencies = sortObj((pkg.devDependencies || {}) as Record<string, string>);

    // Ensure scripts exist
    const scripts = (pkg.scripts || {}) as Record<string, string>;
    if (!scripts.dev && !scripts.start) {
      if (currentDeps['next']) {
        scripts.dev = 'next dev';
        scripts.build = 'next build';
        scripts.start = 'next start';
      } else if (currentDeps['vite'] || currentDevDeps['vite']) {
        scripts.dev = 'vite';
        scripts.build = 'vite build';
        scripts.preview = 'vite preview';
      }
      pkg.scripts = scripts;
    }

    return {
      filePath: 'package.json',
      content: JSON.stringify(pkg, null, 2),
      language: 'json',
      reason: normalized.changed
        ? `added ${added} missing dependencies and normalized framework versions`
        : `added ${added} missing dependencies`,
    };
  }

  private static checkTsConfig(
    projectFiles: Array<{ filePath: string; content: string }>,
    existing: Set<string>
  ): GeneratedFile | null {
    if (existing.has('tsconfig.json')) return null;

    const hasTs = projectFiles.some((f) => f.filePath.endsWith('.ts') || f.filePath.endsWith('.tsx'));
    if (!hasTs) return null;

    const hasTsx = projectFiles.some((f) => f.filePath.endsWith('.tsx'));
    const hasPathAlias = projectFiles.some((f) => f.content.includes("from '@/"));

    const config: Record<string, unknown> = {
      compilerOptions: {
        target: 'ES2020',
        useDefineForClassFields: true,
        lib: ['ES2020', 'DOM', 'DOM.Iterable'],
        module: 'ESNext',
        skipLibCheck: true,
        moduleResolution: 'bundler',
        allowImportingTsExtensions: true,
        isolatedModules: true,
        moduleDetection: 'force',
        noEmit: true,
        strict: true,
        noUnusedLocals: false,
        noUnusedParameters: false,
        noFallthroughCasesInSwitch: true,
        ...(hasTsx ? { jsx: 'react-jsx' } : {}),
        ...(hasPathAlias ? { baseUrl: '.', paths: { '@/*': ['./src/*'] } } : {}),
      },
      include: ['src'],
    };

    return {
      filePath: 'tsconfig.json',
      content: JSON.stringify(config, null, 2),
      language: 'json',
      reason: 'TypeScript files found but no tsconfig.json',
    };
  }

  private static checkViteConfig(
    projectFiles: Array<{ filePath: string; content: string }>,
    existing: Set<string>
  ): GeneratedFile | null {
    if (existing.has('vite.config.ts') || existing.has('vite.config.js')) return null;

    // Only generate if React project without Next.js
    const hasReact = projectFiles.some((f) => f.content.includes("from 'react'") || f.content.includes('from "react"'));
    const hasNext = projectFiles.some((f) => f.filePath === 'next.config.js' || f.filePath === 'next.config.ts' || f.filePath === 'next.config.mjs');
    if (!hasReact || hasNext) return null;

    const hasPathAlias = projectFiles.some((f) => f.content.includes("from '@/"));

    let config = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
`;

    if (hasPathAlias) {
      config += `import path from 'path';
`;
    }

    config += `
export default defineConfig({
  plugins: [react()],`;

    if (hasPathAlias) {
      config += `
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },`;
    }

    config += `
});
`;

    return {
      filePath: 'vite.config.ts',
      content: config,
      language: 'typescript',
      reason: 'React project detected without bundler config',
    };
  }

  private static checkEntryPoints(
    projectFiles: Array<{ filePath: string; content: string }>,
    existing: Set<string>
  ): GeneratedFile[] {
    const results: GeneratedFile[] = [];

    const hasReact = projectFiles.some(
      (f) => f.content.includes("from 'react'") || f.content.includes('from "react"') || f.filePath.endsWith('.tsx')
    );
    const hasNext = projectFiles.some(
      (f) => f.filePath.startsWith('app/') || f.filePath.startsWith('pages/')
    );

    // Next.js handles its own entry points
    if (hasNext) return results;

    if (!hasReact) return results;

    // Check for main.tsx / main.ts
    const mainFiles = ['src/main.tsx', 'src/main.ts', 'src/main.jsx', 'src/main.js', 'src/index.tsx', 'src/index.ts'];
    const hasMain = mainFiles.some((f) => existing.has(f));

    if (!hasMain) {
      // Find the App component to import
      const appFile = projectFiles.find(
        (f) => f.filePath.match(/src\/(App|app)\.(tsx?|jsx?)$/)
      );
      const appImport = appFile ? appFile.filePath.replace(/^src\//, './').replace(/\.\w+$/, '') : './App';
      const hasCss = projectFiles.some((f) => f.filePath === 'src/index.css' || f.filePath === 'src/globals.css');
      const cssFile = projectFiles.find((f) => f.filePath === 'src/index.css' || f.filePath === 'src/globals.css');
      const cssImport = cssFile ? `./${cssFile.filePath.replace(/^src\//, '')}` : null;

      results.push({
        filePath: 'src/main.tsx',
        content: `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
${cssImport ? `import '${cssImport}';\n` : ''}import App from '${appImport}';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
`,
        language: 'typescript',
        reason: 'React project missing entry point',
      });
    }

    // Check for index.html (Vite needs this at root)
    if (!existing.has('index.html')) {
      const mainEntry = existing.has('src/main.tsx') || results.some((f) => f.filePath === 'src/main.tsx')
        ? '/src/main.tsx'
        : existing.has('src/main.ts')
          ? '/src/main.ts'
          : '/src/main.tsx';

      results.push({
        filePath: 'index.html',
        content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="${mainEntry}"></script>
  </body>
</html>
`,
        language: 'html',
        reason: 'Vite project requires index.html at root',
      });
    }

    return results;
  }

  private static checkTailwindConfig(
    projectFiles: Array<{ filePath: string; content: string }>,
    existing: Set<string>
  ): GeneratedFile | null {
    if (existing.has('tailwind.config.js') || existing.has('tailwind.config.ts')) return null;

    const hasTailwind = projectFiles.some(
      (f) => f.content.includes('@tailwind') || f.content.includes('tailwindcss')
    );
    if (!hasTailwind) return null;

    return {
      filePath: 'tailwind.config.js',
      content: `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
`,
      language: 'javascript',
      reason: 'Tailwind CSS directives found but no config',
    };
  }

  private static checkPostCssConfig(
    projectFiles: Array<{ filePath: string; content: string }>,
    existing: Set<string>
  ): GeneratedFile | null {
    if (existing.has('postcss.config.js') || existing.has('postcss.config.cjs') || existing.has('postcss.config.mjs')) return null;

    const hasTailwind = projectFiles.some(
      (f) => f.content.includes('@tailwind') || f.content.includes('tailwindcss')
    );
    if (!hasTailwind) return null;

    return {
      filePath: 'postcss.config.js',
      content: `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`,
      language: 'javascript',
      reason: 'Tailwind requires PostCSS config',
    };
  }

  private static checkEnvExample(
    projectFiles: Array<{ filePath: string; content: string }>,
    existing: Set<string>
  ): GeneratedFile | null {
    if (existing.has('.env.example')) return null;

    const envVars = new Set<string>();

    for (const file of projectFiles) {
      // process.env.VARIABLE_NAME
      const processEnvMatches = file.content.matchAll(/process\.env\.(\w+)/g);
      for (const match of processEnvMatches) {
        envVars.add(match[1]);
      }

      // import.meta.env.VARIABLE_NAME
      const importMetaMatches = file.content.matchAll(/import\.meta\.env\.(\w+)/g);
      for (const match of importMetaMatches) {
        envVars.add(match[1]);
      }
    }

    // Filter out standard vars
    const skip = new Set(['NODE_ENV', 'DEV', 'PROD', 'SSR', 'MODE', 'BASE_URL']);
    const vars = Array.from(envVars).filter((v) => !skip.has(v)).sort();

    if (vars.length === 0) return null;

    let content = '# Environment Variables\n';
    content += '# Copy this file to .env and fill in the values\n\n';

    const viteVars = vars.filter((v) => v.startsWith('VITE_'));
    const serverVars = vars.filter((v) => !v.startsWith('VITE_'));

    if (serverVars.length > 0) {
      content += '# Server-side\n';
      for (const v of serverVars) {
        content += `${v}=\n`;
      }
      content += '\n';
    }

    if (viteVars.length > 0) {
      content += '# Client-side (exposed to browser)\n';
      for (const v of viteVars) {
        content += `${v}=\n`;
      }
    }

    return {
      filePath: '.env.example',
      content,
      language: 'bash',
      reason: `${vars.length} environment variables referenced in code`,
    };
  }

  private static checkGitignore(
    projectFiles: Array<{ filePath: string; content: string }>,
    existing: Set<string>,
    projectType: ProjectType
  ): GeneratedFile | null {
    if (existing.has('.gitignore')) return null;

    let content = `# Dependencies
node_modules/

# Build output
dist/
build/
.next/

# Environment
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*

# Coverage
coverage/
`;

    if (projectType === 'python') {
      content += `
# Python
__pycache__/
*.pyc
.venv/
venv/
.pytest_cache/
*.egg-info/
`;
    }

    if (projectType === 'godot') {
      content += `
# Godot
.godot/
.import/
export_presets.cfg
`;
    }

    if (projectType === 'unity') {
      content += `
# Unity
[Ll]ibrary/
[Tt]emp/
[Oo]bj/
[Bb]uild/
[Bb]uilds/
[Ll]ogs/
[Uu]ser[Ss]ettings/
.vs/
`;
    }

    if (projectType === 'unreal') {
      content += `
# Unreal Engine
Binaries/
DerivedDataCache/
Intermediate/
Saved/
`;
    }

    return {
      filePath: '.gitignore',
      content,
      language: 'plaintext',
      reason: 'standard gitignore for generated projects',
    };
  }
}
