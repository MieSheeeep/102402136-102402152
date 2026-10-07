'use strict';
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const seed = require('../js/seed.js');
const sharp = require('sharp');
const { writeFile, readFile, unlink } = require('node:fs/promises');
const { join } = require('node:path');
const DEMO_PASSWORD = 'CampusDemo123!';
const marker = 'demo-seed-v1';
const profiles = [
  { oldId: 'me', account: 'demo_student', nickname: '叶同学', bio: '常在图书馆自习，希望每件失物都能找到主人。', color: '#607b68', background: '#e7eee5' },
  { oldId: 'student-lin', account: 'demo_lin', nickname: '林同学', bio: '教学楼和生活区两点一线，感谢每一位提供线索的同学。', color: '#a97459', background: '#f3e9de' },
  { oldId: 'student-zhou', account: 'demo_zhou', nickname: '周同学', bio: '捡到的物品会及时发布，认领时记得描述物品特征。', color: '#647d91', background: '#e7edf3' },
  { oldId: 'student-chen', account: 'demo_chen', nickname: '陈同学', bio: '喜欢运动和音乐，一起让校园里的小事更温暖。', color: '#937283', background: '#f1e8ee' },
  { oldId: 'student-wu', account: 'demo_wu', nickname: '吴同学', bio: '日常出没于教学楼，拾到物品后欢迎联系核对。', color: '#9c8a54', background: '#f0edde' }
];
const motifs = [
  '<path d="M109 204c-25-35-19-90 95-98 8 111-49 127-84 104"/><path d="M111 212l72-77"/>',
  '<path d="M159 224v-66M159 177c-40 0-62-24-62-55 42 0 62 19 62 55ZM159 160c0-38 21-61 62-66 5 40-14 65-62 66Z"/>',
  '<path d="M160 217c-24-23-49-24-79-18V105c29-7 55-4 79 17 24-21 50-24 79-17v94c-30-6-55-5-79 18ZM160 122v95"/>',
  '<path d="M81 218l56-99 31 49 24-34 48 84H81Z"/><circle cx="203" cy="96" r="15"/>',
  '<path d="M85 187h150M106 170a54 54 0 0 1 108 0M160 87V72M100 112l-11-11M220 112l11-11M111 213h98"/>'
];
async function renderAvatar(index, legacy = false) {
  const profile = profiles[index];
  // Legacy rendering is retained only to identify our old defaults by exact bytes.
  const svg = legacy ? `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><rect width="320" height="320" rx="160" fill="${profile.background}"/><circle cx="260" cy="65" r="80" fill="${profile.color}" opacity=".12"/><path d="M53 320v-48c0-64 48-106 107-106s107 42 107 106v48" fill="${profile.color}"/><circle cx="160" cy="126" r="59" fill="#ead0b6"/><path d="M100 124c-8-64 36-80 63-80 38 0 65 28 59 77-14-6-23-21-29-35-24 26-59 20-93 38Z" fill="#4a5147"/><circle cx="140" cy="130" r="4" fill="#4a5147"/><circle cx="182" cy="130" r="4" fill="#4a5147"/><path d="M147 154q14 12 28 0" fill="none" stroke="#a66f59" stroke-width="4" stroke-linecap="round"/></svg>` : `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><rect width="320" height="320" fill="${profile.background}"/><circle cx="160" cy="160" r="112" fill="white" opacity=".48"/><g fill="none" stroke="${profile.color}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round">${motifs[index]}</g></svg>`;
  return sharp(Buffer.from(svg)).webp({ quality: 85 }).toBuffer();
}
async function completeProfiles(db, accounts, dataDir) {
  const key = 'demo-profiles-v1';
  if (db.prepare('SELECT key FROM app_meta WHERE key=?').get(key)) return;
  const prepared = [];
  try {
    for (const [index, account] of accounts.entries()) {
      const user = db.prepare('SELECT * FROM users WHERE account=?').get(account.account); if (!user) continue;
      const profile = profiles[index]; if (!profile) continue;
      let image;
      if (!user.avatar) {
        const id = randomUUID();
        const buffer = await renderAvatar(index);
        image = { id, size: buffer.length, path: join(dataDir, 'uploads', `${id}.webp`) }; await writeFile(image.path, buffer, { flag: 'wx' });
      }
      prepared.push({ user, profile, image });
    }
    let applied = false;
    db.exec('BEGIN IMMEDIATE');
    try {
      if (!db.prepare('SELECT key FROM app_meta WHERE key=?').get(key)) {
        for (const { user, profile, image } of prepared) {
          if (image) db.prepare('INSERT INTO uploads VALUES (?,?,?,?)').run(image.id, user.id, image.size, new Date().toISOString());
          db.prepare("UPDATE users SET avatar=CASE WHEN avatar='' THEN ? ELSE avatar END,bio=CASE WHEN bio='' THEN ? ELSE bio END,campus=CASE WHEN campus='' THEN ? ELSE campus END,contact=CASE WHEN contact='' THEN ? ELSE contact END WHERE id=?")
            .run(image ? `/uploads/${image.id}.webp` : user.avatar, profile.bio, '旗山校区', '微信：campus_demo', user.id);
        }
        db.prepare('INSERT INTO app_meta VALUES (?,?)').run(key, 'done');
        applied = true;
      }
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    if (!applied) for (const { image } of prepared) if (image) await unlink(image.path);
  } catch (error) { for (const { image } of prepared) if (image) await unlink(image.path).catch(() => {}); throw error; }
}
async function upgradeAvatars(db, accounts, dataDir) {
  const key = 'demo-avatar-style-v2';
  if (db.prepare('SELECT key FROM app_meta WHERE key=?').get(key)) return;
  const prepared = [];
  try {
    for (const [index, account] of accounts.entries()) {
      if (!profiles[index]) continue;
      const user = db.prepare('SELECT * FROM users WHERE account=?').get(account.account);
      if (!user || !/^\/uploads\/[a-f0-9-]{36}\.webp$/.test(user.avatar)) continue;
      const old = await readFile(join(dataDir, user.avatar)).catch(() => null);
      if (!old || !old.equals(await renderAvatar(index, true))) continue;
      const id = randomUUID(); const buffer = await renderAvatar(index); const path = join(dataDir, 'uploads', `${id}.webp`);
      await writeFile(path, buffer, { flag: 'wx' }); prepared.push({ user, id, size: buffer.length, path });
    }
    const unused = []; db.exec('BEGIN IMMEDIATE');
    try {
      if (!db.prepare('SELECT key FROM app_meta WHERE key=?').get(key)) {
        for (const image of prepared) {
          const changed = db.prepare('UPDATE users SET avatar=? WHERE id=? AND avatar=?').run(`/uploads/${image.id}.webp`, image.user.id, image.user.avatar);
          if (changed.changes) db.prepare('INSERT INTO uploads VALUES (?,?,?,?)').run(image.id, image.user.id, image.size, new Date().toISOString());
          else unused.push(image.path);
        }
        db.prepare('INSERT INTO app_meta VALUES (?,?)').run(key, 'done');
      } else unused.push(...prepared.map(image => image.path));
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    for (const path of unused) await unlink(path).catch(() => {});
  } catch (error) { for (const image of prepared) await unlink(image.path).catch(() => {}); throw error; }
}
async function seedDemo(db, hashPassword, dataDir) {
  const saved = db.prepare('SELECT value FROM app_meta WHERE key=?').get(marker);
  if (saved) { const accounts = JSON.parse(saved.value); await completeProfiles(db, accounts, dataDir); await upgradeAvatars(db, accounts, dataDir); return accounts; }
  const hashes = await Promise.all(profiles.map(() => hashPassword(DEMO_PASSWORD)));
  let accounts;
  // All writes, including the import marker, commit together. No startup resets.
  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = db.prepare('SELECT value FROM app_meta WHERE key=?').get(marker);
    if (existing) { db.exec('COMMIT'); return JSON.parse(existing.value); }
    const base = new Date(); const owners = new Map(); accounts = [];
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
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  await completeProfiles(db, accounts, dataDir);
  await upgradeAvatars(db, accounts, dataDir);
  return accounts;
}
module.exports = { seedDemo, DEMO_PASSWORD, renderAvatar };
