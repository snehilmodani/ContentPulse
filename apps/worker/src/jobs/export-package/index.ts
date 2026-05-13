import archiver from 'archiver';
import { PassThrough } from 'stream';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { Db } from '@contentpulse/db';
import { contentPackages, drafts, notifications, visuals } from '@contentpulse/db';
import type { ExportPackageJobPayload } from '@contentpulse/types';
import { and, eq, inArray } from 'drizzle-orm';
import type { Queue } from 'bullmq';
import type { JobPayload } from '@contentpulse/types';
import { publishToUser } from '../../lib/ws-publish';

interface Deps {
  db: Db;
  redis: Redis;
  queues: Record<string, Queue<JobPayload>>;
  logger: Logger;
  uploadZipToR2: (key: string, buffer: Buffer) => Promise<string>;
  getSignedUrl: (key: string) => Promise<string>;
}

function formatDraftContent(format: string, body: Record<string, unknown>): string {
  const header = `# ${format.replace(/_/g, ' ').toUpperCase()}\n\n`;
  return header + JSON.stringify(body, null, 2);
}

export async function processExportPackage(
  payload: ExportPackageJobPayload,
  deps: Deps,
): Promise<void> {
  const { db, redis, queues, uploadZipToR2, getSignedUrl } = deps;
  const { user_id, content_package_id, approved_draft_ids, approved_visual_ids } = payload;

  const draftList = approved_draft_ids.length > 0
    ? await db.select().from(drafts).where(inArray(drafts.id, approved_draft_ids))
    : await db.select().from(drafts).where(and(eq(drafts.contentPackageId, content_package_id), eq(drafts.status, 'approved')));

  const visualList = approved_visual_ids.length > 0
    ? await db.select().from(visuals).where(inArray(visuals.id, approved_visual_ids))
    : await db.select().from(visuals).where(and(eq(visuals.contentPackageId, content_package_id), eq(visuals.status, 'approved')));

  const zipBuffer = await new Promise<Buffer>((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    const passThrough = new PassThrough();

    passThrough.on('data', (chunk: Buffer) => chunks.push(chunk));
    passThrough.on('end', () => resolve(Buffer.concat(chunks)));
    passThrough.on('error', reject);
    archive.on('error', reject);
    archive.pipe(passThrough);

    // add draft copy files
    for (const draft of draftList) {
      const content = formatDraftContent(draft.format, draft.contentBody as Record<string, unknown>);
      archive.append(content, { name: `copy/${draft.format}.md` });
    }

    // add a post checklist
    const checklist = `# Post Checklist\n\nGenerated: ${new Date().toISOString()}\n\n## Before Posting\n- [ ] Review all copy for accuracy\n- [ ] Check hashtags\n- [ ] Verify visual dimensions\n- [ ] Schedule optimal posting time\n\n## Visuals (${visualList.length} ready)\n${visualList.map((v) => `- [ ] ${v.visualType}: ${v.cdnUrl ?? 'pending'}`).join('\n')}\n`;
    archive.append(checklist, { name: 'checklist.md' });

    archive.finalize().catch(reject);
  });

  const zipKey = `exports/${content_package_id}/package-${Date.now()}.zip`;
  await uploadZipToR2(zipKey, zipBuffer);
  const signedUrl = await getSignedUrl(zipKey);
  const expiresAt = new Date(Date.now() + 86400_000);

  await db
    .update(contentPackages)
    .set({
      status: 'exported',
      exportR2Key: zipKey,
      exportUrl: signedUrl,
      exportUrlExpiresAt: expiresAt,
      exportedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(contentPackages.id, content_package_id));

  await publishToUser(redis, user_id, {
    event: 'export_ready',
    data: { content_package_id, export_url: signedUrl, expires_at: expiresAt.toISOString() },
    timestamp: new Date().toISOString(),
  });

  const [notif] = await db
    .insert(notifications)
    .values({
      userId: user_id,
      event: 'export_ready',
      channel: 'email',
      title: 'Your export is ready',
      body: 'Download your content package (valid for 24 hours).',
      payload: { content_package_id, export_url: signedUrl },
    })
    .returning();

  if (notif) {
    await queues['notification-send']?.add('notification_send', {
      job_type: 'notification_send',
      user_id,
      notification_id: notif.id,
      event: 'export_ready',
      channels: ['email'],
      template_data: { export_url: signedUrl },
    });
  }
}
