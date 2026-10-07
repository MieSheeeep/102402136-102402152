'use strict';
const { buildServer } = require('./app.cjs');
(async () => {
  const account = process.argv[2]?.trim().toLowerCase();
  if (!account) throw new Error('用法：npm run admin -- 已注册的账号');
  const app = await buildServer();
  try {
    const result = app.db.prepare("UPDATE users SET role='admin' WHERE account=?").run(account);
    if (!result.changes) throw new Error('账号不存在，请先在网页注册');
    console.log('管理员已设置。重新登录后，在设置中进入公告与内容管理。');
  } finally { await app.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
