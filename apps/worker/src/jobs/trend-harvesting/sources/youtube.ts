import pRetry from 'p-retry';
import type { RawTrend } from './newsapi';

export class YoutubeClient {
  constructor(private readonly apiKey: string) {}

  async fetchTrends(domain: string, region: string): Promise<RawTrend[]> {
    if (!this.apiKey) {
      return this.stubTrends(domain);
    }

    return pRetry(
      async () => {
        const url = new URL('https://www.googleapis.com/youtube/v3/search');
        url.searchParams.set('part', 'snippet');
        url.searchParams.set('q', domain);
        url.searchParams.set('type', 'video');
        url.searchParams.set('order', 'viewCount');
        url.searchParams.set('maxResults', '5');
        url.searchParams.set('regionCode', region.split('-')[0] ?? 'IN');
        url.searchParams.set('key', this.apiKey);

        const response = await fetch(url.toString());
        if (!response.ok) throw new Error(`YouTube API error: ${response.status}`);

        const data = (await response.json()) as {
          items: Array<{ snippet: { title: string; channelTitle: string }; id: { videoId: string } }>;
        };

        return data.items.map((item) => ({
          topic_name: item.snippet.title,
          topic_slug: item.snippet.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60),
          raw_data: { video_id: item.id.videoId, channel: item.snippet.channelTitle },
        }));
      },
      { retries: 2, factor: 2, minTimeout: 1000 },
    );
  }

  private stubTrends(domain: string): RawTrend[] {
    return Array.from({ length: 3 }, (_, i) => ({
      topic_name: `YouTube: ${domain} explained (${i + 1}M views)`,
      topic_slug: `yt-${domain.toLowerCase().replace(/\s+/g, '-')}-${i + 1}`,
      raw_data: { source: 'youtube_stub', stub: true },
    }));
  }
}
