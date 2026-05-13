import pRetry from 'p-retry';

export interface RawTrend {
  topic_name: string;
  topic_slug: string;
  raw_data: Record<string, unknown>;
}

export class NewsApiClient {
  constructor(private readonly apiKey: string) {}

  async fetchTrends(domain: string, region: string): Promise<RawTrend[]> {
    if (!this.apiKey) {
      return this.stubTrends(domain);
    }

    return pRetry(
      async () => {
        const url = new URL('https://newsapi.org/v2/top-headlines');
        url.searchParams.set('q', domain);
        url.searchParams.set('language', 'en');
        url.searchParams.set('pageSize', '10');
        url.searchParams.set('apiKey', this.apiKey);

        const response = await fetch(url.toString());
        if (!response.ok) throw new Error(`NewsAPI error: ${response.status}`);

        const data = (await response.json()) as {
          articles: Array<{ title: string; url: string; publishedAt: string; source: { name: string } }>;
        };

        return data.articles.map((article) => ({
          topic_name: article.title,
          topic_slug: article.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60),
          raw_data: { url: article.url, published_at: article.publishedAt, source: article.source.name },
        }));
      },
      { retries: 2, factor: 2, minTimeout: 1000 },
    );
  }

  private stubTrends(domain: string): RawTrend[] {
    return Array.from({ length: 5 }, (_, i) => ({
      topic_name: `${domain} Trend ${i + 1}: Industry Insight`,
      topic_slug: `${domain.toLowerCase().replace(/\s+/g, '-')}-trend-${i + 1}`,
      raw_data: { source: 'newsapi_stub', stub: true },
    }));
  }
}
