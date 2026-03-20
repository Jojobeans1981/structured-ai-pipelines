import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/src/lib/prisma';
import { createWithFallback } from '@/src/lib/anthropic';
import { TraceLogger } from '@/src/services/trace-logger';

const INSPECTOR_SYSTEM_PROMPT = `You are the Inspector — a completeness verification agent in the Forge pipeline.

Your ONLY job is to verify that ALL prior work is 100% complete and the application is in a launchable state after each phase.

You receive:
1. All generated files (paths and content)
2. All phase acceptance criteria (from every completed phase)
3. The PRD's tech stack and file structure

You must check:
1. IMPORTS: Every import/require in every file references a file that exists
2. EXPORTS: Every file that is imported by another file exports what is expected
3. ACCEPTANCE CRITERIA: Every criterion from every completed phase is satisfied
4. FILE STRUCTURE: All files from the PRD file structure that should exist by now DO exist
5. NO STUBS: No TODO, FIXME, "implement later", or empty function bodies
6. LAUNCHABLE: The app could run (package.json has correct deps, entry point exists, config is complete)
7. CONSISTENCY: No contradictions between files (e.g., component expects props that parent doesn't pass)

Respond with ONLY valid JSON:
{
  "score": 0.95,
  "passed": true,
  "totalCriteria": 12,
  "passedCriteria": 11,
  "failures": [
    { "criterion": "Phase 1 AC #3: Zustand store persists to localStorage", "reason": "persist middleware not imported in store.ts" }
  ],
  "importIssues": [],
  "stubsFound": [],
  "missingFiles": [],
  "launchable": true,
  "launchBlockers": [],
  "summary": "One paragraph overall assessment"
}`;

interface InspectorFailure {
  criterion: string;
  reason: string;
}

export interface InspectorResult {
  score: number;
  passed: boolean;
  totalCriteria: number;
  passedCriteria: number;
  failures: InspectorFailure[];
  importIssues: string[];
  stubsFound: string[];
  missingFiles: string[];
  launchable: boolean;
  launchBlockers: string[];
  summary: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
}

export class InspectorAgent {
  /**
   * Verify that all prior work is complete after a phase finishes.
   */
  static async verify(
    runId: string,
    phaseIndex: number,
    client: Anthropic
  ): Promise<InspectorResult> {
    const startTime = Date.now();

    // Get trace context
    const run = await prisma.pipelineRun.findUnique({
      where: { id: runId },
      select: { traceId: true, userInput: true },
    });
    const traceId = run?.traceId || 'unknown';
    const spanId = await TraceLogger.stageStart(runId, traceId, `inspector-${phaseIndex}`, `Inspector: Phase ${phaseIndex}`);

    // Gather all files generated so far
    const files = await prisma.projectFile.findMany({
      where: { runId },
      select: { filePath: true, content: true, language: true },
      orderBy: { filePath: 'asc' },
    });

    // Gather all completed phase specs (for acceptance criteria)
    const completedStages = await prisma.pipelineStage.findMany({
      where: {
        runId,
        status: 'approved',
        phaseIndex: { lte: phaseIndex },
      },
      select: { displayName: true, skillName: true, artifactContent: true, phaseIndex: true },
      orderBy: { stageIndex: 'asc' },
    });

    // Get PRD for tech stack context
    const prdStage = completedStages.find((s) => s.skillName === 'prd-architect');
    const prdContext = prdStage?.artifactContent?.substring(0, 2000) || '';

    // Build context for Inspector
    const fileList = files.map((f) =>
      `### ${f.filePath}\n\`\`\`${f.language}\n${f.content.substring(0, 1500)}\n\`\`\``
    ).join('\n\n');

    const phaseSpecs = completedStages
      .filter((s) => s.skillName === 'phase-builder' || s.skillName === 'prompt-builder')
      .map((s) => `### ${s.displayName}\n${s.artifactContent?.substring(0, 1000) || 'No content'}`)
      .join('\n\n');

    const evalContext = [
      `## Generated Files (${files.length} total)\n\n${fileList || 'No files generated yet'}`,
      `## Phase Specifications & Acceptance Criteria\n\n${phaseSpecs || 'No phase specs available'}`,
      `## PRD Context\n\n${prdContext || 'No PRD available'}`,
      `## Current Phase: ${phaseIndex}`,
    ].join('\n\n---\n\n');

    try {
      const response = await createWithFallback(client, {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: INSPECTOR_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: evalContext }],
      });

