import { apiEnv } from '@contentpulse/config';
import { buildApp } from './app';

async function main() {
  const app = await buildApp(apiEnv);

  try {
    await app.listen({ port: apiEnv.PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
