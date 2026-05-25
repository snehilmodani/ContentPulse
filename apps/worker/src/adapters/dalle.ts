import pRetry from 'p-retry';
import type { Logger } from 'pino';
import type { VisualType } from '@contentpulse/types';

const VISUAL_DIMENSIONS: Record<VisualType, { width: number; height: number }> = {
  thumbnail: { width: 1280, height: 720 },
  square_post: { width: 1080, height: 1080 },
  story_cover: { width: 1080, height: 1920 },
  carousel_slide: { width: 1080, height: 1080 },
  x_header: { width: 1500, height: 500 },
};

export function getDimensions(visualType: VisualType) {
  return VISUAL_DIMENSIONS[visualType] ?? { width: 1080, height: 1080 };
}

// Target output dimensions per visual type (used for DB write — not sent to the API).
const DALLE_SIZE_MAP: Record<VisualType, { dalleSize: string; widthPx: number; heightPx: number }> = {
  thumbnail:      { dalleSize: '1792x1024', widthPx: 1792, heightPx: 1024 },
  square_post:    { dalleSize: '1024x1024', widthPx: 1024, heightPx: 1024 },
  story_cover:    { dalleSize: '1024x1792', widthPx: 1024, heightPx: 1792 },
  carousel_slide: { dalleSize: '1024x1024', widthPx: 1024, heightPx: 1024 },
  x_header:       { dalleSize: '1792x1024', widthPx: 1792, heightPx: 1024 },
};

export function getDalleSize(visualType: VisualType) {
  return DALLE_SIZE_MAP[visualType] ?? { dalleSize: '1024x1024', widthPx: 1024, heightPx: 1024 };
}

export class DalleClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly logger: Logger;

  constructor(apiKey: string, model = 'google/gemini-2.5-flash-image', logger: Logger) {
    this.apiKey = apiKey;
    this.model = model;
    this.logger = logger;
  }

  async generate(prompt: string, visualType: VisualType): Promise<{ url: string; revisedPrompt: string; widthPx: number; heightPx: number }> {
    const { widthPx, heightPx } = getDalleSize(visualType);

    if (!this.apiKey) {
      const stubUrl = `https://picsum.photos/seed/${encodeURIComponent(prompt.slice(0, 20))}/${widthPx}/${heightPx}`;
      this.logger.debug({ visualType, widthPx, heightPx, stubUrl }, 'OpenRouter stub mode — OPENROUTER_API_KEY not set');
      return { url: stubUrl, revisedPrompt: prompt, widthPx, heightPx };
    }

    this.logger.debug({ visualType, model: this.model, widthPx, heightPx }, 'OpenRouter image generation request starting');

    return pRetry(
      async (attemptNumber) => {
        if (attemptNumber > 1) {
          this.logger.warn({ visualType, attemptNumber }, 'OpenRouter image generation retry attempt');
        }

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.model,
            messages: [{ role: 'user', content: prompt }],
            modalities: ['image', 'text'],
          }),
        });

        if (!response.ok) {
          const errorBody = await response.text().catch(() => '');
          this.logger.warn({ visualType, model: this.model, status: response.status, statusText: response.statusText, errorBody }, 'OpenRouter image generation HTTP error');
          throw new Error(`OpenRouter image generation error: ${response.status} — ${errorBody}`);
        }

        const data = (await response.json()) as {
          choices: Array<{
            message: {
              images?: Array<{ image_url: { url: string } }>;
              content?: string | Array<{ type: string; image_url?: { url: string } }>;
            };
          }>;
        };

        const message = data.choices[0]?.message;

        // Prefer the SDK-style `images` field; fall back to scanning a multimodal content array.
        let imageUrl: string | undefined = message?.images?.[0]?.image_url?.url;
        if (!imageUrl && Array.isArray(message?.content)) {
          const part = (message.content as Array<{ type: string; image_url?: { url: string } }>)
            .find((c) => c.type === 'image_url');
          imageUrl = part?.image_url?.url;
        }

        if (!imageUrl) {
          this.logger.warn({ visualType, model: this.model, choices: data.choices }, 'OpenRouter image generation — no image found in response');
          throw new Error('No image returned from OpenRouter');
        }

        // Gemini does not revise prompts.
        this.logger.debug({ visualType, widthPx, heightPx }, 'OpenRouter image generation response received');
        return { url: imageUrl, revisedPrompt: prompt, widthPx, heightPx };
      },
      { retries: 2, factor: 2, minTimeout: 2000 },
    );
  }
}
