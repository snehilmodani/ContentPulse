import pRetry from 'p-retry';
import type { RawTrend } from './newsapi';

export class XTrendsClient {
  constructor(private readonly bearerToken: string) {}

  async fetchTrends(domain: string, _region: string): Promise<RawTrend[]> {
    if (!this.bearerToken) {
      return this.stubTrends(domain);
    }

    return pRetry(
      async () => {
        const response = await fetch(
          `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(domain)}&max_results=10&tweet.fields=public_metrics`,
          { headers: { Authorization: `Bearer ${this.bearerToken}` } },
        );

        if (!response.ok) throw new Error(`X API error: ${response.status}`);

        const data = (await response.json()) as {
          data: Array<{ text: string; id: string; public_metrics: { retweet_count: number } }>;
        };

        return (data.data ?? []).slice(0, 5).map((tweet) => ({
          topic_name: tweet.text.slice(0, 100),
          topic_slug: tweet.text.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60),
          raw_data: { tweet_id: tweet.id, retweets: tweet.public_metrics.retweet_count },
        }));
      },
      { retries: 2, factor: 2, minTimeout: 1000 },
    );
  }

  private stubTrends(domain: string): RawTrend[] {
    return Array.from({ length: 5 }, (_, i) => ({
      topic_name: `#${domain.replace(/\s+/g, '')}Trend${i + 1} is trending`,
      topic_slug: `x-${domain.toLowerCase().replace(/\s+/g, '-')}-trend-${i + 1}`,
      raw_data: { source: 'x_stub', stub: true },
    }));
  }
}
