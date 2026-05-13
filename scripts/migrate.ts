import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { getDb } from '../packages/db/src/client';
import path from 'path';

async function main() {
  const db = getDb();
  const migrationsFolder = path.join(__dirname, '../packages/db/migrations');
  await migrate(db, { migrationsFolder });
  process.stdout.write('All migrations applied successfully.\n');
  process.exit(0);
}

main().catch((err: unknown) => {
  process.stderr.write(`Migration failed: ${String(err)}\n`);
  process.exit(1);
});
