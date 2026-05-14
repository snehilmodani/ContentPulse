import pRetry from 'p-retry';
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

export class DalleClient {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model = 'dall-e-3') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generate(prompt: string, _visualType: VisualType): Promise<{ url: string; revisedPrompt: string }> {
    if (!this.apiKey) {
      return {
        url: `https://picsum.photos/seed/${encodeURIComponent(prompt.slice(0, 20))}/1080/1080`,
        revisedPrompt: prompt,
      };
    }

    return pRetry(
      async () => {
        const response = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.model,
            prompt,
            n: 1,
            size: '1024x1024',
            quality: 'standard',
          }),
        });

        if (!response.ok) throw new Error(`DALL·E error: ${response.status}`);

        const data = (await response.json()) as {
          data: Array<{ url: string; revised_prompt: string }>;
        };

        const result = data.data[0];
        if (!result) throw new Error('No image returned from DALL·E');

        return { url: result.url, revisedPrompt: result.revised_prompt };
      },
      { retries: 2, factor: 2, minTimeout: 2000 },
    );
  }
}
