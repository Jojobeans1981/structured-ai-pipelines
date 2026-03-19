import Anthropic from '@anthropic-ai/sdk';
import { SkillLoader } from '@/src/services/skill-loader';
import { handleAnthropicCreditError } from '@/src/lib/anthropic';

export class StageExecutor {
  private client: Anthropic;

  constructor(client: Anthropic) {
    this.client = client;
  }

  async *executeStage(
    skillName: string,
    context: string,
    previousArtifacts: string[],
    signal?: AbortSignal
  ): AsyncGenerator<string, string, undefined> {
    const systemPrompt = SkillLoader.getSkillPrompt(skillName);

    // Build messages: include previous artifacts as context
    const messages: Anthropic.MessageParam[] = [];

    for (const artifact of previousArtifacts) {
      messages.push({ role: 'assistant', content: artifact });
      messages.push({ role: 'user', content: 'Proceed to the next stage.' });
    }

    // Current stage input
    messages.push({ role: 'user', content: context });

    console.log(`[StageExecutor] Executing skill: ${skillName}, context length: ${context.length}, prior artifacts: ${previousArtifacts.length}`);

    let fullText = '';

    const streamParams = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: systemPrompt,
      messages,
    };

    let activeStream: { abort: () => void; [Symbol.asyncIterator]: () => AsyncIterator<unknown> };

    try {
      activeStream = this.client.messages.stream(streamParams);
    } catch (err: unknown) {
      const fallback = await this.handleFallback(err);
      if (fallback) {
        activeStream = fallback.messages.stream(streamParams);
      } else {
        throw err;
      }
    }

    if (signal) {
      signal.addEventListener('abort', () => {
        activeStream.abort();
      });
    }

    try {
      for await (const event of activeStream as AsyncIterable<{ type: string; delta: { type: string; text: string } }>) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          const text = event.delta.text;
          fullText += text;
          yield text;
        }
      }
    } catch (err: unknown) {
      // If we get a credit error mid-stream, retry with Ollama
      if (this.isCreditError(err) && fullText === '') {
        const fallback = await this.handleFallback(err);
        if (fallback) {
          this.client = fallback as unknown as Anthropic;
          const retryStream = fallback.messages.stream(streamParams);
          if (signal) {
            signal.addEventListener('abort', () => retryStream.abort());
          }
          for await (const event of retryStream as AsyncIterable<{ type: string; delta: { type: string; text: string } }>) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              fullText += event.delta.text;
              yield event.delta.text;
            }
          }
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }

    return fullText;
  }

  private isCreditError(err: unknown): boolean {
    const status = (err as { status?: number })?.status;
    const msg = (err as { message?: string })?.message || '';
    return status === 400 && msg.includes('credit balance');
  }

  private async handleFallback(err: unknown): Promise<Anthropic | null> {
    if (this.isCreditError(err)) {
      console.log('[StageExecutor] Anthropic out of credits, switching to Ollama');
      const fallback = await handleAnthropicCreditError();
      return fallback as unknown as Anthropic | null;
    }
    return null;
  }
}
