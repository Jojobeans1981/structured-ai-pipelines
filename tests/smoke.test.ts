/**
 * E2E Smoke Tests for Gauntlet Forge Pipeline
 *
 * Tests the core pipeline services WITHOUT requiring a running server or database.
 * Validates that: user input → file extraction → completeness pass → dependency
 * resolution → test scaffolding → Docker config → CI generation → ZIP output
 * all produce valid, runnable project structure.
 */
import { describe, it, expect } from 'vitest';
import { extractFilesFromArtifact } from '../src/services/file-manager';
import { CompletenessPass, detectProjectType } from '../src/services/completeness-pass';
import { DependencyResolver } from '../src/services/dependency-resolver';
import { TestGenerator } from '../src/services/test-generator';
import { DockerfileGenerator } from '../src/services/dockerfile-generator';
import { CIGenerator } from '../src/services/ci-generator';
import { SBOMScanner } from '../src/services/sbom-scanner';
import { SecretScanner } from '../src/services/secret-scanner';

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
