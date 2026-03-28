/**
 * Ollama client that mimics the Anthropic SDK interface.
 * Used as a fallback when Anthropic API credits run out.
 */

const OLLAMA_BASE = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ContentBlock {
  type: 'text';
  text: string;
}

interface MessageResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: ContentBlock[];
  model: string;
  stop_reason: 'end_turn';
  usage: { input_tokens: number; output_tokens: number };
}

interface StreamEvent {
  type: string;
  delta: { type: string; text: string };
}

function convertMessages(
  system: string | undefined,
  messages: Array<{ role: string; content: string | Array<{ type: string; text?: string }> }>
): Message[] {
  const result: Message[] = [];

  if (system) {
    result.push({ role: 'system', content: system });
  }

  for (const msg of messages) {
    const content = typeof msg.content === 'string'
      ? msg.content
      : msg.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text || '')
          .join('');
    result.push({ role: msg.role as 'user' | 'assistant', content });
  }

  return result;
}

/**
 * Non-streaming call — mimics client.messages.create()
 */
async function create(params: {
  model?: string;
  max_tokens?: number;
  system?: string;
  messages: Array<{ role: string; content: string | Array<{ type: string; text?: string }> }>;
}): Promise<MessageResponse> {
  const ollamaMessages = convertMessages(params.system, params.messages);

  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: ollamaMessages,
      stream: false,
      options: {
        num_predict: params.max_tokens || 4096,
        temperature: 0.7,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const responseText = data.message?.content || '';

  return {
    id: `ollama-${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: responseText }],
    model: OLLAMA_MODEL,
    stop_reason: 'end_turn',
    usage: {
      input_tokens: data.prompt_eval_count || 0,
      output_tokens: data.eval_count || 0,
    },
  };
}

/**
 * Streaming call — mimics client.messages.stream()
 * Returns an async iterable that yields Anthropic-compatible events,
 * plus an abort() method.
 */
function stream(params: {
  model?: string;
  max_tokens?: number;
  system?: string;
  messages: Array<{ role: string; content: string | Array<{ type: string; text?: string }> }>;
}) {
  const ollamaMessages = convertMessages(params.system, params.messages);
  const controller = new AbortController();

  const iterable = {
    abort: () => controller.abort(),

    async *[Symbol.asyncIterator](): AsyncGenerator<StreamEvent> {
      const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages: ollamaMessages,
          stream: true,
          options: {
            num_predict: params.max_tokens || 8192,
            temperature: 0.7,
          },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Ollama stream error ${res.status}: ${text}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Ollama streams newline-delimited JSON
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.message?.content) {
              yield {
                type: 'content_block_delta',
                delta: { type: 'text_delta', text: data.message.content },
              };
            }
          } catch {
            // skip malformed lines
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer);
          if (data.message?.content) {
            yield {
              type: 'content_block_delta',
              delta: { type: 'text_delta', text: data.message.content },
            };
          }
        } catch {
          // ignore
        }
      }
    },
  };

  return iterable;
}

/**
 * Creates a duck-typed Anthropic client that routes to Ollama.
 * Compatible with the Anthropic SDK interface used throughout the app.
 */
export function createOllamaClient(): unknown {
  console.log(`[Ollama] Using fallback: ${OLLAMA_BASE} with model ${OLLAMA_MODEL}`);

  return {
    messages: {
      create,
      stream,
    },
  };
}

/**
 * Check if Ollama is reachable and the configured model exists.
 */
export async function isOllamaAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return false;

    const data = await res.json();
    const models = data.models?.map((m: { name: string }) => m.name) || [];
    const hasModel = models.some((name: string) =>
      name === OLLAMA_MODEL || name.startsWith(`${OLLAMA_MODEL}:`)
    );

    if (!hasModel) {
      console.warn(`[Ollama] Model "${OLLAMA_MODEL}" not found. Available: ${models.join(', ')}`);
      // Still return true — Ollama will pull the model on first request
    }

    return true;
  } catch {
    return false;
  }
}
