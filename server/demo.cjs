'use strict';
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const seed = require('../js/seed.js');
const DEMO_PASSWORD = 'CampusDemo123!';
const marker = 'demo-seed-v1';
const profiles = [
  { oldId: 'me', account: 'demo_student', nickname: '叶同学' },
  { oldId: 'student-lin', account: 'demo_lin', nickname: '林同学' },
  { oldId: 'student-zhou', account: 'demo_zhou', nickname: '周同学' },
  { oldId: 'student-chen', account: 'demo_chen', nickname: '陈同学' },
  { oldId: 'student-wu', account: 'demo_wu', nickname: '吴同学' }
];
async function seedDemo(db, hashPassword) {
  const saved = db.prepare('SELECT value FROM app_meta WHERE key=?').get(marker);
  if (saved) return JSON.parse(saved.value);
  const hashes = await Promise.all(profiles.map(() => hashPassword(DEMO_PASSWORD)));
  // All writes, including the import marker, commit together. No startup resets.
  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = db.prepare('SELECT value FROM app_meta WHERE key=?').get(marker);
    if (existing) { db.exec('COMMIT'); return JSON.parse(existing.value); }
    const base = new Date(); const owners = new Map(); const accounts = [];
    profiles.forEach((profile, index) => {
      let account = profile.account; let suffix = 2;
      while (db.prepare('SELECT id FROM users WHERE account=?').get(account)) account = `${profile.account}_${suffix++}`;
      const id = randomUUID(); const recoveryHash = createHash('sha256').update(randomBytes(32)).digest('hex');
      db.prepare('INSERT INTO users (id,account,password_hash,recovery_hash,nickname,created_at) VALUES (?,?,?,?,?,?)')
        .run(id, account, hashes[index], recoveryHash, profile.nickname, new Date(base.getTime() - 7 * 86400000).toISOString());
      owners.set(profile.oldId, { id, nickname: profile.nickname }); accounts.push({ account, nickname: profile.nickname });
    });
    const posts = new Map();
    for (const sample of seed().items) {
      const owner = owners.get(sample.ownerId);
      const id = db.prepare('SELECT id FROM items WHERE id=?').get(sample.id) ? randomUUID() : sample.id;
      const item = { ...sample, id, ownerId: owner.id, ownerName: owner.nickname, timePrecision: 'datetime', locationGroups: [sample.locationGroup] };
      db.prepare('INSERT INTO items (id,owner_id,data) VALUES (?,?,?)').run(id, owner.id, JSON.stringify(item)); posts.set(sample.id, id);
    }
    for (const [id, reward] of [['demo-1', 30], ['demo-5', 20], ['demo-7', 50]]) {
      db.prepare('INSERT INTO notices VALUES (?,?,?)').run(posts.get(id), reward, new Date(base.getTime() + 30 * 86400000).toISOString());
    }
    for (const [owner, post] of [['me', 'demo-1'], ['me', 'demo-2'], ['student-lin', 'demo-5']]) {
      db.prepare('INSERT INTO favorites VALUES (?,?)').run(owners.get(owner).id, posts.get(post));
    }
    db.prepare('INSERT INTO app_meta VALUES (?,?)').run(marker, JSON.stringify(accounts)); db.exec('COMMIT');
    return accounts;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
module.exports = { seedDemo, DEMO_PASSWORD };
