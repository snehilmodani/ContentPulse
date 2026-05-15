import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

import { getDb } from '@contentpulse/db';
import { trendRuns, trends, ideas, users } from '@contentpulse/db';
import { asc } from 'drizzle-orm';
import { workerEnv } from '@contentpulse/config';

const db = getDb(workerEnv.DATABASE_URL);

const SEED_IDEAS = [
  {
    trend: { sourcePlatform: 'x_twitter' as const, topicName: 'AI Agents are Replacing Junior Devs', topicSlug: 'ai-agents-replacing-junior-devs', category: 'breaking_news' as const, relevanceScore: '87', compositeScore: '91' },
    ideas: [
      { angleType: 'contrarian' as const, hookLine: 'Hot take: AI agents won\'t replace junior devs — they\'ll replace the devs who refuse to use them', coreArgument: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. The real displacement isn\'t from AI capability but from the unwillingness of some engineers to adapt their workflow to AI-augmented development. Those who treat AI as a pair programmer will be 10x more productive.', platformFit: ['x_thread', 'linkedin_article'], effortEstimate: 'medium' as const, relevanceScore: '89' },
      { angleType: 'how_to' as const, hookLine: '5 tasks I now delegate entirely to AI agents as a solo founder (and the one I never will)', coreArgument: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore. Breaking down the practical breakdown: boilerplate generation, test writing, documentation, PR reviews — versus architecture decisions that still need human judgment.', platformFit: ['linkedin_article', 'blog_post'], effortEstimate: 'low' as const, relevanceScore: '82' },
    ],
  },
  {
    trend: { sourcePlatform: 'reddit' as const, topicName: 'Product-Market Fit is Dead', topicSlug: 'product-market-fit-is-dead', category: 'contrarian_provocative' as const, relevanceScore: '79', compositeScore: '83' },
    ideas: [
      { angleType: 'contrarian' as const, hookLine: 'Everyone obsesses over product-market fit. The real edge in 2025 is distribution-market fit', coreArgument: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut enim ad minim veniam, quis nostrud exercitation ullamco. The idea that great products find their audience has been disproved by hundreds of well-built ghost-towns. What actually predicts success is whether your distribution channel perfectly matches your buyer\'s attention habits.', platformFit: ['x_thread', 'linkedin_article'], effortEstimate: 'medium' as const, relevanceScore: '85' },
      { angleType: 'tangential_insight' as const, hookLine: 'Notion, Figma, and Linear all had the same secret. It wasn\'t the product.', coreArgument: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum. Each of these tools spread bottom-up through individual power users inside companies before any enterprise sale. The insight: seed with individuals, harvest the org.', platformFit: ['linkedin_article', 'instagram_post'], effortEstimate: 'high' as const, relevanceScore: '78' },
    ],
  },
  {
    trend: { sourcePlatform: 'youtube' as const, topicName: 'Zero-to-One Revenue in 90 Days', topicSlug: 'zero-to-one-revenue-90-days', category: 'evergreen_timely' as const, relevanceScore: '74', compositeScore: '77' },
    ideas: [
      { angleType: 'how_to' as const, hookLine: 'I went from $0 to $4k MRR in 90 days. Here\'s the exact playbook (no fluff)', coreArgument: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Excepteur sint occaecat cupidatat non proident. Week-by-week breakdown: weeks 1-2 customer discovery, week 3-4 landing page and waitlist, weeks 5-8 build the embarrassing MVP, weeks 9-12 manual sales until you find the pattern.', platformFit: ['x_thread', 'blog_post', 'linkedin_article'], effortEstimate: 'high' as const, relevanceScore: '76' },
      { angleType: 'innovation' as const, hookLine: 'The "do things that don\'t scale" advice is outdated. Here\'s what early-stage looks like now', coreArgument: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sunt in culpa qui officia deserunt mollit anim id est laborum. With AI tools, you can now fake scale from day one — AI-generated personalization, automated onboarding, instant support. The question shifts from "what can I do manually?" to "what should I automate immediately?"', platformFit: ['x_thread', 'linkedin_article'], effortEstimate: 'medium' as const, relevanceScore: '71' },
      { angleType: 'comedic' as const, hookLine: 'Me at day 1: "I\'ll build the perfect SaaS." Me at day 89: "please just pay me anything"', coreArgument: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. A comedic but honest look at the emotional arc of a 90-day sprint from zero to first dollar — the delusion, the pivot, the desperate DM-ing, and the accidental discovery of what people actually wanted to pay for.', platformFit: ['x_thread', 'instagram_post'], effortEstimate: 'low' as const, relevanceScore: '68' },
    ],
  },
];

async function main() {
  // Get first user
  const userRows = await db.select({ id: users.id }).from(users).orderBy(asc(users.createdAt)).limit(1);
  const userId = userRows[0]?.id;
  if (!userId) {
    console.error('No users found — register an account first at http://localhost:3000/register');
    process.exit(1);
  }
  console.log(`Seeding queue for user ${userId}`);

  // Create a trend run for today
  const today = new Date().toISOString().slice(0, 10);
  const [run] = await db
    .insert(trendRuns)
    .values({ userId, runDate: today, status: 'completed', completedAt: new Date() })
    .onConflictDoUpdate({
      target: [trendRuns.userId, trendRuns.runDate],
      set: { status: 'completed', completedAt: new Date(), updatedAt: new Date() },
    })
    .returning();

  if (!run) throw new Error('Failed to insert trend run');
  console.log(`Trend run: ${run.id}`);

  for (const group of SEED_IDEAS) {
    const [trend] = await db
      .insert(trends)
      .values({ ...group.trend, trendRunId: run.id, userId })
      .returning();

    if (!trend) throw new Error('Failed to insert trend');
    console.log(`  Trend: ${trend.topicName}`);

    for (const idea of group.ideas) {
      await db.insert(ideas).values({ ...idea, trendId: trend.id, trendRunId: run.id, userId });
      console.log(`    Idea: ${idea.hookLine.slice(0, 60)}...`);
    }
  }

  console.log('\nDone! Refresh the Review Queue at http://localhost:3000/queue');
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
