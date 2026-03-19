import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/src/lib/prisma';
import { decryptApiKey } from '@/src/lib/encryption';
import { createOllamaClient, isOllamaAvailable } from '@/src/lib/ollama-client';

// Track if Anthropic API is known to be out of credits
let anthropicDisabled = false;
let lastAnthropicCheck = 0;

export function createAnthropicClient(encryptedApiKey: string): Anthropic {
  const apiKey = decryptApiKey(encryptedApiKey);
  return new Anthropic({ apiKey });
}

export async function getAnthropicClient(userId: string): Promise<Anthropic> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { encryptedApiKey: true },
  });

  // If Anthropic is disabled (out of credits), try Ollama directly
  // Re-check Anthropic every 5 minutes in case credits were added
  const now = Date.now();
  if (anthropicDisabled && now - lastAnthropicCheck < 5 * 60 * 1000) {
    console.log('[LLM] Anthropic disabled (no credits), using Ollama fallback');
    const ollamaUp = await isOllamaAvailable();
    if (ollamaUp) {
      return createOllamaClient() as unknown as Anthropic;
    }
    throw new Error('Anthropic API has no credits and Ollama is not reachable. Please add credits or start Ollama.');
  }

  if (anthropicDisabled) {
    // Reset and try Anthropic again
    anthropicDisabled = false;
    lastAnthropicCheck = now;
  }

  if (!user?.encryptedApiKey) {
    // No API key — try Ollama
    console.log('[LLM] No Anthropic API key, trying Ollama fallback');
    const ollamaUp = await isOllamaAvailable();
    if (ollamaUp) {
      return createOllamaClient() as unknown as Anthropic;
    }
    throw new Error('No API key configured and Ollama is not reachable. Please add your Anthropic API key in Settings or start Ollama.');
  }

  return createAnthropicClient(user.encryptedApiKey);
}

/**
 * Mark Anthropic as out of credits and switch to Ollama.
 * Called when we get a 400 "credit balance too low" error.
 */
export async function handleAnthropicCreditError(): Promise<Anthropic | null> {
  anthropicDisabled = true;
  lastAnthropicCheck = Date.now();
  console.log('[LLM] Anthropic out of credits — switching to Ollama fallback');

  const ollamaUp = await isOllamaAvailable();
  if (ollamaUp) {
    return createOllamaClient() as unknown as Anthropic;
  }
  return null;
}

export async function callWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      const isRateLimit = status === 429;
      const isOverloaded = status === 529;

      if ((isRateLimit || isOverloaded) && attempt < maxRetries) {
        const retryAfter = parseRetryAfter(err) || Math.min(15 * 2 ** attempt, 120);
        console.log(`[Anthropic] Rate limited (${status}), retrying in ${retryAfter}s (attempt ${attempt + 1}/${maxRetries})`);
        await sleep(retryAfter * 1000);
        continue;
      }
      throw err;
    }
  }
  throw new Error('Unreachable');
}

function parseRetryAfter(err: unknown): number | null {
  const headers = (err as { headers?: Record<string, string> })?.headers;
  const val = headers?.['retry-after'];
  if (!val) return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wrapper for client.messages.create() that handles credit errors
 * by auto-falling back to Ollama.
 */
export async function createWithFallback(
  client: Anthropic,
  params: {
    model: string;
    max_tokens: number;
    system: string;
    messages: Anthropic.MessageParam[];
  }
): Promise<Anthropic.Message> {
  try {
    return await client.messages.create(params);
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;
    const msg = (err as { message?: string })?.message || '';

    if ((status === 400 && msg.includes('credit balance')) || status === 429) {
      console.log('[LLM] Anthropic unavailable, trying Ollama fallback');
      const fallback = await handleAnthropicCreditError();
      if (fallback) {
        return (fallback as unknown as Anthropic).messages.create(params);
      }
    }
    throw err;
  }
}
