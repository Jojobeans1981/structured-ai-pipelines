import fs from 'fs/promises';
import path from 'path';

export class ScaffoldEngine {
  static async injectReactViteScaffold(targetDir: string) {
    await fs.mkdir(targetDir, { recursive: true });
    await this.writeFiles(targetDir, {
      'vite.config.ts': `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nexport default defineConfig({ plugins: [react()] });`,
      'tsconfig.json': `{"compilerOptions":{"target":"ES2020","useDefineForClassFields":true,"lib":["ES2020","DOM","DOM.Iterable"],"module":"ESNext","skipLibCheck":true,"moduleResolution":"bundler","allowImportingTsExtensions":true,"resolveJsonModule":true,"isolatedModules":true,"noEmit":true,"jsx":"react-jsx","strict":true},"include":["src"]}`,
      'tailwind.config.js': `module.exports = { content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"], theme: { extend: {} }, plugins: [] }`,
      'postcss.config.js': `module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } }`,
    });
    console.log(`[ScaffoldEngine] Injected Golden React/Vite configs into ${targetDir}`);
  }

  static async injectExpressScaffold(targetDir: string) {
    await fs.mkdir(targetDir, { recursive: true });
    await this.writeFiles(targetDir, {
      'tsconfig.json': `{"compilerOptions":{"target":"ES2022","module":"CommonJS","rootDir":"./src","outDir":"./dist","strict":true,"esModuleInterop":true,"skipLibCheck":true,"forceConsistentCasingInFileNames":true}}`,
      'nodemon.json': `{"watch":["src"],"ext":".ts,.js","ignore":[],"exec":"ts-node ./src/index.ts"}`,
      '.env.example': `PORT=3000\nNODE_ENV=development`,
    });
    console.log(`[ScaffoldEngine] Injected Golden Express.js configs into ${targetDir}`);
  }

  static async injectNextJsScaffold(targetDir: string) {
    await fs.mkdir(targetDir, { recursive: true });
    await this.writeFiles(targetDir, {
      'next.config.js': `/** @type {import('next').NextConfig} */\nconst nextConfig = { reactStrictMode: true };\nmodule.exports = nextConfig;`,
      'tsconfig.json': `{"compilerOptions":{"target":"es5","lib":["dom","dom.iterable","esnext"],"allowJs":true,"skipLibCheck":true,"strict":true,"forceConsistentCasingInFileNames":true,"noEmit":true,"esModuleInterop":true,"module":"esnext","moduleResolution":"node","resolveJsonModule":true,"isolatedModules":true,"jsx":"preserve","incremental":true,"paths":{"@/*":["./src/*"]}},"include":["next-env.d.ts","**/*.ts","**/*.tsx"],"exclude":["node_modules"]}`,
    });
    console.log(`[ScaffoldEngine] Injected Golden Next.js configs into ${targetDir}`);
  }

  private static async writeFiles(dir: string, files: Record<string, string>) {
    for (const [filename, content] of Object.entries(files)) {
      await fs.writeFile(path.join(dir, filename), content, 'utf8');
    }
  }
}
