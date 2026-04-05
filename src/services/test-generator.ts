import { extractFilesFromArtifact } from '@/src/services/file-manager';
import { type ProjectType } from '@/src/types/dag';

interface TestFile {
  filePath: string;
  content: string;
  language: string;
}

interface TestScaffoldResult {
  files: TestFile[];
  framework: string;
  configFiles: TestFile[];
}

const TEST_FRAMEWORKS: Record<ProjectType, { framework: string; devDeps: string[] }> = {
  node: { framework: 'vitest', devDeps: ['vitest', '@testing-library/react', '@testing-library/jest-dom', 'jsdom'] },
  python: { framework: 'pytest', devDeps: ['pytest', 'pytest-cov'] },
  go: { framework: 'go test', devDeps: [] },
  static: { framework: 'none', devDeps: [] },
  godot: { framework: 'none', devDeps: [] },
  unity: { framework: 'none', devDeps: [] },
  unreal: { framework: 'none', devDeps: [] },
  unknown: { framework: 'none', devDeps: [] },
};

const PINNED_NODE_TEST_DEPS: Record<string, string> = {
  vitest: '^2.1.8',
  '@testing-library/react': '^16.3.0',
  '@testing-library/jest-dom': '^6.6.3',
  jsdom: '^25.0.1',
};

export class TestGenerator {
  /**
   * Analyze generated project files and scaffold a test suite.
   * Generates one test file per component/service/route file.
   */
  static scaffold(
    projectFiles: Array<{ filePath: string; content: string }>,
    projectType: ProjectType
  ): TestScaffoldResult {
    const config = TEST_FRAMEWORKS[projectType];
    if (config.framework === 'none') {
      return { files: [], framework: 'none', configFiles: [] };
    }

    const testFiles: TestFile[] = [];
    const configFiles: TestFile[] = [];

    switch (projectType) {
      case 'node':
        return TestGenerator.scaffoldNode(projectFiles);
      case 'python':
        return TestGenerator.scaffoldPython(projectFiles);
      case 'go':
        return TestGenerator.scaffoldGo(projectFiles);
      default:
        return { files: testFiles, framework: config.framework, configFiles };
    }
  }

  private static scaffoldNode(
    projectFiles: Array<{ filePath: string; content: string }>
  ): TestScaffoldResult {
    const testFiles: TestFile[] = [];
    const configFiles: TestFile[] = [];

    // Determine if React project
    const isReact = projectFiles.some(
      (f) => f.content.includes('react') || f.filePath.endsWith('.tsx') || f.filePath.endsWith('.jsx')
    );
    const isTs = projectFiles.some(
      (f) => f.filePath.endsWith('.ts') || f.filePath.endsWith('.tsx')
    );
    const ext = isTs ? '.test.tsx' : '.test.jsx';
    const srcExt = isTs ? '.tsx' : '.jsx';

    // Generate vitest config
    configFiles.push({
      filePath: 'vitest.config.ts',
      content: `import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: '${isReact ? 'jsdom' : 'node'}',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx,js,jsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
`,
      language: 'typescript',
    });

    // Generate test setup file
    configFiles.push({
      filePath: 'src/test/setup.ts',
      content: isReact
        ? `import '@testing-library/jest-dom';
`
        : `// Test setup file
`,
      language: 'typescript',
    });

    // Find testable files: components, services, utils, hooks
    const testablePatterns = [
      /^src\/components\/(.+)\.(tsx?|jsx?)$/,
      /^src\/services\/(.+)\.(tsx?|jsx?)$/,
      /^src\/utils\/(.+)\.(tsx?|jsx?)$/,
      /^src\/hooks\/(.+)\.(tsx?|jsx?)$/,
      /^src\/lib\/(.+)\.(tsx?|jsx?)$/,
    ];

    for (const file of projectFiles) {
      // Skip test files, config files, type-only files
      if (file.filePath.includes('.test.') || file.filePath.includes('.spec.')) continue;
      if (file.filePath.includes('.d.ts')) continue;
      if (file.filePath === 'src/main.tsx' || file.filePath === 'src/main.ts') continue;
      if (file.filePath === 'src/index.tsx' || file.filePath === 'src/index.ts') continue;
      if (file.filePath.endsWith('.css') || file.filePath.endsWith('.json')) continue;

      const isTestable = testablePatterns.some((p) => p.test(file.filePath));
      if (!isTestable) continue;

      const testFile = TestGenerator.generateNodeTest(file, isReact);
      if (testFile) testFiles.push(testFile);
    }

    return { files: testFiles, framework: 'vitest', configFiles };
  }

