import type { Logger } from 'pino';
import type { Db } from '@contentpulse/db';
import { notifications, users } from '@contentpulse/db';
import type { NotificationSendJobPayload } from '@contentpulse/types';
import { eq } from 'drizzle-orm';
import { ResendClient } from '../../adapters/resend';

interface Deps {
  db: Db;
  logger: Logger;
  resend: ResendClient;
}

const EMAIL_TEMPLATES: Record<string, (data: Record<string, unknown>) => { subject: string; html: string }> = {
  daily_digest_ready: () => ({
    subject: 'Your ContentPulse ideas are ready',
    html: '<h1>Your daily content ideas are ready!</h1><p>Log in to review and approve your trending ideas.</p><a href="https://contentpulse.app/queue">Review Ideas</a>',
  }),
  package_ready: (data) => ({
    subject: 'Your content package is ready for review',
    html: `<h1>Content Package Ready!</h1><p>Your drafts and visuals are ready.</p><a href="https://contentpulse.app/packages/${data['content_package_id'] ?? ''}">Review Package</a>`,
  }),
  export_ready: (data) => ({
    subject: 'Your ContentPulse export is ready',
    html: `<h1>Export Ready!</h1><p>Download your content package (valid for 24h).</p><a href="${data['export_url'] ?? '#'}">Download</a>`,
  }),
  trend_spike: () => ({
    subject: 'Trending alert from ContentPulse',
    html: '<h1>Trend Alert!</h1><p>A relevant topic is trending right now.</p>',
  }),
};

export async function processNotificationSend(
  payload: NotificationSendJobPayload,
  deps: Deps,
): Promise<void> {
  const { db, logger, resend } = deps;
  const { user_id, notification_id, event, channels, template_data } = payload;

  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, user_id)).limit(1);
  if (!user) {
    logger.warn({ user_id }, 'User not found for notification');
    return;
  }

  const now = new Date();

  if (channels.includes('email')) {
    const templateFn = EMAIL_TEMPLATES[event];
    const template = templateFn ? templateFn(template_data) : { subject: 'ContentPulse update', html: '<p>New update.</p>' };

    try {
      await resend.send({ to: user.email, subject: template.subject, html: template.html });
      await db
        .update(notifications)
        .set({ sentAt: now, updatedAt: now })
        .where(eq(notifications.id, notification_id));
    } catch (err) {
      logger.error({ err, notification_id }, 'Email send failed');
      await db
        .update(notifications)
        .set({ failedAt: now, errorMessage: String(err), updatedAt: now })
        .where(eq(notifications.id, notification_id));
    }
  }
}
