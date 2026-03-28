/**
 * Forge Coordination Layer — Model Router
 *
 * Routes tasks to the optimal inference backend based on task complexity:
 * - HEAVY tasks (PRD, architecture, scaffolding) → Claude API
 * - LIGHT tasks (educator, quiz, validation, review) → Ollama (local, free)
 *
 * Falls back to the other backend if the primary is unavailable.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createOllamaClient, isOllamaAvailable } from '@/src/lib/ollama-client';
import { getAnthropicClient } from '@/src/lib/anthropic';

export type TaskWeight = 'heavy' | 'light';

export type InferenceBackend = 'claude' | 'ollama';

interface RoutingDecision {
  backend: InferenceBackend;
  client: Anthropic;
  reason: string;
}

/**
 * Skill-to-weight mapping.
 * Heavy = needs Claude-level reasoning (complex generation, architecture).
 * Light = can be handled by a local model (quiz, review, validation).
 */
const SKILL_WEIGHTS: Record<string, TaskWeight> = {
  // Heavy — these require deep reasoning and large context
  'prd-architect': 'heavy',
  'phase-builder': 'heavy',
  'prompt-builder': 'heavy',
  'phase-executor': 'heavy',
  'root-cause-analyzer': 'heavy',
  'fix-planner': 'heavy',
  'fix-executor': 'heavy',

  // Light — these are simpler tasks that local models handle fine
  'educator': 'light',
  'quiz-generator': 'light',
  'code-reviewer': 'light',
  'validator': 'light',
  'build-verifier': 'light',
  'test-generator': 'light',
  'setup-analyzer': 'light',
};

/**
 * Determine the weight of a task by skill name.
 * Unknown skills default to heavy (safer to use Claude than risk bad output).
 */
export function getTaskWeight(skillName: string): TaskWeight {
  return SKILL_WEIGHTS[skillName] || 'heavy';
}

/**
 * Route a task to the optimal inference backend.
 *
 * Routing logic:
 * 1. Check task weight (heavy vs light)
 * 2. Light tasks → try Ollama first, fall back to Claude
 * 3. Heavy tasks → try Claude first, fall back to Ollama
 * 4. If preferred backend is down, use the other one
 */
export async function routeTask(
  skillName: string,
  userId: string
): Promise<RoutingDecision> {
  const weight = getTaskWeight(skillName);

  if (weight === 'light') {
    return routeLight(skillName, userId);
  }
  return routeHeavy(skillName, userId);
}

async function routeLight(skillName: string, userId: string): Promise<RoutingDecision> {
  // Prefer Ollama for light tasks (free, fast, local)
  const ollamaUp = await isOllamaAvailable();

  if (ollamaUp) {
    console.log(`[ModelRouter] ${skillName} (light) → Ollama`);
    return {
      backend: 'ollama',
      client: createOllamaClient() as unknown as Anthropic,
      reason: `Light task "${skillName}" routed to Ollama (free, local)`,
    };
  }

  // Fallback to Claude if Ollama is down
  console.log(`[ModelRouter] ${skillName} (light) → Claude (Ollama unavailable)`);
  try {
    const client = await getAnthropicClient(userId);
    return {
      backend: 'claude',
      client,
      reason: `Light task "${skillName}" routed to Claude (Ollama down)`,
    };
  } catch {
    throw new Error(
      `Cannot route task "${skillName}": Ollama is offline and no Anthropic API key configured.`
    );
  }
}

async function routeHeavy(skillName: string, userId: string): Promise<RoutingDecision> {
  // Prefer Claude for heavy tasks (better reasoning)
  try {
    const client = await getAnthropicClient(userId);
    console.log(`[ModelRouter] ${skillName} (heavy) → Claude`);
    return {
      backend: 'claude',
      client,
      reason: `Heavy task "${skillName}" routed to Claude (complex reasoning)`,
    };
  } catch {
    // Fallback to Ollama if Claude is unavailable
    const ollamaUp = await isOllamaAvailable();
    if (ollamaUp) {
      console.log(`[ModelRouter] ${skillName} (heavy) → Ollama (Claude unavailable)`);
      return {
        backend: 'ollama',
        client: createOllamaClient() as unknown as Anthropic,
        reason: `Heavy task "${skillName}" routed to Ollama (Claude unavailable)`,
      };
    }

    throw new Error(
      `Cannot route task "${skillName}": Claude API unavailable and Ollama is offline.`
    );
  }
}

/**
 * Get routing stats for display in the UI.
 */
export async function getRoutingStatus(): Promise<{
  ollamaAvailable: boolean;
  ollamaUrl: string;
  ollamaModels: string[];
  claudeConfigured: boolean;
  skillRouting: Record<string, { weight: TaskWeight; preferredBackend: InferenceBackend }>;
}> {
  const ollamaUp = await isOllamaAvailable();
  let ollamaModels: string[] = [];

  if (ollamaUp) {
    try {
      const res = await fetch(`${process.env.OLLAMA_URL || 'http://localhost:11434'}/api/tags`);
      const data = await res.json();
      ollamaModels = (data.models || []).map((m: { name: string }) => m.name);
    } catch {
      // ignore
    }
  }

  const skillRouting: Record<string, { weight: TaskWeight; preferredBackend: InferenceBackend }> = {};
  for (const [skill, weight] of Object.entries(SKILL_WEIGHTS)) {
    skillRouting[skill] = {
      weight,
      preferredBackend: weight === 'light' ? 'ollama' : 'claude',
    };
  }

  return {
    ollamaAvailable: ollamaUp,
    ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
    ollamaModels,
    claudeConfigured: !!process.env.ANTHROPIC_API_KEY,
    skillRouting,
  };
}
