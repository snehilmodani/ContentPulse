import cron from 'node-cron';
import { DateTime } from 'luxon';
import type { Logger } from 'pino';
import type { Db } from '@contentpulse/db';
import { domainProfiles, trendRuns, users } from '@contentpulse/db';
import type { Queue } from 'bullmq';
import type { JobPayload, TrendHarvestingJobPayload } from '@contentpulse/types';
import { and, eq, not, exists } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

interface Deps {
  db: Db;
  queues: Record<string, Queue<JobPayload>>;
  logger: Logger;
}

export function startScheduler(deps: Deps): cron.ScheduledTask {
  const { db, queues, logger } = deps;

  const task = cron.schedule('* * * * *', async () => {
    try {
      const today = DateTime.now().toISODate()!;
      logger.debug({ today }, 'Scheduler tick');

      const usersWithProfiles = await db
        .select({
          id: users.id,
          timezone: users.timezone,
          domainProfileId: domainProfiles.id,
          primaryDomain: domainProfiles.primaryDomain,
          subDomains: domainProfiles.subDomains,
          region: domainProfiles.region,
          toneOfVoice: domainProfiles.toneOfVoice,
        })
        .from(users)
        .innerJoin(domainProfiles, eq(domainProfiles.userId, users.id))
        .where(
          and(
            eq(users.onboardingComplete, true),
            not(
              exists(
                db
                  .select({ id: trendRuns.id })
                  .from(trendRuns)
                  .where(
                    and(
                      eq(trendRuns.userId, users.id),
                      eq(trendRuns.runDate, sql`CURRENT_DATE`),
                    ),
                  ),
              ),
            ),
          ),
        );

      logger.debug({ count: usersWithProfiles.length, today }, 'Eligible users without a trend run today');

      for (const user of usersWithProfiles) {
        const userNow = DateTime.now().setZone(user.timezone);
        const target9pm = userNow.set({ hour: 21, minute: 0, second: 0, millisecond: 0 });

        if (target9pm <= userNow) {
          logger.debug({ userId: user.id, timezone: user.timezone, userNow: userNow.toISO() }, 'Skipping user — 9 PM already passed in their timezone');
          continue;
        }

        const delayMs = target9pm.toMillis() - userNow.toMillis();
        const delayMins = Math.round(delayMs / 60_000);
        const jobId = `trend-${user.id}-${today}`;

        const [trendRun] = await db
          .insert(trendRuns)
          .values({ userId: user.id, runDate: today })
          .returning({ id: trendRuns.id });

        if (!trendRun) {
          logger.debug({ userId: user.id, jobId }, 'Trend run already exists for today — skipping');
          continue;
        }

        logger.info({ userId: user.id, trendRunId: trendRun.id, timezone: user.timezone, scheduledFor: target9pm.toISO(), delayMs, delayMins }, 'Creating trend run record');

        const payload: TrendHarvestingJobPayload = {
          job_type: 'trend_harvesting',
          user_id: user.id,
          trend_run_id: trendRun.id,
          domain_profile: {
            primary_domain: user.primaryDomain,
            sub_domains: user.subDomains ?? [],
            region: user.region,
            tone_of_voice: user.toneOfVoice ?? [],
          },
          sources: ['x_twitter', 'google_trends', 'newsapi', 'reddit', 'youtube'],
          scheduled_for: target9pm.toISO()!,
        };

        await queues['trend-harvesting']?.add('trend_harvesting', payload, {
          jobId,
          delay: delayMs,
          removeOnComplete: { age: 86400 * 7 },
          removeOnFail: false,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        });

        logger.info({ userId: user.id, trendRunId: trendRun.id, jobId, delayMs, delayMins, scheduledFor: target9pm.toISO() }, 'Scheduled trend-harvesting job');
      }
    } catch (err) {
      logger.error({ err }, 'Scheduler tick failed');
    }
  });

  return task;
}
