import pRetry from 'p-retry';
import type { Logger } from 'pino';

export type UnsplashOrientation = 'landscape' | 'portrait' | 'squarish';

const ORIENTATION_DIMS: Record<UnsplashOrientation, { widthPx: number; heightPx: number }> = {
  landscape: { widthPx: 1792, heightPx: 1024 },
  portrait:  { widthPx: 1024, heightPx: 1792 },
  squarish:  { widthPx: 1080, heightPx: 1080 },
};

export class UnsplashClient {
  private readonly accessKey: string;
  private readonly logger: Logger;

  constructor(accessKey: string, logger: Logger) {
    this.accessKey = accessKey;
    this.logger = logger;
  }

  async search(query: string, orientation: UnsplashOrientation = 'squarish'): Promise<{ url: string; photographer: string; source_url: string; widthPx: number; heightPx: number }> {
    const stubDims = ORIENTATION_DIMS[orientation];

    if (!this.accessKey) {
      const stubUrl = `https://picsum.photos/seed/${encodeURIComponent(query.slice(0, 20))}/${stubDims.widthPx}/${stubDims.heightPx}`;
      this.logger.debug({ query, orientation, widthPx: stubDims.widthPx, heightPx: stubDims.heightPx, stubUrl }, 'Unsplash stub mode — UNSPLASH_ACCESS_KEY not set');
      return { url: stubUrl, photographer: 'Lorem Picsum', source_url: 'https://picsum.photos', widthPx: stubDims.widthPx, heightPx: stubDims.heightPx };
    }

    this.logger.debug({ query, orientation }, 'Unsplash HTTP request starting');

    return pRetry(
      async (attemptNumber) => {
        if (attemptNumber > 1) {
          this.logger.warn({ query, orientation, attemptNumber }, 'Unsplash retry attempt');
        }

        const response = await fetch(
          `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=${orientation}`,
          { headers: { Authorization: `Client-ID ${this.accessKey}` } },
        );

        if (!response.ok) {
          this.logger.warn({ query, orientation, status: response.status, statusText: response.statusText }, 'Unsplash HTTP error');
          throw new Error(`Unsplash error: ${response.status}`);
        }

        const data = (await response.json()) as {
          results: Array<{ urls: { regular: string }; user: { name: string }; links: { html: string }; width: number; height: number }>;
        };

        const photo = data.results[0];
        if (!photo) throw new Error('No Unsplash result');

        this.logger.debug({ query, orientation, photographer: photo.user.name, widthPx: photo.width, heightPx: photo.height }, 'Unsplash HTTP response received');
        return { url: photo.urls.regular, photographer: photo.user.name, source_url: photo.links.html, widthPx: photo.width, heightPx: photo.height };
      },
      { retries: 2, factor: 2, minTimeout: 1000 },
    );
  }
}
