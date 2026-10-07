'use strict';
const { buildServer } = require('./app.cjs');
(async () => {
  const app = await buildServer({ logger: true, demoData: process.env.DEMO_DATA !== 'false' });
  if (app.demoAccounts) console.log(`演示账号：${app.demoAccounts.slice(0, 2).map(user => user.account).join(' / ')}，登录信息见 README。`);
  const close = async () => { await app.close(); process.exit(0); };
  process.on('SIGINT', close); process.on('SIGTERM', close);
  await app.listen({ host: process.env.HOST || '127.0.0.1', port: Number(process.env.PORT || 3000) });
})().catch(error => { console.error(error.message); process.exitCode = 1; });
