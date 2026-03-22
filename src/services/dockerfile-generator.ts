import { type ProjectType } from '@/src/types/dag';

interface DockerFile {
  filePath: string;
  content: string;
}

interface DockerGenerateResult {
  files: DockerFile[];
  projectType: ProjectType;
  imageName: string;
  port: number;
}

interface ProjectContext {
  projectName: string;
  projectType: ProjectType;
  port?: number;
  registry?: string;
  packageJson?: Record<string, unknown>;
}

export class DockerfileGenerator {
  /**
   * Generate Dockerfile, .dockerignore, and docker-compose.yml for a project.
   */
  static generate(
    projectFiles: Array<{ filePath: string; content: string }>,
    context: ProjectContext
  ): DockerGenerateResult {
    const { projectType, projectName } = context;
    const port = context.port || DockerfileGenerator.detectPort(projectFiles, projectType);
    const safeName = projectName.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    const imageName = context.registry
      ? `${context.registry}/${safeName}:latest`
      : `${safeName}:latest`;

    const files: DockerFile[] = [];

    switch (projectType) {
      case 'node':
        files.push(...DockerfileGenerator.generateNode(projectFiles, port, safeName));
        break;
      case 'python':
        files.push(...DockerfileGenerator.generatePython(projectFiles, port, safeName));
        break;
      case 'go':
        files.push(...DockerfileGenerator.generateGo(projectFiles, port, safeName));
        break;
      case 'static':
        files.push(...DockerfileGenerator.generateStatic(port));
        break;
      default:
        return { files: [], projectType, imageName, port };
    }

    // Always add .dockerignore
    files.push({
      filePath: '.dockerignore',
      content: DockerfileGenerator.getDockerignore(projectType),
    });

    // Always add docker-compose.yml
    files.push({
      filePath: 'docker-compose.yml',
      content: DockerfileGenerator.getCompose(safeName, imageName, port, projectType),
    });

    return { files, projectType, imageName, port };
  }

  private static detectPort(
    projectFiles: Array<{ filePath: string; content: string }>,
    projectType: ProjectType
  ): number {
    // Check package.json scripts for port hints
    const pkgFile = projectFiles.find((f) => f.filePath === 'package.json');
    if (pkgFile) {
      try {
        const pkg = JSON.parse(pkgFile.content);
        const scripts = JSON.stringify(pkg.scripts || {});
        const portMatch = scripts.match(/--port\s+(\d+)/) || scripts.match(/:(\d{4})/);
        if (portMatch) return parseInt(portMatch[1], 10);
      } catch { /* ignore */ }
    }

    // Check source files for port references
    for (const file of projectFiles) {
      const portMatch = file.content.match(/(?:PORT|port)\s*[=:]\s*(\d{4})/);
      if (portMatch) return parseInt(portMatch[1], 10);
    }

    // Defaults by project type
    switch (projectType) {
      case 'node': return 3000;
      case 'python': return 8000;
      case 'go': return 8080;
      case 'static': return 80;
      default: return 3000;
    }
  }

  private static generateNode(
    projectFiles: Array<{ filePath: string; content: string }>,
    port: number,
    projectName: string
  ): DockerFile[] {
    const files: DockerFile[] = [];
    const pkgFile = projectFiles.find((f) => f.filePath === 'package.json');
    let hasBuildScript = false;
    let hasStartScript = false;
    let startCommand = 'node dist/index.js';

    if (pkgFile) {
      try {
        const pkg = JSON.parse(pkgFile.content);
        hasBuildScript = !!pkg.scripts?.build;
        hasStartScript = !!pkg.scripts?.start;
        if (hasStartScript) startCommand = 'npm start';
        // Detect frameworks
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps['next']) startCommand = 'npm start';
        if (deps['vite'] && !hasStartScript) startCommand = 'npm run preview';
      } catch { /* ignore */ }
    }

    // Multi-stage build for production
    const isViteOrCRA = projectFiles.some(
      (f) => f.filePath === 'vite.config.ts' || f.filePath === 'vite.config.js'
    );

