import Groq from 'groq-sdk';

const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-70b-versatile';

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
