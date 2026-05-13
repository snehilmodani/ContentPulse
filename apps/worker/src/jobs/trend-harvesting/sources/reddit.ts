import pRetry from 'p-retry';
import type { RawTrend } from './newsapi';

export class RedditClient {
  private accessToken: string | null = null;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  async fetchTrends(domain: string, _region: string): Promise<RawTrend[]> {
    if (!this.clientId || !this.clientSecret) {
      return this.stubTrends(domain);
    }

    return pRetry(
      async () => {
        if (!this.accessToken) {
          await this.authenticate();
        }

        const response = await fetch(
          `https://oauth.reddit.com/search.json?q=${encodeURIComponent(domain)}&sort=hot&limit=10`,
          {
            headers: {
              Authorization: `Bearer ${this.accessToken}`,
              'User-Agent': 'ContentPulse/1.0',
            },
          },
        );

        if (!response.ok) throw new Error(`Reddit API error: ${response.status}`);

        const data = (await response.json()) as {
          data: { children: Array<{ data: { title: string; score: number; permalink: string } }> };
        };

        return data.data.children.slice(0, 5).map((post) => ({
          topic_name: post.data.title,
          topic_slug: post.data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60),
          raw_data: { score: post.data.score, permalink: post.data.permalink },
        }));
      },
      { retries: 2, factor: 2, minTimeout: 1000 },
    );
  }

  private async authenticate() {
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const response = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) throw new Error('Reddit auth failed');
    const data = (await response.json()) as { access_token: string };
    this.accessToken = data.access_token;
  }

  private stubTrends(domain: string): RawTrend[] {
    return Array.from({ length: 3 }, (_, i) => ({
      topic_name: `r/technology: ${domain} discussion ${i + 1}`,
      topic_slug: `reddit-${domain.toLowerCase().replace(/\s+/g, '-')}-${i + 1}`,
      raw_data: { source: 'reddit_stub', stub: true },
    }));
  }
}
