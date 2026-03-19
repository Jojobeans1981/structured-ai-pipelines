import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const skillCache = new Map<string, string>();

function stripFrontmatter(content: string): string {
  const frontmatterRegex = /^---\n[\s\S]*?\n---\n?/;
  return content.replace(frontmatterRegex, '').trim();
}

export class SkillLoader {
  private static skillsDir = join(process.cwd(), '.claude', 'skills');

  static getSkillPrompt(skillName: string): string {
    if (skillCache.has(skillName)) {
      return skillCache.get(skillName)!;
    }

    const skillPath = join(this.skillsDir, skillName, 'SKILL.md');

    if (!existsSync(skillPath)) {
      throw new Error(`Skill not found: ${skillName}. Expected at: ${skillPath}`);
    }

    const content = readFileSync(skillPath, 'utf-8');
    const stripped = stripFrontmatter(content);
    skillCache.set(skillName, stripped);

    console.log(`[SkillLoader] Loaded skill: ${skillName} (${stripped.length} chars)`);
    return stripped;
  }

  static getAllSkills(): Map<string, string> {
    const allSkillNames = [
      'prd-architect', 'phase-builder', 'prompt-builder', 'prompt-validator',
      'phase-executor', 'educator', 'project-orchestrator', 'bug-intake', 'code-archaeologist',
      'root-cause-analyzer', 'fix-planner', 'fix-prompt-builder', 'fix-executor',
      'lessons-learned', 'diagnostic-orchestrator', 'metrics-tracker', 'code-mentor',
    ];

    for (const name of allSkillNames) {
      this.getSkillPrompt(name);
    }

    return new Map(skillCache);
  }

  static clearCache(): void {
    skillCache.clear();
  }
}
