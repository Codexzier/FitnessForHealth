import path from 'node:path';
import { buildApp } from './app';

async function main() {
  const port = Number(process.env.PORT ?? 8095);
  const host = process.env.HOST ?? '0.0.0.0';
  const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(__dirname, '../../data'));
  const staticDir = path.resolve(process.env.STATIC_DIR ?? path.join(__dirname, '../../client/dist'));

  const { app } = await buildApp({ dataDir, staticDir, logger: true });

  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  await app.listen({ port, host });
  console.log(`FitnessForHealth läuft auf http://${host}:${port} – Daten: ${dataDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
