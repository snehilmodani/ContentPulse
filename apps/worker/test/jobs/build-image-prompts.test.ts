import { describe, expect, it, vi } from 'vitest';
import { buildImagePrompts } from '../../src/jobs/visual-generation/build-image-prompts';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any;

function makeAiClient(responseText: string) {
  return {
    complete: vi.fn().mockResolvedValue({
      text: responseText,
      inputTokens: 10,
      outputTokens: 20,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    }),
  } as any;
}

const baseArgs = {
  visualTypes: ['thumbnail' as const],
  idea: { hookLine: 'AI is changing healthcare', coreArgument: 'Faster diagnosis saves lives' },
  brandKit: { primaryColors: [] as string[], brandingMode: 'flexible' as const },
  userId: 'u1',
  logger,
};

describe('buildImagePrompts — valid AI response', () => {
  it('parses JSON and returns Map with dalle + unsplash prompts for each visual type', async () => {
    const response = JSON.stringify({
      thumbnail: {
        dalle_prompt: 'A futuristic hospital scene with glowing AI interfaces',
        unsplash_query: 'AI hospital technology',
      },
    });

    const result = await buildImagePrompts({
      ...baseArgs,
      aiClient: makeAiClient(response),
    });

    expect(result.size).toBe(1);
    const prompts = result.get('thumbnail');
    expect(prompts?.dallePrompt).toBe('A futuristic hospital scene with glowing AI interfaces');
    expect(prompts?.unsplashQuery).toBe('AI hospital technology');
  });

  it('handles multiple visual types in a single call', async () => {
    const response = JSON.stringify({
      thumbnail: { dalle_prompt: 'Thumb prompt', unsplash_query: 'thumb query' },
      square_post: { dalle_prompt: 'Square prompt', unsplash_query: 'square query' },
    });

    const result = await buildImagePrompts({
      ...baseArgs,
      visualTypes: ['thumbnail', 'square_post'],
      aiClient: makeAiClient(response),
    });

    expect(result.size).toBe(2);
    expect(result.get('thumbnail')?.dallePrompt).toBe('Thumb prompt');
    expect(result.get('square_post')?.dallePrompt).toBe('Square prompt');
  });

  it('includes "MUST" in the user message when brandingMode is strict with colors', async () => {
    const aiClient = makeAiClient(JSON.stringify({
      thumbnail: { dalle_prompt: 'p', unsplash_query: 'q' },
    }));

    await buildImagePrompts({
      ...baseArgs,
      brandKit: { primaryColors: ['#ff0000', '#0000ff'], brandingMode: 'strict' },
      aiClient,
    });

    const callArgs = aiClient.complete.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContain('MUST');
  });
});

describe('buildImagePrompts — [STUB] response', () => {
  it('returns fallback prompts when AI responds with [STUB]', async () => {
    const result = await buildImagePrompts({
      ...baseArgs,
      aiClient: makeAiClient('[STUB] response not available'),
    });

    const prompts = result.get('thumbnail');
    expect(prompts).toBeDefined();
    // fallback dalle prompt contains the hook line text
    expect(prompts?.dallePrompt).toContain(baseArgs.idea.hookLine);
    // fallback unsplash query is the first 5 words of the hook
    expect(prompts?.unsplashQuery).toBe('AI is changing healthcare');
  });
});

describe('buildImagePrompts — invalid JSON response', () => {
  it('returns fallback prompts when AI response cannot be parsed', async () => {
    const result = await buildImagePrompts({
      ...baseArgs,
      aiClient: makeAiClient('not valid json at all'),
    });

    const prompts = result.get('thumbnail');
    expect(prompts).toBeDefined();
    expect(prompts?.dallePrompt).toContain(baseArgs.idea.hookLine);
  });

  it('strips markdown fences before parsing', async () => {
    const response = '```json\n' + JSON.stringify({
      thumbnail: { dalle_prompt: 'Clean AI scene', unsplash_query: 'AI clean' },
    }) + '\n```';

    const result = await buildImagePrompts({
      ...baseArgs,
      aiClient: makeAiClient(response),
    });

    expect(result.get('thumbnail')?.dallePrompt).toBe('Clean AI scene');
  });
});
