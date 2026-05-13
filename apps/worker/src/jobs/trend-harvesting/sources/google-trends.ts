import type { RawTrend } from './newsapi';

export class GoogleTrendsClient {
  async fetchTrends(domain: string, region: string): Promise<RawTrend[]> {
    // Google Trends has no official API; this is a stub until a library or scraper is integrated
    return this.stubTrends(domain, region);
  }

  private stubTrends(domain: string, region: string): RawTrend[] {
    return Array.from({ length: 4 }, (_, i) => ({
      topic_name: `Google Trends: ${domain} rising in ${region} (${i + 1})`,
      topic_slug: `gtrends-${domain.toLowerCase().replace(/\s+/g, '-')}-${region.toLowerCase()}-${i + 1}`,
      raw_data: { source: 'google_trends_stub', stub: true, region },
    }));
  }
}
