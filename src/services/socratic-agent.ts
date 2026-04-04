import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/src/lib/prisma';
import { createWithFallback } from '@/src/lib/anthropic';
import { TraceLogger } from '@/src/services/trace-logger';
import { LearningStore } from '@/src/services/learning-store';
import { SkillLoader } from '@/src/services/skill-loader';

export interface SocraticQuestion {
  id: string;
  question: string;
  severity: 'blocking' | 'clarifying';
  defaultAnswer: string;
  context: string;
  userAnswer?: string;
}

export interface SocraticResult {
  diagnosis: string;
  rootCause: string;
  questions: SocraticQuestion[];
  suggestedFix: string;
  canAutoResolve: boolean;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
}

export class SocraticAgent {
  /** How many rejections before Socrates intervenes */
  private static readonly INTERVENTION_THRESHOLD = 2;
  /** Timeout before using default answers (ms) */
  private static readonly AUTO_RESOLVE_TIMEOUT_MS = 120_000; // 2 minutes

  /**
   * Check if Socratic intervention is needed for a stage.
   * Returns true if the stage has been rejected >= INTERVENTION_THRESHOLD times.
   */
  static shouldIntervene(retryCount: number): boolean {
    return retryCount >= SocraticAgent.INTERVENTION_THRESHOLD;
  }

  /**
   * Analyze a stuck stage and generate clarifying questions.
   */
  static async analyze(
    runId: string,
    stageId: string,
    artifactContent: string,
    rejectionFeedback: string,
    specification: string,
    priorAttempts: string[],
    client: Anthropic
  ): Promise<SocraticResult> {
    const startTime = Date.now();

    const run = await prisma.pipelineRun.findUnique({
      where: { id: runId },
      select: { traceId: true },
    });
    const traceId = run?.traceId || 'unknown';
    const spanId = await TraceLogger.stageStart(runId, traceId, stageId, 'Socratic Analysis');

    const evalContext = [
      '## Rejected Artifact\n\n' + artifactContent.substring(0, 3000),
      '## Rejection Feedback\n\n' + rejectionFeedback,
      '## Specification (Source of Truth)\n\n' + specification.substring(0, 3000),
    ];

    if (priorAttempts.length > 0) {
      evalContext.push(
        '## Prior Failed Attempts\n\n' +
        priorAttempts.map((a, i) => `### Attempt ${i + 1}\n${a.substring(0, 800)}`).join('\n\n')
      );
    }

    try {
      const systemPrompt = await SkillLoader.getSkillPromptAsync('socratic-agent');
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

      let result: SocraticResult;
      try {
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
        const parsed = JSON.parse(jsonMatch[1] || text);

        result = {
          diagnosis: parsed.diagnosis || 'Unable to diagnose',
          rootCause: parsed.rootCause || 'unknown',
          questions: (parsed.questions || []).map((q: SocraticQuestion, i: number) => ({
            id: q.id || `q${i + 1}`,
            question: q.question,
            severity: q.severity || 'clarifying',
            defaultAnswer: q.defaultAnswer || '',
            context: q.context || '',
          })),
          suggestedFix: parsed.suggestedFix || '',
          canAutoResolve: parsed.canAutoResolve ?? true,
          inputTokens,
          outputTokens,
          costUsd,
          durationMs,
        };
      } catch {
        result = {
          diagnosis: 'Could not parse Socratic analysis',
          rootCause: 'unknown',
          questions: [],
          suggestedFix: '',
          canAutoResolve: true,
          inputTokens,
          outputTokens,
          costUsd,
          durationMs,
        };
      }

      // Record in learning store
      await LearningStore.recordRejection(
        'socratic',
        'foreman',
        `Socratic intervention: ${result.diagnosis} (root cause: ${result.rootCause})`,
        runId,
        stageId
      ).catch(() => {});

      await TraceLogger.log({
        runId,
        traceId,
        spanId,
        eventType: 'stage_complete',
        source: 'socratic',
        message: `Socrates: ${result.diagnosis}`,
        metadata: {
          rootCause: result.rootCause,
          questionCount: result.questions.length,
          canAutoResolve: result.canAutoResolve,
        },
        durationMs: result.durationMs,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: result.costUsd,
      });

      console.log(`[Socratic] Diagnosis: ${result.diagnosis} (${result.questions.length} questions, root cause: ${result.rootCause})`);

      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[Socratic] Analysis failed: ${message}`);

      return {
        diagnosis: `Socratic analysis failed: ${message}`,
        rootCause: 'unknown',
        questions: [],
        suggestedFix: '',
        canAutoResolve: true,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        durationMs,
      };
    }
  }

  /**
   * Build context injection from Socratic answers (either user-provided or defaults).
   * This gets injected into the retry context so the agent has the answers.
   */
  static buildAnswerContext(result: SocraticResult): string {
    if (result.questions.length === 0) return '';

    const answered = result.questions.map((q) => {
      const answer = q.userAnswer || q.defaultAnswer;
      const source = q.userAnswer ? 'User' : 'Auto-resolved (default)';
      return `**Q:** ${q.question}\n**A (${source}):** ${answer}`;
    });

    return '\n\n## Socratic Clarifications\n\n' +
      `**Diagnosis:** ${result.diagnosis}\n\n` +
      `**Root Cause:** ${result.rootCause}\n\n` +
      answered.join('\n\n') +
      `\n\n**Suggested approach:** ${result.suggestedFix}\n\n` +
      'Use these answers to resolve the issues that caused prior rejections.\n';
  }

  static getInterventionThreshold(): number {
    return SocraticAgent.INTERVENTION_THRESHOLD;
  }
}
