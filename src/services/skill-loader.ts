import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { prisma } from '@/src/lib/prisma';

const skillCache = new Map<string, string>();

function stripFrontmatter(content: string): string {
  const frontmatterRegex = /^---\n[\s\S]*?\n---\n?/;
  return content.replace(frontmatterRegex, '').trim();
}

// Internal pseudo-skills that don't need a prompt file
const SETUP_ANALYZER_PROMPT = `# Setup Analyzer

You are the Setup Analyzer agent. You receive all generated project files and produce a complete, step-by-step setup guide that tells anyone exactly how to run this application from zero.

Analyze every file and produce:
1. A complete list of prerequisites (runtime, database, services) with version numbers and install links
2. Every environment variable needed with descriptions and example values
3. Every system dependency and how to install it
4. Every database migration or seed step
5. The exact commands to run, in order, from clone to running app
6. Common gotchas and troubleshooting tips

Output format — use this exact structure:

# Setup Guide: {Project Name}

## Quickstart
\\\`\\\`\\\`bash
# Copy and paste this entire block
npm install && cp .env.example .env && npm run dev
\\\`\\\`\\\`

## Prerequisites
| Software | Version | Install |
|----------|---------|---------|

## Environment Variables
Create a .env file in the project root:
| Variable | Required | Description | Example Value |
|----------|----------|-------------|---------------|

## Setup Steps
### 1. Install Dependencies
### 2. Database Setup (if needed)
### 3. Configure Environment
### 4. Start Development Server
### 5. Verify It Works — open URL, what you should see

## Available Scripts
| Command | What It Does |
|---------|--------------|

## Troubleshooting
List the 3-5 most likely errors and their fixes.

Rules:
- Be exhaustive — if the app needs it to run, it must be in this guide
- Be exact — give copy-paste commands, not descriptions of commands
- Scan ALL provided files — check imports, env vars, API calls, database clients
- Flag missing pieces — env vars used in code but not documented, packages imported but not in package.json
- Never invent services the code doesn't actually use
- Every command must be runnable as-is, no {placeholder} values except user-specific ones like API keys`;

const INTERNAL_SKILLS: Record<string, string> = {
  '__gate__': 'You are a pipeline gate. Pause and await human approval.',
  '__verify__': 'You are a build verification node. Run install and build checks.',
  'setup-analyzer': SETUP_ANALYZER_PROMPT,
};

export class SkillLoader {
  private static skillsDir = join(process.cwd(), '.claude', 'skills');

  /**
   * Load a skill prompt. Priority:
   * 1. In-memory cache
   * 2. Internal pseudo-skills
   * 3. Database (Skill table)
   * 4. Filesystem fallback (local dev)
   */
  static async getSkillPromptAsync(skillName: string): Promise<string> {
    if (skillCache.has(skillName)) {
      return skillCache.get(skillName)!;
    }

    if (INTERNAL_SKILLS[skillName]) {
      skillCache.set(skillName, INTERNAL_SKILLS[skillName]);
      return INTERNAL_SKILLS[skillName];
    }

    // Try database first
    try {
      const skill = await prisma.skill.findUnique({
        where: { name: skillName },
        select: { prompt: true },
      });

      if (skill) {
        const stripped = stripFrontmatter(skill.prompt);
        skillCache.set(skillName, stripped);
        console.log(`[SkillLoader] Loaded skill from DB: ${skillName} (${stripped.length} chars)`);
        return stripped;
      }
    } catch {
      // DB not available — fall through to filesystem
    }

    // Filesystem fallback (local dev)
    return SkillLoader.getSkillPrompt(skillName);
  }

  /**
   * Synchronous filesystem loader — used as fallback and for backward compatibility.
   */
  static getSkillPrompt(skillName: string): string {
    if (skillCache.has(skillName)) {
      return skillCache.get(skillName)!;
    }

    if (INTERNAL_SKILLS[skillName]) {
      skillCache.set(skillName, INTERNAL_SKILLS[skillName]);
      return INTERNAL_SKILLS[skillName];
    }

    const skillPath = join(this.skillsDir, skillName, 'SKILL.md');

    if (!existsSync(skillPath)) {
      throw new Error(`Skill not found: ${skillName}. Not in database and not at: ${skillPath}`);
    }

    const content = readFileSync(skillPath, 'utf-8');
    const stripped = stripFrontmatter(content);
    skillCache.set(skillName, stripped);

    console.log(`[SkillLoader] Loaded skill from filesystem: ${skillName} (${stripped.length} chars)`);
    return stripped;
  }

  /**
   * Seed all skills from filesystem into the database.
   * Run this once to populate the Skill table from your local .claude/skills/.
   */
  static async seedSkillsToDb(): Promise<number> {
    const allSkillNames = [
      'prd-architect', 'phase-builder', 'prompt-builder', 'prompt-validator',
      'phase-executor', 'educator', 'project-orchestrator', 'bug-intake', 'code-archaeologist',
      'root-cause-analyzer', 'fix-planner', 'fix-prompt-builder', 'fix-executor',
      'lessons-learned', 'diagnostic-orchestrator', 'metrics-tracker', 'code-mentor',
      'setup-analyzer',
      'forge-analyzer', 'forge-prd', 'forge-prompt', 'forge-scaffolder', 'forge-validator',
      'forge-archaeologist', 'forge-root-cause', 'forge-fix-planner', 'forge-fix-scaffolder',
    ];

    let seeded = 0;
    for (const name of allSkillNames) {
      const skillPath = join(this.skillsDir, name, 'SKILL.md');
      if (!existsSync(skillPath)) continue;

      const content = readFileSync(skillPath, 'utf-8');
      await prisma.skill.upsert({
        where: { name },
        create: { name, prompt: content },
        update: { prompt: content },
      });
      seeded++;
    }

    console.log(`[SkillLoader] Seeded ${seeded} skills to database`);
    return seeded;
  }

  static clearCache(): void {
    skillCache.clear();
  }
}
