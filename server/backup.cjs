'use strict';
const { DatabaseSync, backup } = require('node:sqlite');
const { mkdirSync, cpSync, writeFileSync } = require('node:fs');
const { resolve, join, dirname } = require('node:path');
(async () => {
  const source = resolve(process.env.DATA_DIR || './var');
  const target = resolve(process.argv[2] || join('backups', new Date().toISOString().replace(/[:.]/g, '-')));
  if (target === source || target.startsWith(source + require('node:path').sep)) throw new Error('备份目录不能位于数据目录内');
  mkdirSync(dirname(target), { recursive: true });
  mkdirSync(target, { recursive: false });
  const db = new DatabaseSync(join(source, 'campus.sqlite'), { readOnly: true });
  try {
    await backup(db, join(target, 'campus.sqlite'));
    cpSync(join(source, 'uploads'), join(target, 'uploads'), { recursive: true });
    writeFileSync(join(target, 'backup.json'), JSON.stringify({ createdAt: new Date().toISOString(), version: 1 }, null, 2));
    console.log(`备份已写入 ${target}`);
  } finally { db.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
