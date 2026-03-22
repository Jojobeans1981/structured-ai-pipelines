import Anthropic from '@anthropic-ai/sdk';
import { SkillLoader } from '@/src/services/skill-loader';
import { handleAnthropicCreditError } from '@/src/lib/anthropic';
import { type TokenUsage } from '@/src/services/cost-tracker';

export class StageExecutor {
  private client: Anthropic;

  /** Token usage from the last executeStage() call. Read after iteration completes. */
  public lastUsage: TokenUsage | null = null;

  constructor(client: Anthropic) {
    this.client = client;
  }

  async *executeStage(
    skillName: string,
    context: string,
    previousArtifacts: string[],
    signal?: AbortSignal
  ): AsyncGenerator<string, string, undefined> {
    this.lastUsage = null;
    const systemPrompt = await SkillLoader.getSkillPromptAsync(skillName);

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
    let usedOllama = false;

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
        usedOllama = true;
      } else {
        throw err;
      }
    }

    if (signal) {
      signal.addEventListener('abort', () => {
        activeStream.abort();
      });
    }

    let inputTokens = 0;
    let outputTokens = 0;

    try {
      for await (const event of activeStream as AsyncIterable<{
        type: string;
        delta: { type: string; text: string };
        message?: { usage?: { input_tokens: number; output_tokens: number } };
        usage?: { input_tokens?: number; output_tokens?: number };
      }>) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          const text = event.delta.text;
          fullText += text;
          yield text;
        }
        // Capture usage from message_start event
        if (event.type === 'message_start' && event.message?.usage) {
          inputTokens = event.message.usage.input_tokens || 0;
        }
        // Capture usage from message_delta event (output tokens)
        if (event.type === 'message_delta' && event.usage) {
          outputTokens = event.usage.output_tokens || 0;
        }
      }
    } catch (err: unknown) {
      // If we get a credit error mid-stream, retry with Ollama
      if (this.isCreditError(err) && fullText === '') {
        const fallback = await this.handleFallback(err);
        if (fallback) {
          this.client = fallback as unknown as Anthropic;
          usedOllama = true;
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

    // Estimate tokens from text length if stream didn't provide usage (Groq/Ollama)
    if (inputTokens === 0 && outputTokens === 0 && fullText.length > 0) {
      // Rough estimate: ~4 chars per token
      const contextLength = context.length + previousArtifacts.join('').length + systemPrompt.length;
      inputTokens = Math.round(contextLength / 4);
      outputTokens = Math.round(fullText.length / 4);
    }

    // Detect which backend was actually used
    const isGroq = !!(process.env.GROQ_API_KEY && usedOllama);
    const isFallback = usedOllama || isGroq;
    let model: string;
    let backend: 'anthropic' | 'ollama';

    // Check if this client is a Groq wrapper by looking for the class name or env
    const clientName = (this.client as unknown as { constructor: { name: string } })?.constructor?.name || '';
    if (clientName === 'GroqAnthropicCompat' || (process.env.GROQ_API_KEY && isFallback)) {
      model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
      backend = 'ollama'; // Use 'ollama' for cost tracking (free tier)
    } else if (usedOllama) {
      model = process.env.OLLAMA_MODEL || 'llama3.1:8b';
      backend = 'ollama';
    } else {
      model = 'claude-sonnet-4-20250514';
      backend = 'anthropic';
    }

    this.lastUsage = {
      inputTokens,
      outputTokens,
      model,
      backend,
    };

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
