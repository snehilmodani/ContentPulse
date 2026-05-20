import pRetry from 'p-retry';
import GoogleTrendsApi from '@alkalisummer/google-trends-js';
import type { RawTrend } from './newsapi';

export class GoogleTrendsClient {
  constructor(private readonly enabled: boolean) {}

  async fetchTrends(domain: string, region: string, subDomains: string[] = [], cap: number = 10): Promise<RawTrend[]> {
    if (!this.enabled) {
      return this.stubTrends(domain, region, cap);
    }

    const country = (region.split('-')[0] ?? 'US').toUpperCase();
    // Google Trends geo must be a 2-letter ISO country code; fall back to stub if it isn't
    if (!/^[A-Z]{2}$/.test(country)) {
      return this.stubTrends(domain, region, cap);
    }
    const hl = `en-${country}`;

    // autocomplete(keyword) returns popular searches for that keyword — domain-relevant by definition.
    // Query primary domain + sub-domains (cap at 5 total calls).
    const keywords = [domain, ...subDomains].slice(0, 5);

    const settled = await Promise.allSettled(
      keywords.map((kw) =>
        pRetry(
          async () => {
            const result = await GoogleTrendsApi.autocomplete(kw, hl);
            if (result.error) {
              throw new Error(`Google Trends autocomplete error: ${String(result.error)}`);
            }
            return { keyword: kw, suggestions: result.data ?? [] };
          },
          { retries: 2, factor: 2, minTimeout: 1000 },
        ),
      ),
    );

    const seen = new Set<string>();
    const trends: RawTrend[] = [];

    for (const result of settled) {
      if (result.status !== 'fulfilled') continue;
      for (const suggestion of result.value.suggestions) {
        const slug = suggestion.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
        if (seen.has(slug)) continue;
        seen.add(slug);
        trends.push({
          topic_name: suggestion,
          topic_slug: slug,
          raw_data: { geo: country, source_keyword: result.value.keyword },
        });
        if (trends.length >= cap) return trends;
      }
    }

    return trends;
  }

  private stubTrends(domain: string, region: string, cap: number = 4): RawTrend[] {
    return Array.from({ length: Math.min(cap, 4) }, (_, i) => ({
      topic_name: `Google Trends: ${domain} rising in ${region} (${i + 1})`,
      topic_slug: `gtrends-${domain.toLowerCase().replace(/\s+/g, '-')}-${region.toLowerCase()}-${i + 1}`,
      raw_data: { source: 'google_trends_stub', stub: true, region },
    }));
  }
}
