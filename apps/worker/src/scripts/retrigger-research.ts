import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

import { getDb, contentPackages, ideas, trends, topicBriefs } from '@contentpulse/db';
import { eq } from 'drizzle-orm';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { workerEnv } from '@contentpulse/config';
import type { ResearchBriefJobPayload } from '@contentpulse/types';

const CONTENT_PACKAGE_ID = process.argv[2]!;
if (!CONTENT_PACKAGE_ID) {
  console.error('Usage: tsx retrigger-research.ts <content_package_id>');
  process.exit(1);
}

async function main() {
  const db = getDb(workerEnv.DATABASE_URL);

  const [pkg] = await db
    .select()
    .from(contentPackages)
    .where(eq(contentPackages.id, CONTENT_PACKAGE_ID))
    .limit(1);

  if (!pkg) {
    console.error(`Content package not found: ${CONTENT_PACKAGE_ID}`);
    process.exit(1);
  }

  const [idea] = await db.select().from(ideas).where(eq(ideas.id, pkg.ideaId)).limit(1);
  if (!idea) {
    console.error(`Idea not found: ${pkg.ideaId}`);
    process.exit(1);
  }

  const [trend] = await db.select().from(trends).where(eq(trends.id, idea.trendId)).limit(1);

  // Clear any existing brief (unique constraint on content_package_id)
  const deleted = await db.delete(topicBriefs).where(eq(topicBriefs.contentPackageId, CONTENT_PACKAGE_ID)).returning({ id: topicBriefs.id });
  if (deleted.length > 0) console.log(`Deleted existing topic_brief: ${deleted[0]?.id}`);

  // Reset package status so the UI reflects re-research
  await db.update(contentPackages).set({ status: 'pending', updatedAt: new Date() }).where(eq(contentPackages.id, CONTENT_PACKAGE_ID));

  const payload: ResearchBriefJobPayload = {
    job_type: 'research_brief',
    user_id: pkg.userId,
    content_package_id: pkg.id,
    idea_id: idea.id,
    idea: {
      hook_line: idea.hookLine,
      core_argument: idea.coreArgument,
      angle_type: idea.angleType,
      platform_fit: idea.platformFit ?? [],
    },
    domain_profile: {
      primary_domain: trend?.topicSlug ?? idea.hookLine,
      region: 'IN-MH',
    },
  };

  const redis = new IORedis(workerEnv.REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new Queue('research-brief', { connection: redis });

  const job = await queue.add('research_brief', payload);
  console.log(`Queued research-brief job: ${job.id} for package ${CONTENT_PACKAGE_ID}`);

  await queue.close();
  await redis.quit();
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
