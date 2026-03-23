import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { prisma } from '@/src/lib/prisma';

const skillCache = new Map<string, string>();

function stripFrontmatter(content: string): string {
  const frontmatterRegex = /^---\n[\s\S]*?\n---\n?/;
  return content.replace(frontmatterRegex, '').trim();
}

// Internal pseudo-skills that don't need a prompt file
const INTERNAL_SKILLS: Record<string, string> = {
  '__gate__': 'You are a pipeline gate. Pause and await human approval.',
  '__verify__': 'You are a build verification node. Run install and build checks.',
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
