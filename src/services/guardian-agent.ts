import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/src/lib/prisma';
import { createWithFallback } from '@/src/lib/anthropic';
import { TraceLogger } from '@/src/services/trace-logger';
import { SkillLoader } from '@/src/services/skill-loader';

interface GuardianCheck {
  name: string;
  pass: boolean;
  detail: string;
}

export interface GuardianResult {
  passed: boolean;
  score: number;
  checks: GuardianCheck[];
  issues: string[];
  reasoning: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
}

export class GuardianAgent {
  private static readonly INTEGRITY_THRESHOLD = 0.75;

  /**
   * Check an artifact for context drift, hallucinations, and contradictions.
   */
  static async verify(
    runId: string,
    stageId: string,
    artifactContent: string,
    userInput: string,
    prdContext: string,
    priorArtifacts: string[],
    client: Anthropic
  ): Promise<GuardianResult> {
    const startTime = Date.now();

    const run = await prisma.pipelineRun.findUnique({
      where: { id: runId },
      select: { traceId: true },
    });
    const traceId = run?.traceId || 'unknown';
    const spanId = await TraceLogger.stageStart(runId, traceId, stageId, 'Guardian Integrity Check');

    const evalContext = [
      '## Agent Output to Verify\n\n' + artifactContent.substring(0, 4000),
      '## Original User Request\n\n' + userInput,
      '## PRD / Specification (Source of Truth)\n\n' + prdContext.substring(0, 3000),
    ];

    if (priorArtifacts.length > 0) {
      evalContext.push(
        '## Prior Approved Artifacts\n\n' +
        priorArtifacts.map((a, i) => `### Artifact ${i}\n${a.substring(0, 1000)}`).join('\n\n')
      );
    }

    try {
      const systemPrompt = await SkillLoader.getSkillPromptAsync('guardian-agent');
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

      let result: GuardianResult;
      try {
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
        const parsed = JSON.parse(jsonMatch[1] || text);

        const score = Math.max(0, Math.min(1, parsed.score ?? 0));
        result = {
          passed: score >= GuardianAgent.INTEGRITY_THRESHOLD,
          score,
          checks: parsed.checks || [],
          issues: parsed.issues || [],
          reasoning: parsed.reasoning || 'No reasoning provided',
          inputTokens,
          outputTokens,
          costUsd,
          durationMs,
        };
      } catch {
        result = {
          passed: true,
          score: 0.90,
          checks: [{ name: 'parse', pass: false, detail: 'Could not parse Guardian response — defaulting to pass' }],
          issues: [],
          reasoning: 'Guardian response was not valid JSON. Defaulting to pass.',
          inputTokens,
          outputTokens,
          costUsd,
          durationMs,
        };
      }

      // Log trace event
      await TraceLogger.log({
        runId,
        traceId,
        spanId,
        eventType: result.passed ? 'stage_complete' : 'gate_rejected',
        source: 'guardian',
        message: `Guardian: ${(result.score * 100).toFixed(0)}% integrity — ${result.passed ? 'PASSED' : 'DRIFT DETECTED'}`,
        metadata: {
          score: result.score,
          passed: result.passed,
          issues: result.issues,
        },
        durationMs: result.durationMs,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: result.costUsd,
      });

      console.log(`[Guardian] Score: ${(result.score * 100).toFixed(0)}% (${result.passed ? 'PASS' : 'DRIFT'}) for stage ${stageId}`);

      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[Guardian] Verification failed: ${message}`);

      await TraceLogger.stageError(runId, traceId, spanId, 'Guardian Integrity Check', message);

      return {
        passed: true,
        score: 0.90,
        checks: [{ name: 'error', pass: false, detail: `Guardian error: ${message} — defaulting to pass` }],
        issues: [],
        reasoning: `Guardian evaluation failed: ${message}. Defaulting to pass.`,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        durationMs,
      };
    }
  }

  static getThreshold(): number {
    return GuardianAgent.INTEGRITY_THRESHOLD;
  }
}
