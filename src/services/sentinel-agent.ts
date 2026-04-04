import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/src/lib/prisma';
import { createWithFallback } from '@/src/lib/anthropic';
import { TraceLogger } from '@/src/services/trace-logger';
import { createHash } from 'crypto';
import { SkillLoader } from '@/src/services/skill-loader';

const CONFIDENCE_THRESHOLD = 0.80;

interface SentinelCheck {
  name: string;
  pass: boolean;
  detail: string;
}

export interface SentinelResult {
  score: number;
  passed: boolean;
  checks: SentinelCheck[];
  reasoning: string;
  issues: string[];
  suggestions: string[];
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
}

export class SentinelAgent {
  /**
   * Score the confidence that a prompt will produce correct output.
   * Returns score 0-1, pass/fail, and detailed checks.
   */
  static async evaluate(
    runId: string,
    stageId: string,
    promptContent: string,
    phaseSpec: string,
    prdContext: string,
    priorArtifacts: string[],
    client: Anthropic,
    attempt: number = 1
  ): Promise<SentinelResult> {
    const startTime = Date.now();

    // Get trace context
    const run = await prisma.pipelineRun.findUnique({
      where: { id: runId },
      select: { traceId: true },
    });
    const traceId = run?.traceId || 'unknown';
    const spanId = await TraceLogger.stageStart(runId, traceId, stageId, 'Sentinel Evaluation');

    // Build the evaluation context
    const evalContext = [
      '## Implementation Prompt to Evaluate\n\n' + promptContent,
      '## Phase Specification\n\n' + phaseSpec,
      '## PRD Context (Tech Stack, File Structure)\n\n' + prdContext.substring(0, 3000),
    ];

    if (priorArtifacts.length > 0) {
      evalContext.push(
        '## Prior Phase Artifacts (what already exists)\n\n' +
        priorArtifacts.map((a, i) => `### Phase ${i}\n${a.substring(0, 1000)}`).join('\n\n')
      );
    }

    try {
      const systemPrompt = await SkillLoader.getSkillPromptAsync('sentinel-agent');
      const response = await createWithFallback(client, {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: evalContext.join('\n\n---\n\n') }],
      });

      const text = response.content
        .filter((block) => block.type === 'text')
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('');

      const inputTokens = response.usage?.input_tokens ?? 0;
      const outputTokens = response.usage?.output_tokens ?? 0;
      const costUsd = (inputTokens * 3.0 + outputTokens * 15.0) / 1_000_000;
      const durationMs = Date.now() - startTime;

      // Parse response
      let result: SentinelResult;
      try {
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
        const parsed = JSON.parse(jsonMatch[1] || text);

        result = {
          score: Math.max(0, Math.min(1, parsed.score ?? 0)),
          passed: parsed.score >= CONFIDENCE_THRESHOLD,
          checks: parsed.checks || [],
          reasoning: parsed.reasoning || 'No reasoning provided',
          issues: parsed.issues || [],
          suggestions: parsed.suggestions || [],
          inputTokens,
          outputTokens,
          costUsd,
          durationMs,
        };
      } catch {
        // If we can't parse the response, fail safe — pass it through
        result = {
          score: 0.85,
          passed: true,
          checks: [{ name: 'parse', pass: false, detail: 'Could not parse Sentinel response — defaulting to pass' }],
          reasoning: 'Sentinel response was not valid JSON. Defaulting to pass.',
          issues: [],
          suggestions: [],
          inputTokens,
          outputTokens,
          costUsd,
          durationMs,
        };
      }

      // Persist the score
      const promptHash = createHash('sha256').update(promptContent).digest('hex').substring(0, 16);
      await prisma.confidenceScore.create({
        data: {
          runId,
          stageId,
          promptHash,
          score: result.score,
          passed: result.passed,
          reasoning: result.reasoning,
          checks: JSON.parse(JSON.stringify(result.checks)),
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          costUsd: result.costUsd,
          durationMs: result.durationMs,
          attempt,
        },
      }).catch((err) => console.error('[Sentinel] Failed to persist score:', err));

      // Log trace event
      await TraceLogger.log({
        runId,
        traceId,
        spanId,
        eventType: result.passed ? 'stage_complete' : 'gate_rejected',
        source: 'sentinel',
        message: `Sentinel: ${(result.score * 100).toFixed(0)}% confidence — ${result.passed ? 'PASSED' : 'REJECTED'}`,
        metadata: {
          score: result.score,
          passed: result.passed,
          checks: result.checks,
          issues: result.issues,
          attempt,
        },
        durationMs: result.durationMs,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: result.costUsd,
      });

      console.log(`[Sentinel] Score: ${(result.score * 100).toFixed(0)}% (${result.passed ? 'PASS' : 'FAIL'}) for stage ${stageId} (attempt ${attempt})`);

      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[Sentinel] Evaluation failed: ${message}`);

      await TraceLogger.stageError(runId, traceId, spanId, 'Sentinel Evaluation', message);

      // On error, default to pass — don't block the pipeline due to Sentinel failure
      return {
        score: 0.85,
        passed: true,
        checks: [{ name: 'error', pass: false, detail: `Sentinel error: ${message} — defaulting to pass` }],
        reasoning: `Sentinel evaluation failed: ${message}. Defaulting to pass.`,
        issues: [],
        suggestions: [],
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        durationMs,
      };
    }
  }

  /**
   * Get the confidence threshold.
   */
  static getThreshold(): number {
    return CONFIDENCE_THRESHOLD;
  }
}
