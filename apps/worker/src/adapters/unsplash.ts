import pRetry from 'p-retry';

export class UnsplashClient {
  private readonly accessKey: string;

  constructor(accessKey: string) {
    this.accessKey = accessKey;
  }

  async search(query: string): Promise<{ url: string; photographer: string; source_url: string }> {
    if (!this.accessKey) {
      return {
        url: `https://picsum.photos/seed/${encodeURIComponent(query.slice(0, 20))}/1080/1080`,
        photographer: 'Lorem Picsum',
        source_url: 'https://picsum.photos',
      };
    }

    return pRetry(
      async () => {
        const response = await fetch(
          `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=squarish`,
          { headers: { Authorization: `Client-ID ${this.accessKey}` } },
        );

        if (!response.ok) throw new Error(`Unsplash error: ${response.status}`);

        const data = (await response.json()) as {
          results: Array<{ urls: { regular: string }; user: { name: string }; links: { html: string } }>;
        };

        const photo = data.results[0];
        if (!photo) throw new Error('No Unsplash result');

        return {
          url: photo.urls.regular,
          photographer: photo.user.name,
          source_url: photo.links.html,
        };
      },
      { retries: 2, factor: 2, minTimeout: 1000 },
    );
  }
}