  private static generateNodeTest(
    file: { filePath: string; content: string },
    isReact: boolean
  ): TestFile | null {
    const { filePath, content } = file;

    // Extract exports to know what to test
    const defaultExport = content.match(/export\s+default\s+(?:function\s+)?(\w+)/);
    const namedExports = [...content.matchAll(/export\s+(?:function|const|class)\s+(\w+)/g)].map((m) => m[1]);

    if (!defaultExport && namedExports.length === 0) return null;

    const testPath = filePath.replace(/\.(tsx?|jsx?)$/, '.test$&').replace(/\.test\.(tsx?|jsx?)$/, `.test.$1`);
    // Normalize: src/components/Foo.tsx -> src/components/Foo.test.tsx
    const normalizedTestPath = filePath.replace(/(\.\w+)$/, '.test$1');
    const relativePath = './' + filePath.split('/').pop()!.replace(/\.\w+$/, '');
    const isComponent = filePath.includes('/components/');
    const isHook = filePath.includes('/hooks/');
    const isService = filePath.includes('/services/') || filePath.includes('/lib/') || filePath.includes('/utils/');

    let testContent = '';

    if (isComponent && isReact && defaultExport) {
      const componentName = defaultExport[1];
      testContent = `import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ${componentName} from '${relativePath}';

describe('${componentName}', () => {
  it('renders without crashing', () => {
    render(<${componentName} />);
  });

  it('is visible in the document', () => {
    const { container } = render(<${componentName} />);
    expect(container.firstChild).toBeInTheDocument();
  });
});
`;
    } else if (isHook && defaultExport) {
      const hookName = defaultExport[1];
      testContent = `import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ${hookName} from '${relativePath}';

describe('${hookName}', () => {
  it('returns without error', () => {
    const { result } = renderHook(() => ${hookName}());
    expect(result.current).toBeDefined();
  });
});
`;
    } else if (isService) {
      const exports = namedExports.length > 0 ? namedExports : (defaultExport ? [defaultExport[1]] : []);
      const importLine = namedExports.length > 0
        ? `import { ${namedExports.join(', ')} } from '${relativePath}';`
        : `import ${defaultExport![1]} from '${relativePath}';`;

      testContent = `import { describe, it, expect } from 'vitest';
${importLine}

describe('${filePath.split('/').pop()!.replace(/\.\w+$/, '')}', () => {
${exports.map((name) => `  it('${name} is defined', () => {
    expect(${name}).toBeDefined();
  });
`).join('\n')}});
`;
    } else {
      return null;
    }

    return {
      filePath: normalizedTestPath,
      content: testContent,
      language: filePath.endsWith('.tsx') || filePath.endsWith('.ts') ? 'typescript' : 'javascript',
    };
  }

