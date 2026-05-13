import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { getDb } from '../src/client';

async function runMigrations() {
  const db = getDb();
  await migrate(db, { migrationsFolder: './migrations' });
  process.stdout.write('Migrations complete\n');
  process.exit(0);
}

runMigrations().catch((err: unknown) => {
  process.stderr.write(`Migration failed: ${String(err)}\n`);
  process.exit(1);
});
