import Groq from 'groq-sdk';

const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

let groqClient: Groq | null = null;

function getGroqClient(): Groq | null {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  if (!groqClient) {
    groqClient = new Groq({ apiKey });
  }
  return groqClient;
}

export async function isGroqAvailable(): Promise<boolean> {
  const client = getGroqClient();
  if (!client) return false;
  try {
    await client.models.list();
    return true;
  } catch {
    return false;
  }
}

/**
 * Create an Anthropic-compatible wrapper around Groq.
 * Maps the Anthropic messages.create() API to Groq's chat.completions API
 * so it can be used as a drop-in fallback.
 */
export function createGroqCompatClient(): GroqAnthropicCompat {
  const client = getGroqClient();
  if (!client) throw new Error('GROQ_API_KEY not set');
  return new GroqAnthropicCompat(client);
}

class GroqAnthropicCompat {
  private client: Groq;
  messages: GroqMessagesCompat;

  constructor(client: Groq) {
    this.client = client;
    this.messages = new GroqMessagesCompat(client);
  }
}

class GroqMessagesCompat {
  private client: Groq;

  constructor(client: Groq) {
    this.client = client;
  }

  /**
   * Mimics Anthropic's client.messages.stream() — returns an object
   * that is async-iterable and has an abort() method.
   */
  stream(params: {
    model: string;
    max_tokens: number;
    system: string;
    messages: Array<{ role: string; content: string }>;
  }): { abort: () => void; [Symbol.asyncIterator]: () => AsyncIterator<unknown> } {
    let aborted = false;
    const client = this.client;

    const groqMessages: Groq.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: params.system },
      ...params.messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    // We need to create the stream lazily since stream() is not async
    let streamPromise: Promise<AsyncIterable<unknown>> | null = null;

    function getStream() {
      if (!streamPromise) {
        streamPromise = client.chat.completions.create({
          model: GROQ_MODEL,
          messages: groqMessages,
          max_tokens: params.max_tokens,
          stream: true,
        }) as Promise<AsyncIterable<unknown>>;
      }
      return streamPromise;
    }

    return {
      abort: () => { aborted = true; },
      [Symbol.asyncIterator]: () => {
        let started = false;
        let innerIterator: AsyncIterator<unknown> | null = null;
        let sentFinal = false;
        let inputTokens = 0;
        let outputTokens = 0;

        return {
          async next(): Promise<IteratorResult<unknown>> {
            if (aborted) return { done: true, value: undefined };

            if (!started) {
              started = true;
              const stream = await getStream();
              innerIterator = (stream as AsyncIterable<unknown>)[Symbol.asyncIterator]();
            }

            if (!innerIterator) return { done: true, value: undefined };

            const result = await innerIterator.next();
            if (result.done) {
              if (!sentFinal) {
                sentFinal = true;
                return {
                  done: false,
                  value: {
                    type: 'message_delta',
                    usage: { output_tokens: outputTokens, input_tokens: inputTokens },
                  },
                };
              }
              return { done: true, value: undefined };
            }

            const chunk = result.value as Record<string, unknown>;
            const choices = chunk.choices as Array<{ delta?: { content?: string } }> | undefined;
            const delta = choices?.[0]?.delta;

            // Track usage if present
            const chunkUsage = chunk.usage as Record<string, number> | undefined;
            if (chunkUsage) {
              inputTokens = chunkUsage.prompt_tokens || inputTokens;
              outputTokens = chunkUsage.completion_tokens || outputTokens;
            }

            if (delta?.content) {
              return {
                done: false,
                value: {
                  type: 'content_block_delta',
                  delta: { type: 'text_delta', text: delta.content },
                },
              };
            }

            // Skip chunks with no content delta
            return this.next();
          },
        };
      },
    };
  }

  async create(params: {
    model: string;
    max_tokens: number;
    system: string;
    messages: Array<{ role: string; content: string }>;
    stream?: boolean;
  }): Promise<unknown> {
    const groqMessages: Groq.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: params.system },
      ...params.messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    if (params.stream) {
      const stream = await this.client.chat.completions.create({
        model: GROQ_MODEL,
        messages: groqMessages,
        max_tokens: params.max_tokens,
        stream: true,
      });

      // Return an async iterable that mimics Anthropic's stream format
      return {
        [Symbol.asyncIterator]: async function* () {
          let inputTokens = 0;
          let outputTokens = 0;

          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta;
            if (delta?.content) {
              yield {
                type: 'content_block_delta',
                delta: { type: 'text_delta', text: delta.content },
              };
            }
            const chunkAny = chunk as unknown as Record<string, unknown>;
            if (chunkAny.usage) {
              const usage = chunkAny.usage as Record<string, number>;
              inputTokens = usage.prompt_tokens || 0;
              outputTokens = usage.completion_tokens || 0;
            }
          }

          // Emit final message for token tracking
          yield {
            type: 'message_delta',
            usage: { input_tokens: inputTokens, output_tokens: outputTokens },
          };
        },
      };
    }

    // Non-streaming
    const response = await this.client.chat.completions.create({
      model: GROQ_MODEL,
      messages: groqMessages,
      max_tokens: params.max_tokens,
    });

    const text = response.choices[0]?.message?.content || '';

    // Map to Anthropic Message format
    return {
      id: response.id,
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text }],
      model: GROQ_MODEL,
      usage: {
        input_tokens: response.usage?.prompt_tokens || 0,
        output_tokens: response.usage?.completion_tokens || 0,
      },
    };
  }
}