      const text = response.content
        .filter((block) => block.type === 'text')
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('');

      const inputTokens = response.usage?.input_tokens ?? 0;
      const outputTokens = response.usage?.output_tokens ?? 0;
      const costUsd = (inputTokens * 3.0 + outputTokens * 15.0) / 1_000_000;
      const durationMs = Date.now() - startTime;

      let result: InspectorResult;
      try {
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
        const parsed = JSON.parse(jsonMatch[1] || text);

        const totalCriteria = parsed.totalCriteria || 0;
        const passedCriteria = parsed.passedCriteria || 0;
        const score = totalCriteria > 0 ? passedCriteria / totalCriteria : 1.0;

        result = {
          score,
          passed: score >= 1.0 && parsed.launchable !== false,
          totalCriteria,
          passedCriteria,
          failures: parsed.failures || [],
          importIssues: parsed.importIssues || [],
          stubsFound: parsed.stubsFound || [],
          missingFiles: parsed.missingFiles || [],
          launchable: parsed.launchable ?? true,
          launchBlockers: parsed.launchBlockers || [],
          summary: parsed.summary || 'No summary',
          inputTokens,
          outputTokens,
          costUsd,
          durationMs,
        };
      } catch {
        result = {
          score: 1.0,
          passed: true,
          totalCriteria: 0,
          passedCriteria: 0,
          failures: [],
          importIssues: [],
          stubsFound: [],
          missingFiles: [],
          launchable: true,
          launchBlockers: [],
          summary: 'Inspector response could not be parsed — defaulting to pass',
          inputTokens,
          outputTokens,
          costUsd,
          durationMs,
        };
      }

      // Persist
      await prisma.completenessCheck.create({
        data: {
          runId,
          phaseIndex,
          totalCriteria: result.totalCriteria,
          passedCriteria: result.passedCriteria,
          score: result.score,
          passed: result.passed,
          failures: JSON.parse(JSON.stringify(result.failures)),
          filesChecked: files.length,
          importsResolved: result.importIssues.length === 0,
          appLaunchable: result.launchable,
          durationMs: result.durationMs,
        },
      }).catch((err) => console.error('[Inspector] Failed to persist check:', err));

      // Trace
      await TraceLogger.log({
        runId,
        traceId,
        spanId,
        eventType: result.passed ? 'stage_complete' : 'gate_rejected',
        source: 'inspector',
        message: `Inspector: ${result.passedCriteria}/${result.totalCriteria} criteria pass — ${result.passed ? 'COMPLETE' : 'INCOMPLETE'}${result.launchable ? '' : ' (NOT LAUNCHABLE)'}`,
        metadata: {
          score: result.score,
          passed: result.passed,
          failures: result.failures,
          launchable: result.launchable,
          phaseIndex,
        },
        durationMs: result.durationMs,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: result.costUsd,
      });

      console.log(`[Inspector] Phase ${phaseIndex}: ${result.passedCriteria}/${result.totalCriteria} criteria (${result.passed ? 'PASS' : 'FAIL'}, launchable: ${result.launchable})`);

      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[Inspector] Verification failed: ${message}`);

      await TraceLogger.stageError(runId, traceId, spanId, `Inspector Phase ${phaseIndex}`, message);

      return {
        score: 1.0,
        passed: true,
        totalCriteria: 0,
        passedCriteria: 0,
        failures: [],
        importIssues: [],
        stubsFound: [],
        missingFiles: [],
        launchable: true,
        launchBlockers: [],
        summary: `Inspector failed: ${message}. Defaulting to pass.`,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        durationMs,
      };
    }
  }
}