  private static scaffoldPython(
    projectFiles: Array<{ filePath: string; content: string }>
  ): TestScaffoldResult {
    const testFiles: TestFile[] = [];
    const configFiles: TestFile[] = [];

    // Generate pytest config
    configFiles.push({
      filePath: 'pytest.ini',
      content: `[pytest]
testpaths = tests
python_files = test_*.py
python_functions = test_*
addopts = -v --tb=short
`,
      language: 'plaintext',
    });

    // conftest.py
    configFiles.push({
      filePath: 'tests/conftest.py',
      content: `import pytest
`,
      language: 'python',
    });

    for (const file of projectFiles) {
      if (!file.filePath.endsWith('.py')) continue;
      if (file.filePath.includes('test_') || file.filePath.includes('__pycache__')) continue;
      if (file.filePath === 'setup.py' || file.filePath === 'manage.py') continue;

      // Extract classes and functions
      const classes = [...file.content.matchAll(/^class\s+(\w+)/gm)].map((m) => m[1]);
      const functions = [...file.content.matchAll(/^def\s+(\w+)/gm)].map((m) => m[1]).filter((f) => !f.startsWith('_'));

      if (classes.length === 0 && functions.length === 0) continue;

      const moduleName = file.filePath.replace(/\//g, '.').replace(/\.py$/, '');
      const testFileName = 'tests/test_' + file.filePath.split('/').pop()!;

      let testContent = `"""Tests for ${moduleName}"""\n`;
      testContent += `import pytest\n`;

      if (functions.length > 0) {
        testContent += `from ${moduleName} import ${functions.join(', ')}\n\n`;
        for (const fn of functions) {
          testContent += `\ndef test_${fn}_exists():\n    """${fn} is callable"""\n    assert callable(${fn})\n`;
        }
      }

      if (classes.length > 0) {
        testContent += `from ${moduleName} import ${classes.join(', ')}\n\n`;
        for (const cls of classes) {
          testContent += `\nclass Test${cls}:\n    def test_instantiate(self):\n        """${cls} can be instantiated"""\n        # TODO: provide required constructor args\n        pass\n`;
        }
      }

      testFiles.push({ filePath: testFileName, content: testContent, language: 'python' });
    }

    return { files: testFiles, framework: 'pytest', configFiles };
  }

  private static scaffoldGo(
    projectFiles: Array<{ filePath: string; content: string }>
  ): TestScaffoldResult {
    const testFiles: TestFile[] = [];

    for (const file of projectFiles) {
      if (!file.filePath.endsWith('.go')) continue;
      if (file.filePath.endsWith('_test.go')) continue;

      const packageMatch = file.content.match(/^package\s+(\w+)/m);
      if (!packageMatch) continue;

      const pkg = packageMatch[1];
      const functions = [...file.content.matchAll(/^func\s+(\w+)/gm)]
        .map((m) => m[1])
        .filter((f) => f[0] === f[0].toUpperCase()); // Only exported functions

      if (functions.length === 0) continue;

      const testPath = file.filePath.replace(/\.go$/, '_test.go');
      let testContent = `package ${pkg}\n\nimport "testing"\n\n`;

      for (const fn of functions) {
        testContent += `func Test${fn}(t *testing.T) {\n\t// TODO: test ${fn}\n\tt.Log("${fn} exists")\n}\n\n`;
      }

      testFiles.push({ filePath: testPath, content: testContent, language: 'go' });
    }

    return { files: testFiles, framework: 'go test', configFiles: [] };
  }

  /**
   * Merge test devDependencies into an existing package.json.
   */
  static mergeTestDeps(packageJsonContent: string, projectType: ProjectType): string {
    if (projectType !== 'node') return packageJsonContent;

    try {
      const pkg = JSON.parse(packageJsonContent);
      const testDeps = ['vitest', '@testing-library/react', '@testing-library/jest-dom', 'jsdom'];

      if (!pkg.devDependencies) pkg.devDependencies = {};
      for (const dep of testDeps) {
        if (!pkg.devDependencies[dep] || pkg.devDependencies[dep] === 'latest') {
          pkg.devDependencies[dep] = PINNED_NODE_TEST_DEPS[dep];
        }
      }

      if (!pkg.scripts) pkg.scripts = {};
      if (!pkg.scripts.test) {
        pkg.scripts.test = 'vitest run';
      }
      if (!pkg.scripts['test:watch']) {
        pkg.scripts['test:watch'] = 'vitest';
      }

      return JSON.stringify(pkg, null, 2);
    } catch {
      return packageJsonContent;
    }
  }
}
