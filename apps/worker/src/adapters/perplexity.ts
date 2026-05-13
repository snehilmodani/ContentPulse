import pRetry from 'p-retry';

interface PerplexityResearchResult {
  topic_summary: string;
  key_facts: Array<{ fact: string; source_url: string; confidence: number }>;
  timeline: Array<{ date: string; event: string }>;
  key_players: Array<{ name: string; role: string; org: string }>;
  opposing_views: string;
  regional_angle: string;
  related_topics: string[];
  sources: Array<{ title: string; url: string; publication: string; published_at: string }>;
  fact_check_flags: Array<{ claim: string; flag: string; note: string }>;
}

export class PerplexityClient {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async research(topic: string, region: string): Promise<PerplexityResearchResult> {
    if (!this.apiKey) {
      return this.stubResearch(topic, region);
    }

    return pRetry(
      async () => {
        const response = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'llama-3.1-sonar-large-128k-online',
            messages: [
              {
                role: 'user',
                content: `Research the following topic thoroughly for a content creator in ${region}: "${topic}".
                Provide: a summary, key facts with sources, timeline of events, key players, opposing views, regional angle, related topics, and fact-check flags.
                Return as structured JSON.`,
              },
            ],
          }),
        });

        if (!response.ok) {
          throw new Error(`Perplexity API error: ${response.status}`);
        }

        const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
        const content = data.choices[0]?.message.content ?? '{}';

        try {
          return JSON.parse(content) as PerplexityResearchResult;
        } catch {
          return this.stubResearch(topic, region);
        }
      },
      { retries: 2, factor: 2, minTimeout: 2000 },
    );
  }

  private stubResearch(topic: string, region: string): PerplexityResearchResult {
    return {
      topic_summary: `[STUB] Research summary for "${topic}" targeting ${region}. This is placeholder research content.`,
      key_facts: [
        { fact: `Key fact about ${topic}`, source_url: 'https://example.com', confidence: 0.9 },
      ],
      timeline: [{ date: new Date().toISOString().split('T')[0] ?? '2026-01-01', event: `Initial event for ${topic}` }],
      key_players: [{ name: 'Key Person', role: 'Expert', org: 'Organization' }],
      opposing_views: `Some analysts disagree about ${topic}.`,
      regional_angle: `Specific relevance to ${region}: this topic has local implications.`,
      related_topics: ['technology', 'innovation', 'business'],
      sources: [
        {
          title: `Article about ${topic}`,
          url: 'https://example.com/article',
          publication: 'Example News',
          published_at: new Date().toISOString(),
        },
      ],
      fact_check_flags: [],
    };
  }
}
