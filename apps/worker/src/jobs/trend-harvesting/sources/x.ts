import pRetry from 'p-retry';
import type { RawTrend } from './newsapi';

type XSearchResponse = {
  data?: Array<{
    id: string;
    text: string;
    author_id: string;
    created_at: string;
    lang: string;
    public_metrics: {
      retweet_count: number;
      reply_count: number;
      like_count: number;
      quote_count: number;
      impression_count?: number;
    };
    entities?: {
      hashtags?: Array<{ tag: string }>;
      urls?: Array<{ expanded_url: string }>;
    };
  }>;
  includes?: {
    users?: Array<{
      id: string;
      username: string;
      verified_type?: string;
      public_metrics?: { followers_count: number };
    }>;
  };
  meta?: { result_count: number };
};

type XTweet = NonNullable<XSearchResponse['data']>[number];

function engagement(m: XTweet['public_metrics']): number {
  return m.like_count + 2 * m.retweet_count + m.quote_count + m.reply_count;
}

function extractTopicName(text: string, entities: XTweet['entities']): string {
  // strip URLs and @mentions, collapse whitespace
  let clean = text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/@\w+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const firstTag = entities?.hashtags?.[0]?.tag;
  if (firstTag) {
    clean = `#${firstTag} — ${clean}`;
  }

  return clean.slice(0, 100);
}

export class XTrendsClient {
  constructor(private readonly bearerToken: string) {}

  async fetchTrends(domain: string, _region: string): Promise<RawTrend[]> {
    if (!this.bearerToken) {
      return this.stubTrends(domain);
    }

    return pRetry(
      async () => {
        const url = new URL('https://api.twitter.com/2/tweets/search/recent');
        url.searchParams.set('query', `("${domain}") lang:en -is:retweet -is:reply -is:nullcast`);
        url.searchParams.set('max_results', '25');
        url.searchParams.set('tweet.fields', 'public_metrics,created_at,entities,lang');
        url.searchParams.set('expansions', 'author_id');
        url.searchParams.set('user.fields', 'username,verified_type,public_metrics');
        url.searchParams.set('sort_order', 'relevancy');

        const response = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${this.bearerToken}` },
        });

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new Error(`X API ${response.status} ${response.statusText}: ${body.slice(0, 300)}`);
        }

        const json = (await response.json()) as XSearchResponse;
        const tweets = json.data ?? [];

        const authorById = new Map(
          (json.includes?.users ?? []).map((u) => [u.id, u]),
        );

        return tweets
          .sort((a, b) => engagement(b.public_metrics) - engagement(a.public_metrics))
          .slice(0, 5)
          .map((tweet) => {
            const author = authorById.get(tweet.author_id);
            const hashtags = (tweet.entities?.hashtags ?? []).map((h) => h.tag);
            const urls = (tweet.entities?.urls ?? []).map((u) => u.expanded_url);
            const topicName = extractTopicName(tweet.text, tweet.entities);
            const topicSlug = topicName
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-+|-+$/g, '')
              .slice(0, 54)
              .concat(`-${tweet.id.slice(-6)}`);

            return {
              topic_name: topicName,
              topic_slug: topicSlug,
              raw_data: {
                tweet_id: tweet.id,
                author_id: tweet.author_id,
                author_username: author?.username ?? null,
                author_followers: author?.public_metrics?.followers_count ?? null,
                created_at: tweet.created_at,
                lang: tweet.lang,
                engagement: {
                  likes: tweet.public_metrics.like_count,
                  retweets: tweet.public_metrics.retweet_count,
                  replies: tweet.public_metrics.reply_count,
                  quotes: tweet.public_metrics.quote_count,
                  impressions: tweet.public_metrics.impression_count ?? null,
                },
                hashtags,
                urls,
              },
            };
          });
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
