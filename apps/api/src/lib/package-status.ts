import { and, eq } from 'drizzle-orm';
import type { Db } from '@contentpulse/db';
import { contentPackages, drafts } from '@contentpulse/db';

// Promotes a content package from 'ready' to 'approved' once every draft has
// reached a terminal state (approved or rejected) and at least one is approved.
// No-op for any other current package status — safe to call after every draft
// approve/reject without extra guards at the call site.
export async function maybeAutoApprovePackage(db: Db, packageId: string): Promise<void> {
  const allDrafts = await db
    .select({ status: drafts.status })
    .from(drafts)
    .where(eq(drafts.contentPackageId, packageId));

  if (allDrafts.length === 0) return;

  const allTerminal = allDrafts.every((d) => d.status === 'approved' || d.status === 'rejected');
  const anyApproved = allDrafts.some((d) => d.status === 'approved');
  if (!allTerminal || !anyApproved) return;

  await db
    .update(contentPackages)
    .set({ status: 'approved', updatedAt: new Date() })
    .where(and(eq(contentPackages.id, packageId), eq(contentPackages.status, 'ready')));
}
