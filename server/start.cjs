'use strict';
const { buildServer } = require('./app.cjs');
(async () => {
  const app = await buildServer({ logger: true });
  const close = async () => { await app.close(); process.exit(0); };
  process.on('SIGINT', close); process.on('SIGTERM', close);
  await app.listen({ host: process.env.HOST || '127.0.0.1', port: Number(process.env.PORT || 3000) });
})().catch(error => { console.error(error.message); process.exitCode = 1; });
