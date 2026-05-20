import { describe, it, expect } from 'vitest';
import { maybeAutoApprovePackage } from '../../src/lib/package-status';

// Minimal mock db that records what .update().set() was called with
function makeDb(draftStatuses: string[]) {
  const updateSets: unknown[] = [];

  const db = {
    _updateSets: updateSets,
    select() {
      const p = Promise.resolve(draftStatuses.map((s) => ({ status: s })));
      const chain: any = { then: p.then.bind(p), catch: p.catch.bind(p), finally: p.finally.bind(p) };
      const noop = () => chain;
      for (const m of ['from', 'where', 'limit']) chain[m] = noop;
      return chain;
    },
    update() {
      return {
        set: (vals: unknown) => {
          updateSets.push(vals);
          const p = Promise.resolve([]);
          return { where: () => p, then: p.then.bind(p), catch: p.catch.bind(p), finally: p.finally.bind(p) };
        },
      };
    },
  };

  return db as any;
}

describe('maybeAutoApprovePackage', () => {
  it('transitions package when all drafts are approved', async () => {
    const db = makeDb(['approved', 'approved', 'approved']);
    await maybeAutoApprovePackage(db, 'pkg-1');
    expect(db._updateSets).toHaveLength(1);
    expect(db._updateSets[0]).toMatchObject({ status: 'approved' });
  });

  it('transitions package when mix of approved and rejected (all terminal, some approved)', async () => {
    const db = makeDb(['approved', 'rejected', 'approved']);
    await maybeAutoApprovePackage(db, 'pkg-1');
    expect(db._updateSets).toHaveLength(1);
    expect(db._updateSets[0]).toMatchObject({ status: 'approved' });
  });

  it('does not transition when any draft is still pending', async () => {
    const db = makeDb(['approved', 'draft', 'approved']);
    await maybeAutoApprovePackage(db, 'pkg-1');
    expect(db._updateSets).toHaveLength(0);
  });

  it('does not transition when all drafts are rejected (none approved)', async () => {
    const db = makeDb(['rejected', 'rejected', 'rejected']);
    await maybeAutoApprovePackage(db, 'pkg-1');
    expect(db._updateSets).toHaveLength(0);
  });

  it('does not transition when draft list is empty', async () => {
    const db = makeDb([]);
    await maybeAutoApprovePackage(db, 'pkg-1');
    expect(db._updateSets).toHaveLength(0);
  });

  it('still calls update (with WHERE guard) when package is already approved', async () => {
    // WHERE clause `eq(contentPackages.status, 'ready')` prevents double-transition at the DB
    // level — update IS called but the condition makes it a no-op in production
    const db = makeDb(['approved', 'approved']);
    await maybeAutoApprovePackage(db, 'pkg-1');
    // update IS called — DB's WHERE clause prevents it from actually changing anything
    expect(db._updateSets).toHaveLength(1);
    expect(db._updateSets[0]).toMatchObject({ status: 'approved' });
  });
});