    if (isViteOrCRA && hasBuildScript) {
      // Static SPA served by nginx
      files.push({
        filePath: 'Dockerfile',
        content: `# Stage 1: Build
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Serve
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf 2>/dev/null || true
EXPOSE ${port}
CMD ["nginx", "-g", "daemon off;"]
`,
      });

      // Nginx config for SPA routing
      files.push({
        filePath: 'nginx.conf',
        content: `server {
    listen ${port};
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
`,
      });
    } else {
      // Server-side Node app
      files.push({
        filePath: 'Dockerfile',
        content: `FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
${hasBuildScript ? 'RUN npm run build\n' : ''}
FROM node:20-slim
WORKDIR /app
COPY --from=builder /app .
${hasBuildScript ? '' : '# No build step detected\n'}ENV NODE_ENV=production
EXPOSE ${port}
CMD ["${startCommand.split(' ')[0]}", ${startCommand.split(' ').slice(1).map((s) => `"${s}"`).join(', ')}]
`,
      });
    }

    return files;
  }

  private static generatePython(
    projectFiles: Array<{ filePath: string; content: string }>,
    port: number,
    projectName: string
  ): DockerFile[] {
    const hasRequirements = projectFiles.some((f) => f.filePath === 'requirements.txt');
    const hasPyproject = projectFiles.some((f) => f.filePath === 'pyproject.toml');

    // Detect framework for CMD
    let cmd = `["python", "-m", "http.server", "${port}"]`;
    for (const file of projectFiles) {
      if (file.content.includes('fastapi') || file.content.includes('FastAPI')) {
        const mainModule = file.filePath.replace(/\.py$/, '').replace(/\//g, '.');
        cmd = `["uvicorn", "${mainModule}:app", "--host", "0.0.0.0", "--port", "${port}"]`;
        break;
      }
      if (file.content.includes('flask') || file.content.includes('Flask')) {
        cmd = `["python", "-m", "flask", "run", "--host=0.0.0.0", "--port=${port}"]`;
        break;
      }
      if (file.content.includes('django')) {
        cmd = `["python", "manage.py", "runserver", "0.0.0.0:${port}"]`;
        break;
      }
    }

    const installStep = hasRequirements
      ? 'COPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt'
      : hasPyproject
        ? 'COPY pyproject.toml .\nRUN pip install --no-cache-dir .'
        : '# No dependency file found';

    return [{
      filePath: 'Dockerfile',
      content: `FROM python:3.12-slim
WORKDIR /app

${installStep}

COPY . .

EXPOSE ${port}
CMD ${cmd}
`,
    }];
  }

  private static generateGo(
    projectFiles: Array<{ filePath: string; content: string }>,
    port: number,
    projectName: string
  ): DockerFile[] {
    return [{
      filePath: 'Dockerfile',
      content: `# Stage 1: Build
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/server .

# Stage 2: Run
FROM alpine:3.19
RUN apk --no-cache add ca-certificates
WORKDIR /app
COPY --from=builder /app/server .
EXPOSE ${port}
CMD ["./server"]
`,
    }];
  }

  private static generateStatic(port: number): DockerFile[] {
    return [{
      filePath: 'Dockerfile',
      content: `FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE ${port}
CMD ["nginx", "-g", "daemon off;"]
`,
    }];
  }

  private static getDockerignore(projectType: ProjectType): string {
    const common = `node_modules
.git
.env
.env.local
.env*.local
*.log
.DS_Store
Thumbs.db
`;
    switch (projectType) {
      case 'node':
        return common + `dist
build
.next
coverage
`;
      case 'python':
        return common + `__pycache__
*.pyc
.venv
venv
.pytest_cache
`;
      case 'go':
        return common + `vendor
*.exe
`;
      default:
        return common;
    }
  }

  private static getCompose(
    serviceName: string,
    imageName: string,
    port: number,
    projectType: ProjectType
  ): string {
    let compose = `services:
  ${serviceName}:
    build: .
    image: ${imageName}
    ports:
      - "${port}:${port}"
    environment:
      - NODE_ENV=production
`;

    // Add common service dependencies based on project hints
    if (projectType === 'python' || projectType === 'node') {
      compose += `    restart: unless-stopped
`;
    }

    compose += `
  # Uncomment to add a database:
  # db:
  #   image: postgres:16-alpine
  #   environment:
  #     POSTGRES_DB: ${serviceName}
  #     POSTGRES_USER: app
  #     POSTGRES_PASSWORD: changeme
  #   ports:
  #     - "5432:5432"
  #   volumes:
  #     - pgdata:/var/lib/postgresql/data

# volumes:
#   pgdata:
`;

    return compose;
  }
}
