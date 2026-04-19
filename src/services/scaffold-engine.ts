import fs from 'fs/promises';
import path from 'path';

export class ScaffoldEngine {
  /**
   * Injects perfect, known-good build configurations into the target directory.
   * This prevents the LLM from hallucinating bad Vite, TS, or Tailwind configs.
   */
  static async injectReactViteScaffold(targetDir: string): Promise<void> {
    await fs.mkdir(targetDir, { recursive: true });

    const goldenConfigs = {
      'vite.config.ts': `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({ plugins: [react()] });`,
      'tsconfig.json': `{\n  "compilerOptions": {\n    "target": "ES2020",\n    "useDefineForClassFields": true,\n    "lib": ["ES2020", "DOM", "DOM.Iterable"],\n    "module": "ESNext",\n    "skipLibCheck": true,\n    "moduleResolution": "bundler",\n    "allowImportingTsExtensions": true,\n    "resolveJsonModule": true,\n    "isolatedModules": true,\n    "noEmit": true,\n    "jsx": "react-jsx",\n    "strict": true\n  },\n  "include": ["src"]\n}`,
      'tailwind.config.js': `/** @type {import('tailwindcss').Config} */\nmodule.exports = {\n  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],\n  theme: {\n    extend: {},\n  },\n  plugins: [],\n}`,
      'postcss.config.js': `module.exports = {\n  plugins: {\n    tailwindcss: {},\n    autoprefixer: {},\n  },\n}`,
      'index.html': `<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Forge App</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>`
    };

    for (const [filename, content] of Object.entries(goldenConfigs)) {
      const filePath = path.join(targetDir, filename);
      await fs.writeFile(filePath, content, 'utf8');
    }
    console.log(`[ScaffoldEngine] Injected Golden Configs into ${targetDir}`);
  }
}
