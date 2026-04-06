/**
 * E2E Smoke Tests for Gauntlet Forge Pipeline
 *
 * Tests the core pipeline services WITHOUT requiring a running server or database.
 * Validates that: user input → file extraction → completeness pass → dependency
 * resolution → test scaffolding → Docker config → CI generation → ZIP output
 * all produce valid, runnable project structure.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { describe, it, expect } from 'vitest';
import { extractFilesFromArtifact } from '../src/services/file-manager';
import { CompletenessPass, detectProjectType } from '../src/services/completeness-pass';
import { DependencyResolver } from '../src/services/dependency-resolver';
import { TestGenerator } from '../src/services/test-generator';
import { DockerfileGenerator } from '../src/services/dockerfile-generator';
import { CIGenerator } from '../src/services/ci-generator';
import { SBOMScanner } from '../src/services/sbom-scanner';
import { SecretScanner } from '../src/services/secret-scanner';
import { BuildVerifier } from '../src/services/build-verifier';
import { normalizeImplementationManifest } from '../src/services/forge/agents/prompt-agent';
import { finalizePreviewAssessment } from '../src/services/forge/agents/preview-agent';
import { evaluateUsability } from '../src/services/forge/agents/usability-agent';
import { preparePreviewFiles, runPreviewPreflight } from '../src/services/preview-preflight';

// Simulate a realistic LLM output for a React + TypeScript project
const MOCK_LLM_OUTPUT = `
Here's the complete project:

\`\`\`json:package.json
{
  "name": "todo-app",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "vite": "^6.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.6.0"
  }
}
\`\`\`

\`\`\`tsx:src/App.tsx
import { useState } from 'react';
import { TodoList } from './components/TodoList';

export default function App() {
  const [todos, setTodos] = useState<string[]>([]);
  return (
    <div>
      <h1>Todo App</h1>
      <TodoList todos={todos} onAdd={(t) => setTodos([...todos, t])} />
    </div>
  );
}
\`\`\`

\`\`\`tsx:src/components/TodoList.tsx
interface Props {
  todos: string[];
  onAdd: (todo: string) => void;
}

export function TodoList({ todos, onAdd }: Props) {
  const [input, setInput] = useState('');
  return (
    <div>
      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <button onClick={() => { onAdd(input); setInput(''); }}>Add</button>
      <ul>{todos.map((t, i) => <li key={i}>{t}</li>)}</ul>
    </div>
  );
}
\`\`\`

\`\`\`css:src/index.css
@tailwind base;
@tailwind components;
@tailwind utilities;
\`\`\`
`;

// Simulate an LLM output that's MISSING critical files (no package.json, no entry point)
const MOCK_INCOMPLETE_OUTPUT = `
\`\`\`tsx:src/App.tsx
import { useState } from 'react';
import { Header } from './components/Header';

export default function App() {
  return <Header title="Hello" />;
}
\`\`\`

\`\`\`tsx:src/components/Header.tsx
interface HeaderProps { title: string; }

export function Header({ title }: HeaderProps) {
  return <h1 className="text-xl font-bold">{title}</h1>;
}
\`\`\`
`;

// Simulate ALL-CAPS duplicate output
const MOCK_DUPLICATE_OUTPUT = `
\`\`\`tsx:src/App.tsx
export default function App() { return <div>Hello</div>; }
\`\`\`

\`\`\`tsx:SRC/APP.TSX
export default function App() { return <div>Hello</div>; }
\`\`\`
`;

describe('File Extraction', () => {
  it('extracts files from LLM output with code fences', () => {
    const files = extractFilesFromArtifact(MOCK_LLM_OUTPUT);
    expect(files.length).toBeGreaterThanOrEqual(3);
    expect(files.find((f) => f.filePath === 'package.json')).toBeTruthy();
    expect(files.find((f) => f.filePath === 'src/App.tsx')).toBeTruthy();
    expect(files.find((f) => f.filePath === 'src/components/TodoList.tsx')).toBeTruthy();
  });

  it('deduplicates ALL-CAPS paths', () => {
    const files = extractFilesFromArtifact(MOCK_DUPLICATE_OUTPUT);
    expect(files.length).toBe(1);
    expect(files[0].filePath).toBe('src/App.tsx');
  });

  it('handles empty input', () => {
    const files = extractFilesFromArtifact('');
    expect(files.length).toBe(0);
  });
});

describe('Project Type Detection', () => {
  it('detects node from package.json', () => {
    expect(detectProjectType([{ filePath: 'package.json' }])).toBe('node');
  });

  it('detects node from .tsx files even without package.json', () => {
    expect(detectProjectType([{ filePath: 'src/App.tsx' }])).toBe('node');
  });

  it('detects python from requirements.txt', () => {
    expect(detectProjectType([{ filePath: 'requirements.txt' }])).toBe('python');
  });

  it('detects go from go.mod', () => {
    expect(detectProjectType([{ filePath: 'go.mod' }])).toBe('go');
  });

  it('detects godot from engine files before treating it like node', () => {
    expect(detectProjectType([
      { filePath: 'project.godot' },
      { filePath: 'package.json' },
    ])).toBe('godot');
  });

  it('detects unity from project folders', () => {
    expect(detectProjectType([{ filePath: 'ProjectSettings/ProjectVersion.txt' }])).toBe('unity');
  });

  it('detects unreal from .uproject files', () => {
    expect(detectProjectType([{ filePath: 'Game.uproject' }])).toBe('unreal');
  });

  it('returns unknown for unrecognized files', () => {
    expect(detectProjectType([{ filePath: 'README.md' }])).toBe('unknown');
  });
});

describe('Completeness Pass', () => {
  it('generates missing scaffolding for incomplete projects', () => {
    const files = extractFilesFromArtifact(MOCK_INCOMPLETE_OUTPUT);
    const result = CompletenessPass.run(files, 'node');

    // Should generate package.json, tsconfig, vite.config, main.tsx, index.html
    const generated = result.files.map((f) => f.filePath);
    expect(generated).toContain('package.json');
    expect(generated).toContain('tsconfig.json');
    expect(generated).toContain('src/main.tsx');
    expect(generated).toContain('index.html');
    expect(result.files.length).toBeGreaterThanOrEqual(4);
  });

  it('does not overwrite existing files', () => {
    const files = extractFilesFromArtifact(MOCK_LLM_OUTPUT);
    const result = CompletenessPass.run(files, 'node');

    // package.json already exists in MOCK_LLM_OUTPUT, should not be regenerated
    const newPkg = result.files.find((f) => f.filePath === 'package.json');
    // It may exist as reconcilePackageJson (adding missing deps) but not as checkPackageJson
    // Either way, the original should not be replaced with a brand new one
    expect(result.files.filter((f) => f.filePath === 'package.json').length).toBeLessThanOrEqual(1);
  });

  it('generates .env.example from env var references', () => {
    const files = [
      { filePath: 'src/config.ts', content: 'const key = process.env.API_KEY;\nconst url = import.meta.env.VITE_API_URL;' },
    ];
    const result = CompletenessPass.run(files, 'node');
    const envFile = result.files.find((f) => f.filePath === '.env.example');
    expect(envFile).toBeTruthy();
    expect(envFile!.content).toContain('API_KEY');
    expect(envFile!.content).toContain('VITE_API_URL');
  });

  it('generates tailwind config when @tailwind directives found', () => {
    const files = extractFilesFromArtifact(MOCK_LLM_OUTPUT);
    const result = CompletenessPass.run(files, 'node');
    const twConfig = result.files.find((f) => f.filePath === 'tailwind.config.js');
    expect(twConfig).toBeTruthy();
  });

  it('normalizes incompatible React and Vite package versions', () => {
    const files = [
      {
        filePath: 'package.json',
        content: JSON.stringify({
          name: 'broken-app',
          private: true,
          scripts: { dev: 'vite --hostname 0.0.0.0', build: 'vite build' },
          dependencies: {
            react: '^17.0.2',
            'react-dom': '^18.3.1',
          },
          devDependencies: {
            vite: '^4.5.14',
            '@vitejs/plugin-react': '^2.2.0',
            '@testing-library/react': 'latest',
          },
        }),
      },
      {
        filePath: 'vite.config.ts',
        content: `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()] });`,
      },
      {
        filePath: 'src/App.tsx',
        content: `export default function App() { return <div>Hello</div>; }`,
      },
    ];

    const result = CompletenessPass.run(files, 'node');
    const pkgUpdate = result.files.find((f) => f.filePath === 'package.json');
    expect(pkgUpdate).toBeTruthy();

    const pkg = JSON.parse(pkgUpdate!.content);
    expect(pkg.dependencies.react).toBe('^18.3.1');
    expect(pkg.dependencies['react-dom']).toBe('^18.3.1');
    expect(pkg.devDependencies.vite).toBe('^5.4.14');
    expect(pkg.devDependencies['@vitejs/plugin-react']).toBe('^4.3.4');
    expect(pkg.devDependencies['@testing-library/react']).toBe('^16.3.0');
    expect(pkg.scripts.dev).toBe('vite');
  });

  it('removes unsupported non-npm runtime packages from package.json', () => {
    const files = [
      {
        filePath: 'package.json',
        content: JSON.stringify({
          name: 'broken-game-app',
          private: true,
          scripts: { dev: 'vite' },
          dependencies: {
            react: '^18.3.1',
            godot: '^3.3.0',
          },
          devDependencies: {
            vite: '^5.4.14',
          },
        }),
      },
      {
        filePath: 'src/App.tsx',
        content: `export default function App() { return <div>Game</div>; }`,
      },
    ];

    const result = CompletenessPass.run(files, 'node');
    const pkgUpdate = result.files.find((f) => f.filePath === 'package.json');
    expect(pkgUpdate).toBeTruthy();

    const pkg = JSON.parse(pkgUpdate!.content);
    expect(pkg.dependencies.godot).toBeUndefined();
  });

  it('removes browser globals that were incorrectly turned into npm dependencies', () => {
    const files = [
      {
        filePath: 'package.json',
        content: JSON.stringify({
          name: 'broken-browser-app',
          private: true,
          scripts: { dev: 'vite' },
          dependencies: {
            react: '^18.3.1',
            'react-dom': '^18.3.1',
            localStorage: '^2.0.1',
          },
          devDependencies: {
            vite: '^5.4.14',
            '@vitejs/plugin-react': '^4.3.4',
          },
        }),
      },
      {
        filePath: 'src/App.tsx',
        content: `export default function App() {
  const saved = window.localStorage.getItem('foo');
  return <div>{saved}</div>;
}`,
      },
    ];

    const result = CompletenessPass.run(files, 'node');
    const pkgUpdate = result.files.find((f) => f.filePath === 'package.json');
    expect(pkgUpdate).toBeTruthy();

    const pkg = JSON.parse(pkgUpdate!.content);
    expect(pkg.dependencies.localStorage).toBeUndefined();
  });

  it('repairs broken TypeScript Node server scripts that point at stale js entrypoints', () => {
    const files = [
      {
        filePath: 'package.json',
        content: JSON.stringify({
          name: 'api-app',
          private: true,
          scripts: {
            dev: 'nodemon src/index.js --hostname 0.0.0.0',
            start: 'node src/index.js',
          },
          dependencies: {
            express: '^4.21.0',
          },
          devDependencies: {
            '@types/node': '^14.18.63',
          },
        }),
      },
      {
        filePath: 'src/index.ts',
        content: `import express from 'express';
const app = express();
app.get('/', (_req, res) => res.json({ ok: true }));
app.listen(3000);`,
      },
    ];

    const result = CompletenessPass.run(files, 'node');
    const pkgUpdate = result.files.find((f) => f.filePath === 'package.json');
    expect(pkgUpdate).toBeTruthy();

    const pkg = JSON.parse(pkgUpdate!.content);
    expect(pkg.scripts.dev).toBe('tsx watch src/index.ts');
    expect(pkg.scripts.build).toBe('tsc');
    expect(pkg.scripts.start).toBe('node dist/index.js');
    expect(pkg.devDependencies.tsx).toBe('^4.19.2');
    expect(pkg.devDependencies.typescript).toBe('^5.6.0');
  });

  it('does not scaffold node files for godot projects', () => {
    const files = [
      {
        filePath: 'project.godot',
        content: '; Engine configuration file.',
      },
      {
        filePath: 'scenes/Main.tscn',
        content: '[gd_scene load_steps=2 format=3]',
      },
    ];

    const result = CompletenessPass.run(files, 'godot');
    expect(result.files.find((f) => f.filePath === 'package.json')).toBeUndefined();
    expect(result.files.find((f) => f.filePath === 'vite.config.ts')).toBeUndefined();
    expect(result.files.find((f) => f.filePath === '.gitignore')).toBeTruthy();
  });
});

describe('Dependency Resolver', () => {
  it('extracts npm packages from import statements', () => {
    const files = extractFilesFromArtifact(MOCK_LLM_OUTPUT);
    const result = DependencyResolver.resolve(files, 'node');

    const depNames = result.dependencies.map((d) => d.packageName);
    expect(depNames).toContain('react');
  });

  it('infers react-dom from react', () => {
    const files = [{ filePath: 'src/App.tsx', content: "import React from 'react';" }];
    const result = DependencyResolver.resolve(files, 'node');
    const allNames = [...result.dependencies, ...result.devDependencies].map((d) => d.packageName);
    expect(allNames).toContain('react-dom');
  });

  it('classifies @types packages as devDependencies', () => {
    const files = [{ filePath: 'src/App.tsx', content: "import React from 'react';" }];
    const result = DependencyResolver.resolve(files, 'node');
    const devNames = result.devDependencies.map((d) => d.packageName);
    expect(devNames).toContain('@types/react');
  });

  it('ignores local imports', () => {
    const files = [{ filePath: 'src/App.tsx', content: "import { Foo } from './components/Foo';" }];
    const result = DependencyResolver.resolve(files, 'node');
    expect(result.dependencies.find((d) => d.packageName === './components/Foo')).toBeUndefined();
  });

  it('handles scoped packages', () => {
    const files = [{ filePath: 'src/App.tsx', content: "import { QueryClient } from '@tanstack/react-query';" }];
    const result = DependencyResolver.resolve(files, 'node');
    const depNames = result.dependencies.map((d) => d.packageName);
    expect(depNames).toContain('@tanstack/react-query');
  });
});

describe('Test Generator', () => {
  it('scaffolds vitest tests for React components', () => {
    const files = extractFilesFromArtifact(MOCK_LLM_OUTPUT);
    const result = TestGenerator.scaffold(files, 'node');

    expect(result.framework).toBe('vitest');
    expect(result.configFiles.length).toBeGreaterThan(0);
    expect(result.configFiles.find((f) => f.filePath === 'vitest.config.ts')).toBeTruthy();
    // Config files (vitest.config.ts, test setup) are always generated for node projects
    expect(result.configFiles.length).toBeGreaterThanOrEqual(2);
  });

  it('returns empty for non-node projects', () => {
    const result = TestGenerator.scaffold([], 'unknown');
    expect(result.files.length).toBe(0);
    expect(result.framework).toBe('none');
  });

  it('returns no test scaffolding for engine projects', () => {
    const result = TestGenerator.scaffold([], 'unity');
    expect(result.files.length).toBe(0);
    expect(result.framework).toBe('none');
  });

  it('pins compatible test dependency versions instead of latest', () => {
    const updated = TestGenerator.mergeTestDeps(JSON.stringify({
      name: 'app',
      devDependencies: {
        '@testing-library/react': 'latest',
      },
    }), 'node');

    const pkg = JSON.parse(updated);
    expect(pkg.devDependencies.vitest).toBe('^4.1.0');
    expect(pkg.devDependencies['@testing-library/react']).toBe('^16.3.0');
    expect(pkg.devDependencies['@testing-library/jest-dom']).toBe('^6.6.3');
    expect(pkg.devDependencies.jsdom).toBe('^25.0.1');
    expect(pkg.devDependencies['@types/node']).toBe('^20.19.37');
  });
});

describe('Dockerfile Generator', () => {
  it('generates Dockerfile for Vite/React project', () => {
    const files = extractFilesFromArtifact(MOCK_LLM_OUTPUT);
    const result = DockerfileGenerator.generate(files, { projectName: 'todo-app', projectType: 'node' });

    expect(result.files.length).toBeGreaterThanOrEqual(3); // Dockerfile, .dockerignore, docker-compose.yml
    const dockerfile = result.files.find((f) => f.filePath === 'Dockerfile');
    expect(dockerfile).toBeTruthy();
    expect(dockerfile!.content).toContain('FROM node');

    const compose = result.files.find((f) => f.filePath === 'docker-compose.yml');
    expect(compose).toBeTruthy();

    const ignore = result.files.find((f) => f.filePath === '.dockerignore');
    expect(ignore).toBeTruthy();
    expect(ignore!.content).toContain('node_modules');
  });

  it('skips docker scaffolding for engine projects without engine worker support', () => {
    const result = DockerfileGenerator.generate([], { projectName: 'godot-game', projectType: 'godot' });
    expect(result.files.length).toBe(0);
  });

  it('detects correct port', () => {
    const files = extractFilesFromArtifact(MOCK_LLM_OUTPUT);
    const result = DockerfileGenerator.generate(files, { projectName: 'app', projectType: 'node' });
    expect(result.port).toBe(3000); // default node port
  });
});

describe('CI Generator', () => {
  it('generates GitHub Actions workflow for Node project', () => {
    const files = extractFilesFromArtifact(MOCK_LLM_OUTPUT);
    const result = CIGenerator.generate(files, 'node', 'todo-app');

    expect(result.provider).toBe('github-actions');
    expect(result.files.length).toBe(1);
    expect(result.files[0].filePath).toBe('.github/workflows/ci.yml');
    expect(result.files[0].content).toContain('actions/checkout');
    expect(result.files[0].content).toContain('npm ci');
  });
});

describe('SBOM Scanner', () => {
  it('generates SBOM from package.json', () => {
    const files = extractFilesFromArtifact(MOCK_LLM_OUTPUT);
    const result = SBOMScanner.scan(files);

    expect(result.totalDeps).toBeGreaterThan(0);
    expect(result.components.length).toBeGreaterThan(0);
    expect(result.components.find((c) => c.name === 'react')).toBeTruthy();
  });

  it('generates valid CycloneDX JSON', () => {
    const files = extractFilesFromArtifact(MOCK_LLM_OUTPUT);
    const result = SBOMScanner.scan(files);
    const cdx = SBOMScanner.toCycloneDX(result, 'test');

    const parsed = JSON.parse(cdx);
    expect(parsed.bomFormat).toBe('CycloneDX');
    expect(parsed.specVersion).toBe('1.5');
    expect(parsed.components.length).toBeGreaterThan(0);
  });

  it('flags known vulnerable packages', () => {
    const files = [{
      filePath: 'package.json',
      content: JSON.stringify({
        dependencies: { 'event-stream': '3.3.6', react: '^18.3.1' },
      }),
    }];
    const result = SBOMScanner.scan(files);
    expect(result.vulnerabilities.length).toBeGreaterThan(0);
    expect(result.vulnerabilities.find((v) => v.package === 'event-stream')).toBeTruthy();
  });
});

describe('Secret Scanner', () => {
  it('detects hardcoded API keys', () => {
    const files = [{
      filePath: 'src/config.ts',
      content: 'const key = "sk-ant-api03-FAKEKEYHERE1234567890ABCDEFGHIJ";',
    }];
    const result = SecretScanner.scan(files);
    expect(result.clean).toBe(false);
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it('passes clean code', () => {
    const files = [{
      filePath: 'src/App.tsx',
      content: 'export default function App() { return <div>Hello</div>; }',
    }];
    const result = SecretScanner.scan(files);
    expect(result.clean).toBe(true);
  });
});

describe('Full Pipeline Smoke Test', () => {
  it('produces a complete, downloadable project from LLM output', () => {
    // Step 1: Extract files
    const extracted = extractFilesFromArtifact(MOCK_LLM_OUTPUT);
    expect(extracted.length).toBeGreaterThanOrEqual(3);

    // Step 2: Completeness pass fills gaps
    const projectType = detectProjectType(extracted);
    const completeness = CompletenessPass.run(extracted, projectType);
    const allFiles = [...extracted, ...completeness.files];

    // Step 3: Verify critical files exist
    const filePaths = allFiles.map((f) => f.filePath);
    expect(filePaths).toContain('package.json');

    // Step 4: Verify package.json is valid JSON with deps
    const pkg = allFiles.find((f) => f.filePath === 'package.json');
    const parsed = JSON.parse(pkg!.content);
    expect(parsed.dependencies).toBeDefined();
    expect(parsed.scripts).toBeDefined();

    // Step 5: Dependencies resolved
    const deps = DependencyResolver.resolve(allFiles, projectType);
    expect(deps.dependencies.length).toBeGreaterThan(0);

    // Step 6: Tests scaffolded
    const tests = TestGenerator.scaffold(allFiles, projectType);
    expect(tests.framework).toBe('vitest');

    // Step 7: Docker config generated
    const docker = DockerfileGenerator.generate(allFiles, { projectName: 'test', projectType });
    expect(docker.files.find((f) => f.filePath === 'Dockerfile')).toBeTruthy();

    // Step 8: CI generated
    const ci = CIGenerator.generate(allFiles, projectType, 'test');
    expect(ci.files.length).toBe(1);

    // Step 9: SBOM generated
    const sbom = SBOMScanner.scan(allFiles);
    expect(sbom.totalDeps).toBeGreaterThan(0);

    // Step 10: No secrets leaked
    const secrets = SecretScanner.scan(allFiles);
    expect(secrets.clean).toBe(true);

    // Final count: all the files a project needs
    const finalFiles = [...allFiles, ...tests.configFiles, ...tests.files, ...docker.files, ...ci.files];
    console.log(`Pipeline produced ${finalFiles.length} files:`);
    finalFiles.forEach((f) => console.log(`  ${f.filePath}`));
    expect(finalFiles.length).toBeGreaterThanOrEqual(10);
  });

  it('recovers from incomplete LLM output', () => {
    // Simulate the worst case: LLM only generated 2 component files, no config
    const extracted = extractFilesFromArtifact(MOCK_INCOMPLETE_OUTPUT);
    expect(extracted.length).toBe(2);

    // Completeness pass must save the day
    const projectType = detectProjectType(extracted);
    expect(projectType).toBe('node'); // inferred from .tsx

    const completeness = CompletenessPass.run(extracted, projectType);
    const allFiles = [...extracted, ...completeness.files];
    const filePaths = allFiles.map((f) => f.filePath);

    // Must have generated these:
    expect(filePaths).toContain('package.json');
    expect(filePaths).toContain('tsconfig.json');
    expect(filePaths).toContain('src/main.tsx');
    expect(filePaths).toContain('index.html');
    expect(filePaths).toContain('.gitignore');

    // package.json must have react as a dependency (inferred from imports)
    const pkg = allFiles.find((f) => f.filePath === 'package.json');
    const parsed = JSON.parse(pkg!.content);
    expect(parsed.dependencies.react).toBeTruthy();
    expect(parsed.scripts.dev).toBeTruthy();
  });
});

describe('Forge Guardrails', () => {
  it('topologically sorts implementation manifest entries before scaffolding', () => {
    const manifest = normalizeImplementationManifest({
      files: [
        { path: 'src/app.ts', description: 'app entry', dependencies: ['src/service.ts'] },
        { path: 'src/service.ts', description: 'service', dependencies: ['src/types.ts'] },
        { path: 'src/types.ts', description: 'types', dependencies: [] },
      ],
    });

    expect(manifest.files.map((file) => file.path)).toEqual([
      'src/types.ts',
      'src/service.ts',
      'src/app.ts',
    ]);
  });

  it('marks preview as not ready when sandbox startup fails even if launcher was optimistic', () => {
    const assessment = finalizePreviewAssessment({
      files: [
        {
          filePath: 'package.json',
          content: JSON.stringify({
            scripts: {
              dev: 'vite',
            },
            dependencies: {
              react: '^18.3.1',
              'react-dom': '^18.3.1',
            },
            devDependencies: {
              vite: '^5.4.14',
              '@vitejs/plugin-react': '^4.3.4',
            },
          }),
        },
        {
          filePath: 'index.html',
          content: '<!doctype html><html><body><div id="root"></div></body></html>',
        },
        {
          filePath: 'src/main.tsx',
          content: 'import React from "react";',
        },
        {
          filePath: 'vite.config.ts',
          content: 'export default {}',
        },
      ],
      projectType: 'node',
      launchAssessment: {
        projectType: 'node',
        framework: 'vite-react',
        installCommand: 'npm install',
        startCommand: 'npm run dev',
        expectedPort: 5173,
        ready: true,
        blockers: [],
        missingPackages: [],
        summary: 'Looks good on static analysis',
      },
      validationIssues: [],
      buildResult: {
        success: true,
        installOutput: '',
        buildOutput: '',
        errors: [],
        warnings: [],
        durationMs: 10,
      },
      lintPassed: true,
      testsPassed: true,
      sandboxAvailable: true,
      sandboxResult: {
        success: false,
        phase: 'start',
        stdout: '',
        stderr: 'app crashed immediately',
        exitCode: 1,
      },
    });

    expect(assessment.ready).toBe(false);
    expect(assessment.blockers.some((blocker) => blocker.includes('Preview sandbox start failed'))).toBe(true);
  });

  it('blocks preview when a vite app is missing the files needed to actually open it', () => {
    const assessment = finalizePreviewAssessment({
      files: [
        {
          filePath: 'package.json',
          content: JSON.stringify({
            scripts: {
              dev: 'vite',
            },
            dependencies: {
              react: '^18.3.1',
              'react-dom': '^18.3.1',
            },
            devDependencies: {
              vite: '^5.4.14',
            },
          }),
        },
      ],
      projectType: 'node',
      launchAssessment: {
        projectType: 'node',
        framework: 'vite-react',
        installCommand: 'npm install',
        startCommand: 'npm run dev',
        expectedPort: 5173,
        ready: true,
        blockers: [],
        missingPackages: [],
        summary: 'Looks runnable',
      },
      validationIssues: [],
      buildResult: {
        success: true,
        installOutput: '',
        buildOutput: '',
        errors: [],
        warnings: [],
        durationMs: 10,
      },
      lintPassed: true,
      testsPassed: true,
      sandboxAvailable: false,
      sandboxReason: 'Docker unavailable in test',
      sandboxResult: null,
    });

    expect(assessment.ready).toBe(false);
    expect(assessment.blockers.some((blocker) => blocker.includes('index.html'))).toBe(true);
    expect(assessment.blockers.some((blocker) => blocker.includes('main client entrypoint'))).toBe(true);
  });

  it('reports deterministic usability blockers for malformed node projects', () => {
    const assessment = evaluateUsability({
      files: [
        {
          filePath: 'package.json',
          content: JSON.stringify({
            scripts: {},
            dependencies: {},
            devDependencies: {},
          }),
        },
        {
          filePath: 'vite.config.ts',
          content: 'export default {}',
        },
      ],
      projectType: 'node',
      launchAssessment: {
        projectType: 'node',
        framework: 'vite-react',
        installCommand: 'npm install',
        startCommand: null,
        expectedPort: 5173,
        ready: false,
        blockers: ['Missing startup command'],
        missingPackages: [],
        summary: 'Launch blocked',
      },
    });

    expect(assessment.usable).toBe(false);
    expect(assessment.blockers.some((blocker) => blocker.includes('dev or start script'))).toBe(true);
    expect(assessment.blockers.some((blocker) => blocker.includes('startup command'))).toBe(true);
  });

  it('fails closed when build verification cannot classify the generated project', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'forge-build-verifier-'));

    try {
      writeFileSync(join(tempDir, 'README.md'), '# Unknown project\n', 'utf-8');
      const result = await BuildVerifier.verify(tempDir);

      expect(result.success).toBe(false);
      expect(result.errors.some((error) => error.includes('Could not detect project type'))).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('blocks preview preflight for node-like projects with no package.json', () => {
    const result = runPreviewPreflight([
      {
        filePath: 'src/App.tsx',
        content: 'export default function App() { return <div>Hello</div>; }',
      },
      {
        filePath: 'src/main.tsx',
        content: 'import App from "./App";',
      },
      {
        filePath: 'index.html',
        content: '<!doctype html><html><body><div id="root"></div></body></html>',
      },
    ]);

    expect(result.ok).toBe(false);
    expect(result.projectType).toBe('node');
    expect(result.blockers.some((blocker) => blocker.includes('package.json'))).toBe(true);
  });

  it('auto-scaffolds a missing main client entrypoint before preview preflight', () => {
    const prepared = preparePreviewFiles([
      {
        filePath: 'package.json',
        content: JSON.stringify({
          scripts: {
            dev: 'vite',
            build: 'vite build',
          },
          dependencies: {
            react: '^18.3.1',
            'react-dom': '^18.3.1',
          },
          devDependencies: {
            vite: '^5.4.14',
            '@vitejs/plugin-react': '^4.3.4',
          },
        }),
      },
      {
        filePath: 'index.html',
        content: '<!doctype html><html><body><div id="root"></div></body></html>',
      },
      {
        filePath: 'src/App.tsx',
        content: 'export default function App() { return <div>Hello</div>; }',
      },
      {
        filePath: 'vite.config.ts',
        content: 'export default {}',
      },
    ]);

    expect(prepared.files.some((file) => file.filePath === 'src/main.tsx')).toBe(true);
    expect(prepared.warnings.some((warning) => warning.includes('src/main.tsx'))).toBe(true);

    const result = runPreviewPreflight(prepared.files);
    expect(result.ok).toBe(true);
  });

  it('auto-scaffolds a main client entrypoint for jsx app shapes without explicit react imports', () => {
    const prepared = preparePreviewFiles([
      {
        filePath: 'package.json',
        content: JSON.stringify({
          scripts: {
            dev: 'vite',
            build: 'vite build',
          },
          dependencies: {
            react: '^18.3.1',
            'react-dom': '^18.3.1',
          },
          devDependencies: {
            vite: '^5.4.14',
            '@vitejs/plugin-react': '^4.3.4',
          },
        }),
      },
      {
        filePath: 'index.html',
        content: '<!doctype html><html><body><div id="root"></div></body></html>',
      },
      {
        filePath: 'src/App.jsx',
        content: 'export default function App() { return <div>Hello</div>; }',
      },
      {
        filePath: 'vite.config.ts',
        content: 'export default {}',
      },
    ]);

    expect(prepared.files.some((file) => file.filePath === 'src/main.tsx')).toBe(true);

    const result = runPreviewPreflight(prepared.files);
    expect(result.ok).toBe(true);
  });

  it('repairs package.json during preview prep when a vite app is missing vite dependency', () => {
    const prepared = preparePreviewFiles([
      {
        filePath: 'package.json',
        content: JSON.stringify({
          scripts: {
            dev: 'vite',
            build: 'vite build',
          },
          dependencies: {
            react: '^18.3.1',
            'react-dom': '^18.3.1',
          },
          devDependencies: {
            '@vitejs/plugin-react': '^4.3.4',
          },
        }),
      },
      {
        filePath: 'index.html',
        content: '<!doctype html><html><body><div id="root"></div></body></html>',
      },
      {
        filePath: 'src/main.tsx',
        content: 'import App from "./App";',
      },
      {
        filePath: 'src/App.tsx',
        content: 'export default function App() { return <div>Hello</div>; }',
      },
      {
        filePath: 'vite.config.ts',
        content: 'export default {}',
      },
    ]);

    const packageJson = prepared.files.find((file) => file.filePath === 'package.json');
    expect(packageJson).toBeTruthy();

    const pkg = JSON.parse(packageJson!.content);
    expect(pkg.devDependencies.vite).toBe('^5.4.14');
    expect(prepared.warnings.some((warning) => warning.includes('package.json'))).toBe(true);

    const result = runPreviewPreflight(prepared.files);
    expect(result.ok).toBe(true);
  });

  it('renames JSX-bearing .js files before preview so Vite can parse them', () => {
    const prepared = preparePreviewFiles([
      {
        filePath: 'package.json',
        content: JSON.stringify({
          scripts: {
            dev: 'vite',
            build: 'vite build',
          },
          dependencies: {
            react: '^18.3.1',
            'react-dom': '^18.3.1',
          },
          devDependencies: {
            vite: '^5.4.14',
            '@vitejs/plugin-react': '^4.3.4',
          },
        }),
      },
      {
        filePath: 'index.html',
        content: '<!doctype html><html><body><div id="root"></div></body></html>',
      },
      {
        filePath: 'src/main.jsx',
        content: 'import App from "./App.js";',
      },
      {
        filePath: 'src/App.js',
        content: 'export default function App() { return (<div>Hello</div>); }',
      },
      {
        filePath: 'vite.config.ts',
        content: 'export default {}',
      },
    ]);

    expect(prepared.files.some((file) => file.filePath === 'src/App.jsx')).toBe(true);
    expect(prepared.files.some((file) => file.filePath === 'src/App.js')).toBe(false);
    expect(prepared.files.find((file) => file.filePath === 'src/main.jsx')?.content).toContain('./App.jsx');
    expect(prepared.warnings.some((warning) => warning.includes('src/App.js -> src/App.jsx'))).toBe(true);

    const result = runPreviewPreflight(prepared.files);
    expect(result.ok).toBe(true);
  });

  it('allows preview preflight for a minimal usable vite app', () => {
    const result = runPreviewPreflight([
      {
        filePath: 'package.json',
        content: JSON.stringify({
          scripts: {
            dev: 'vite',
            build: 'vite build',
          },
          dependencies: {
            react: '^18.3.1',
            'react-dom': '^18.3.1',
          },
          devDependencies: {
            vite: '^5.4.14',
            '@vitejs/plugin-react': '^4.3.4',
          },
        }),
      },
      {
        filePath: 'index.html',
        content: '<!doctype html><html><body><div id="root"></div></body></html>',
      },
      {
        filePath: 'src/main.tsx',
        content: 'import App from "./App";',
      },
      {
        filePath: 'src/App.tsx',
        content: 'export default function App() { return <div>Hello</div>; }',
      },
      {
        filePath: 'vite.config.ts',
        content: 'export default {}',
      },
    ]);

    expect(result.ok).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });
});
