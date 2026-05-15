import pRetry, { AbortError } from 'p-retry';
import { z } from 'zod';

const perplexityResearchSchema = z.object({
  topic_summary: z.string().min(1),
  key_facts: z.array(z.object({ fact: z.string(), source_url: z.string(), confidence: z.number() })).default([]),
  timeline: z.array(z.object({ date: z.string(), event: z.string() })).default([]),
  key_players: z.array(z.object({ name: z.string(), role: z.string(), org: z.string() })).default([]),
  opposing_views: z.string().optional(),
  regional_angle: z.string().optional(),
  related_topics: z.array(z.string()).default([]),
  sources: z.array(z.object({ title: z.string(), url: z.string(), publication: z.string(), published_at: z.string() })).default([]),
  fact_check_flags: z.array(z.object({ claim: z.string(), flag: z.string(), note: z.string() })).default([]),
}).passthrough();

export type PerplexityResearchResult = z.infer<typeof perplexityResearchSchema>;

export class PerplexityClient {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model = 'llama-3.1-sonar-small-128k-online') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async research(topic: string, region: string): Promise<PerplexityResearchResult> {
    if (!this.apiKey) {
      return this.stubResearch(topic, region);
    }

    return pRetry(
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120_000);
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://contentpulse.app',
            'X-Title': 'ContentPulse',
          },
          body: JSON.stringify({
            model: this.model,
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'user',
                content: `Research the topic "${topic}" thoroughly for a content creator in ${region}.

Return a single JSON object with EXACTLY these keys (and no others):
- topic_summary: string — 2-3 paragraph plain-text summary
- key_facts: array of { fact: string, source_url: string, confidence: number }
- timeline: array of { date: string, event: string }
- key_players: array of { name: string, role: string, org: string }
- opposing_views: string
- regional_angle: string — relevance to ${region}
- related_topics: array of strings
- sources: array of { title: string, url: string, publication: string, published_at: string }
- fact_check_flags: array of { claim: string, flag: string, note: string }

Do not wrap the JSON in markdown fences. Do not include any extra keys.`,
              },
            ],
          }),
        }).finally(() => clearTimeout(timeout));

        if (!response.ok) {
          const body = await response.text();
          const msg = `OpenRouter research error ${response.status}: ${body}`;
          // 4xx (except 429 rate-limit) are not transient — abort immediately
          if (response.status !== 429 && response.status >= 400 && response.status < 500) {
            throw new AbortError(msg);
          }
          throw new Error(msg);
        }

        const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
        const content = data.choices[0]?.message.content ?? '{}';

        let parsed: unknown;
        try {
          parsed = JSON.parse(content);
        } catch (err) {
          throw new AbortError(`Research LLM returned non-JSON content: ${(err as Error).message}`);
        }
        const result = perplexityResearchSchema.safeParse(parsed);
        if (!result.success) {
          const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
          throw new AbortError(`Research LLM response failed schema validation: ${issues}`);
        }
        return result.data;
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
