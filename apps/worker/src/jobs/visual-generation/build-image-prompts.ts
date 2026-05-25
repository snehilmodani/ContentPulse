import type { AnthropicClient } from '@contentpulse/ai-client';
import type { VisualType } from '@contentpulse/types';
import type { Logger } from 'pino';

const VISUAL_ASPECT_RATIOS: Record<VisualType, string> = {
  thumbnail:      '16:9 landscape',
  square_post:    '1:1 square',
  story_cover:    '9:16 portrait',
  carousel_slide: '1:1 square',
  x_header:       '3:1 ultra-wide',
};

export interface PromptSet {
  dallePrompt: string;
  unsplashQuery: string;
}

export interface BuildImagePromptsArgs {
  visualTypes: VisualType[];
  idea: { hookLine: string; coreArgument: string };
  trendTopicName?: string;
  brandKit: { primaryColors: string[]; brandingMode: 'strict' | 'flexible' };
  domainProfile?: { creatorPersona?: string | null; toneOfVoice?: string[] };
  userId: string;
  aiClient: AnthropicClient;
  logger: Logger;
}

export async function buildImagePrompts(args: BuildImagePromptsArgs): Promise<Map<VisualType, PromptSet>> {
  const { visualTypes, idea, trendTopicName, brandKit, domainProfile, userId, aiClient, logger } = args;

  const colorInstruction =
    brandKit.primaryColors.length > 0
      ? brandKit.brandingMode === 'strict'
        ? `MUST incorporate brand colors: ${brandKit.primaryColors.join(', ')}.`
        : `Optionally incorporate brand colors: ${brandKit.primaryColors.join(', ')}.`
      : '';
  const toneContext = domainProfile?.toneOfVoice?.length ? `Tone: ${domainProfile.toneOfVoice.join(', ')}.` : '';
  const personaContext = domainProfile?.creatorPersona ? `Creator persona: ${domainProfile.creatorPersona}.` : '';

  const systemBlock = {
    text: `You are a professional visual director for social media content. Your job is to craft precise, vivid image generation prompts and short stock-photo search queries.

Prompts must be:
- Visually specific (lighting, composition, mood, subjects, style)
- Sized for the requested aspect ratio
- Free of embedded text, logos, or watermarks unless explicitly requested
- Aligned with the brand tone when provided

Respond with valid JSON only. No prose, no markdown fences.`,
    cacheable: true,
  };

  const visualDescriptions = visualTypes
    .map((vt) => `"${vt}" (${VISUAL_ASPECT_RATIOS[vt]})`)
    .join(', ');

  const userMessage = [
    `Content idea:`,
    `Hook: ${idea.hookLine}`,
    `Core argument: ${idea.coreArgument}`,
    trendTopicName ? `Trend topic: ${trendTopicName}` : '',
    colorInstruction,
    toneContext,
    personaContext,
    '',
    `Generate image briefs for: ${visualDescriptions}`,
    '',
    `Return JSON with this exact structure (one key per visual type):`,
    `{`,
    `  "<visual_type>": {`,
    `    "dalle_prompt": "<detailed 2-3 sentence DALL·E prompt — describe mood, composition, lighting, subjects, style>",`,
    `    "unsplash_query": "<3-5 word stock photo search query>"`,
    `  }`,
    `}`,
  ]
    .filter(Boolean)
    .join('\n');

  logger.debug({ userId, visualTypes, systemPrompt: systemBlock.text }, '[build-image-prompts] Claude system block');
  logger.debug({ userId, userMessage }, '[build-image-prompts] Claude user message');

  const result = await aiClient.complete({
    userId,
    systemBlocks: [systemBlock],
    messages: [{ role: 'user', content: userMessage }],
    maxTokens: 2048,
  });

  logger.debug({ userId, rawResponse: result.text, inputTokens: result.inputTokens, outputTokens: result.outputTokens }, '[build-image-prompts] Claude raw response');

  const promptMap = new Map<VisualType, PromptSet>();

  let parsed: Record<string, { dalle_prompt?: string; unsplash_query?: string }> | null = null;
  if (!result.text.startsWith('[STUB]')) {
    try {
      const cleaned = result.text.replace(/^```(?:json)?\n?|\n?```$/g, '').trim();
      parsed = JSON.parse(cleaned) as Record<string, { dalle_prompt?: string; unsplash_query?: string }>;
      logger.debug({ userId, parsedKeys: Object.keys(parsed) }, '[build-image-prompts] Claude response parsed successfully');
    } catch {
      logger.debug({ userId, rawResponse: result.text }, '[build-image-prompts] Claude response failed JSON parse — using fallback templates');
    }
  } else {
    logger.debug({ userId }, '[build-image-prompts] Stub response detected — using fallback templates');
  }

  for (const visualType of visualTypes) {
    const entry = parsed?.[visualType];
    if (entry?.dalle_prompt && entry?.unsplash_query) {
      promptMap.set(visualType, { dallePrompt: entry.dalle_prompt, unsplashQuery: entry.unsplash_query });
      logger.debug({ userId, visualType, dallePrompt: entry.dalle_prompt, unsplashQuery: entry.unsplash_query }, '[build-image-prompts] Using Claude-generated prompts');
    } else {
      const colorHint =
        brandKit.primaryColors.length > 0
          ? ` Use a color palette including ${brandKit.primaryColors.join(', ')}.`
          : '';
      const fallbackDallePrompt = `Professional ${visualType.replace(/_/g, ' ')} image illustrating: ${idea.hookLine}. Context: ${idea.coreArgument.slice(0, 200)}.${colorHint} Modern design, high quality.`;
      const fallbackUnsplashQuery = idea.hookLine.split(' ').slice(0, 5).join(' ');
      promptMap.set(visualType, { dallePrompt: fallbackDallePrompt, unsplashQuery: fallbackUnsplashQuery });
      logger.debug({ userId, visualType, dallePrompt: fallbackDallePrompt, unsplashQuery: fallbackUnsplashQuery }, '[build-image-prompts] Using fallback template prompts');
    }
  }

  return promptMap;
}
