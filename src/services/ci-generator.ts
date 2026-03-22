import { type ProjectType } from '@/src/types/dag';

interface CIFile {
  filePath: string;
  content: string;
  language: string;
}

interface CIGenerateResult {
  files: CIFile[];
  provider: string;
}

export class CIGenerator {
  /**
   * Generate CI/CD pipeline configuration files.
   * Produces GitHub Actions workflow that builds, tests, and optionally pushes a Docker image.
   */
  static generate(
    projectFiles: Array<{ filePath: string; content: string }>,
    projectType: ProjectType,
    projectName: string
  ): CIGenerateResult {
    const files: CIFile[] = [];
    const safeName = projectName.replace(/[^a-z0-9-]/gi, '-').toLowerCase();

    switch (projectType) {
      case 'node':
        files.push(CIGenerator.generateNodeWorkflow(projectFiles, safeName));
        break;
      case 'python':
        files.push(CIGenerator.generatePythonWorkflow(safeName));
        break;
      case 'go':
        files.push(CIGenerator.generateGoWorkflow(safeName));
        break;
      case 'static':
        files.push(CIGenerator.generateStaticWorkflow(safeName));
        break;
      default:
        return { files: [], provider: 'none' };
    }

    return { files, provider: 'github-actions' };
  }

  private static generateNodeWorkflow(
    projectFiles: Array<{ filePath: string; content: string }>,
    projectName: string
  ): CIFile {
    // Detect features
    const pkgFile = projectFiles.find((f) => f.filePath === 'package.json');
    let hasBuild = false;
    let hasTest = false;
    let hasLint = false;
    if (pkgFile) {
      try {
        const pkg = JSON.parse(pkgFile.content);
        hasBuild = !!pkg.scripts?.build;
        hasTest = !!pkg.scripts?.test;
        hasLint = !!pkg.scripts?.lint;
      } catch { /* ignore */ }
    }
    const hasDockerfile = projectFiles.some((f) => f.filePath === 'Dockerfile');

    let workflow = `name: CI

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci
`;

    if (hasLint) {
      workflow += `
      - name: Lint
        run: npm run lint
`;
    }

    if (hasBuild) {
      workflow += `
      - name: Build
        run: npm run build
`;
    }

    if (hasTest) {
      workflow += `
      - name: Test
        run: npm test
`;
    }

    if (hasDockerfile) {
      workflow += `
  docker:
    needs: build
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'

    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: \${{ secrets.DOCKER_USERNAME }}
          password: \${{ secrets.DOCKER_PASSWORD }}

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: \${{ secrets.DOCKER_USERNAME }}/${projectName}:latest,\${{ secrets.DOCKER_USERNAME }}/${projectName}:\${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
`;
    }

    return {
      filePath: '.github/workflows/ci.yml',
      content: workflow,
      language: 'yaml',
    };
  }

  private static generatePythonWorkflow(projectName: string): CIFile {
    return {
      filePath: '.github/workflows/ci.yml',
      content: `name: CI

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'
          cache: 'pip'

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt
          pip install pytest pytest-cov

      - name: Lint
        run: |
          pip install ruff
          ruff check .

      - name: Test
        run: pytest -v --cov=. --cov-report=xml

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          file: ./coverage.xml
`,
      language: 'yaml',
    };
  }

  private static generateGoWorkflow(projectName: string): CIFile {
    return {
      filePath: '.github/workflows/ci.yml',
      content: `name: CI

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Go
        uses: actions/setup-go@v5
        with:
          go-version: '1.22'

      - name: Download dependencies
        run: go mod download

      - name: Lint
        uses: golangci/golangci-lint-action@v6

      - name: Test
        run: go test -v -race -coverprofile=coverage.out ./...

      - name: Build
        run: go build -v ./...
`,
      language: 'yaml',
    };
  }

  private static generateStaticWorkflow(projectName: string): CIFile {
    return {
      filePath: '.github/workflows/ci.yml',
      content: `name: CI

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  validate:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Validate HTML
        uses: nicferrier/htmllint-action@v1
        with:
          directory: '.'
`,
      language: 'yaml',
    };
  }
}
