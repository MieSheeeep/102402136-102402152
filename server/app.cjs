'use strict';
const Fastify = require('fastify');
const { DatabaseSync } = require('node:sqlite');
const { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const { mkdirSync, readFileSync } = require('node:fs');
const { writeFile, unlink } = require('node:fs/promises');
const { join, resolve } = require('node:path');
const sharp = require('sharp');
const D = require('../js/data.js');
const derive = promisify(scrypt);
const digest = value => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('hex');
const fail = (statusCode, message, fields) => { const error = new Error(message); error.statusCode = statusCode; error.fields = fields; throw error; };
const publicUser = row => ({ id: row.id, nickname: row.nickname, avatar: row.avatar, bio: row.bio || '', campus: row.campus || '', createdAt: row.created_at });
const ownUser = row => ({ ...publicUser(row), account: row.account, role: row.role, contact: row.contact || '' });
const passwordValid = value => typeof value === 'string' && value.length >= 10 && value.length <= 128;
async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `${salt}:${key.toString('hex')}`;
}
async function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const actual = await derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return timingSafeEqual(actual, Buffer.from(hash, 'hex'));
}

async function buildServer(options = {}) {
  const dataDir = resolve(options.dataDir || process.env.DATA_DIR || join(__dirname, '..', 'var'));
  mkdirSync(join(dataDir, 'uploads'), { recursive: true });
  const db = new DatabaseSync(join(dataDir, 'campus.sqlite'), { timeout: 5000 });
  if (db.prepare('PRAGMA user_version').get().user_version > 1) { db.close(); throw new Error('数据库版本较新，请使用匹配版本的应用'); }
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, account TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      recovery_hash TEXT NOT NULL, nickname TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
      preferences TEXT NOT NULL DEFAULT '{}', role TEXT NOT NULL DEFAULT 'user');
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1);
    CREATE INDEX IF NOT EXISTS items_owner ON items(owner_id);
    CREATE TABLE IF NOT EXISTS favorites (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE, PRIMARY KEY(user_id,item_id));
    CREATE TABLE IF NOT EXISTS uploads (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      size INTEGER NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS notices (item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
      reward INTEGER NOT NULL DEFAULT 0, expires_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS urgent_requests (item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
      reward INTEGER NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    PRAGMA user_version=1;`);
  const userColumns = new Set(db.prepare('PRAGMA table_info(users)').all().map(column => column.name));
  for (const column of ['bio', 'campus', 'contact']) if (!userColumns.has(column)) db.exec(`ALTER TABLE users ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`);
  const app = Fastify({ logger: options.logger || false, bodyLimit: 32 * 1024, trustProxy: false });
  await app.register(require('@fastify/cookie'));
  await app.register(require('@fastify/rate-limit'), { global: true, max: 240, timeWindow: '1 minute' });
  await app.register(require('@fastify/multipart'), { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 1 } });
  app.decorate('db', db);
  app.addHook('onClose', async () => db.close());
  if (options.demoData) {
    try { app.decorate('demoAccounts', await require('./demo.cjs').seedDemo(db, hashPassword, dataDir)); }
    catch (error) { await app.close(); throw error; }
  }
  const root = resolve(__dirname, '..');
  await app.register(require('@fastify/static'), { root: join(root, 'assets'), prefix: '/assets/', decorateReply: false });
  await app.register(require('@fastify/static'), { root: join(root, 'css'), prefix: '/css/', decorateReply: false });
  await app.register(require('@fastify/static'), { root: join(root, 'js'), prefix: '/js/', decorateReply: false });
  await app.register(require('@fastify/static'), { root: join(dataDir, 'uploads'), prefix: '/uploads/', decorateReply: false,
    setHeaders(reply) { reply.header('X-Content-Type-Options', 'nosniff'); reply.header('Cache-Control', 'public, max-age=31536000, immutable'); } });
  app.get('/', async (_, reply) => reply.type('text/html; charset=utf-8').send(readFileSync(join(root, 'index.html'))));
  app.get('/index.html', async (_, reply) => reply.type('text/html; charset=utf-8').send(readFileSync(join(root, 'index.html'))));
  app.addHook('onRequest', async (req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header('Content-Security-Policy', "default-src 'self'; img-src 'self' blob: data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if (!req.url.startsWith('/api/')) return;
    reply.header('Cache-Control', 'no-store');
    // Browser writes must come from this origin; API clients without Origin use Bearer credentials.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin) {
      const expected = process.env.APP_ORIGIN || `${req.protocol}://${req.headers.host}`;
      if (req.headers.origin !== expected) fail(403, '不允许来自其他站点的请求');
    }
    const bearer = req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    const token = bearer || req.cookies.campus_session;
    if (token && /^[a-f0-9]{64}$/.test(token)) {
      const session = db.prepare('SELECT * FROM sessions WHERE token_hash=? AND expires_at>?').get(digest(token), Date.now());
      if (session) { req.session = session; req.user = db.prepare('SELECT * FROM users WHERE id=?').get(session.user_id); req.bearer = Boolean(bearer); }
    }
  });
  app.setErrorHandler((error, req, reply) => {
    const status = error.statusCode || 500;
    if (status >= 500) req.log.error(error);
    const message = status >= 500 ? '服务暂时无法完成操作，请稍后重试' : status === 429 ? '操作太频繁，请稍后再试' : status === 413 ? '请求内容过大，请缩小内容后重试' : error.message;
    reply.code(status).send({ message, ...(error.fields ? { fields: error.fields } : {}) });
  });
  const auth = req => {
    if (!req.user) fail(401, '请先登录');
    if (!['GET', 'HEAD'].includes(req.method) && !req.bearer && req.headers['x-csrf-token'] !== req.session.csrf) fail(403, '登录校验已变化，请刷新后重试');
    return req.user;
  };
  const admin = req => { const user = auth(req); if (user.role !== 'admin') fail(403, '需要管理员权限'); return user; };
  const getItem = (id, viewer) => {
    const row = db.prepare('SELECT i.*,u.nickname,u.avatar FROM items i JOIN users u ON u.id=i.owner_id WHERE i.id=?').get(id);
    if (!row) fail(404, '这条信息已不存在');
    return { ...JSON.parse(row.data), version: row.version, ownerName: row.nickname, ownerAvatar: row.avatar, contact: viewer ? JSON.parse(row.data).contact : '' };
  };
  const listItems = viewer => db.prepare('SELECT id FROM items').all().map(row => getItem(row.id, viewer)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const preferences = user => ({ sort: 'newest', saveSearchHistory: true, recentSearches: [], ...JSON.parse(user?.preferences || '{}') });
  const validateNickname = value => { if (typeof value !== 'string' || !value.trim() || value.trim().length > 24) fail(400, '昵称需要填写 1–24 个字'); return value.trim(); };
  const ownedImage = (url, user) => {
    if (!url || url === 'assets/default-item.svg') return 'assets/default-item.svg';
    if (typeof url !== 'string' || !/^\/uploads\/[a-f0-9-]{36}\.webp$/.test(url)) fail(400, '请选择上传的图片');
    const upload = db.prepare('SELECT user_id FROM uploads WHERE id=?').get(url.slice(9, -5));
    if (!upload || upload.user_id !== user.id) fail(403, '只能使用本人上传的图片');
    return url;
  };
  const issueSession = (user, req, reply) => {
    const token = secret(); const csrf = secret(); const expires = Date.now() + 7 * 86400000;
    db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(Date.now());
    db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(digest(token), user.id, csrf, expires);
    const result = { user: ownUser(user), csrf };
    if (req.body?.transport === 'bearer') result.token = token;
    else reply.setCookie('campus_session', token, { httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE === 'true', path: '/', maxAge: 7 * 86400 });
    return result;
  };
  const accountOf = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
  const authLimit = { config: { rateLimit: { max: 15, timeWindow: '1 minute' } } };
  app.get('/api/health', async () => ({ ok: true, database: db.prepare('PRAGMA quick_check').get().quick_check }));
  app.post('/api/auth/register', authLimit, async (req, reply) => {
    const { password, nickname } = req.body || {}; const account = accountOf(req.body?.account);
    if (!/^[a-z0-9_@.\-]{4,64}$/.test(account)) fail(400, '账号需要 4–64 位字母、数字或 _ @ . -');
    if (!passwordValid(password)) fail(400, '密码需要 10–128 个字符');
    const name = validateNickname(nickname);
    if (db.prepare('SELECT id FROM users WHERE account=?').get(account)) fail(409, '这个账号已注册');
    const passwordHash = await hashPassword(password); const recoveryCode = secret(); const id = randomUUID();
    try { db.prepare('INSERT INTO users (id,account,password_hash,recovery_hash,nickname,created_at) VALUES (?,?,?,?,?,?)').run(id, account, passwordHash, digest(recoveryCode), name, new Date().toISOString()); }
    catch (error) { if (error.code?.includes('SQLITE_CONSTRAINT')) fail(409, '这个账号已注册'); throw error; }
    reply.code(201); return { ...issueSession(db.prepare('SELECT * FROM users WHERE id=?').get(id), req, reply), recoveryCode };
  });
  app.post('/api/auth/login', authLimit, async (req, reply) => {
    const { password } = req.body || {}; const user = db.prepare('SELECT * FROM users WHERE account=?').get(accountOf(req.body?.account));
    if (typeof password !== 'string' || password.length > 128) fail(401, '账号或密码不正确');
    // An absent account performs the same password derivation to reduce account enumeration.
    const valid = await verifyPassword(password, user?.password_hash || `${'0'.repeat(32)}:${'0'.repeat(128)}`);
    if (!user || !valid) fail(401, '账号或密码不正确');
    return issueSession(user, req, reply);
  });
  app.get('/api/auth/me', async req => ({ user: req.user ? ownUser(req.user) : null, csrf: req.session?.csrf || '' }));
  app.post('/api/auth/logout', async (req, reply) => {
    auth(req); db.prepare('DELETE FROM sessions WHERE token_hash=?').run(req.session.token_hash);
    reply.clearCookie('campus_session', { path: '/' }); return { ok: true };
  });
  app.post('/api/auth/recover', authLimit, async req => {
    const { recoveryCode, password } = req.body || {};
    if (!passwordValid(password)) fail(400, '密码需要 10–128 个字符');
    const user = db.prepare('SELECT * FROM users WHERE account=?').get(accountOf(req.body?.account));
    if (!user || typeof recoveryCode !== 'string' || recoveryCode.length !== 64 || !timingSafeEqual(Buffer.from(digest(recoveryCode)), Buffer.from(user.recovery_hash))) fail(401, '账号或恢复码不正确');
    const oldHash = user.recovery_hash; const nextCode = secret(); const passwordHash = await hashPassword(password);
    db.exec('BEGIN IMMEDIATE');
    try {
      const change = db.prepare('UPDATE users SET password_hash=?,recovery_hash=? WHERE id=? AND recovery_hash=?').run(passwordHash, digest(nextCode), user.id, oldHash);
      if (!change.changes) fail(401, '恢复码已使用');
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id); db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return { recoveryCode: nextCode };
  });
  app.post('/api/auth/password', authLimit, async req => {
    const user = auth(req); const { currentPassword, password } = req.body || {};
    if (!passwordValid(password) || typeof currentPassword !== 'string' || currentPassword.length > 128) fail(400, '请填写当前密码及 10–128 位新密码');
    if (!await verifyPassword(currentPassword, user.password_hash)) fail(401, '当前密码不正确');
    const passwordHash = await hashPassword(password);
    db.exec('BEGIN IMMEDIATE');
    try {
      const session = db.prepare('SELECT token_hash FROM sessions WHERE token_hash=? AND expires_at>?').get(req.session.token_hash, Date.now());
      if (!session) fail(401, '登录已失效，请重新登录');
      const changed = db.prepare('UPDATE users SET password_hash=? WHERE id=? AND password_hash=?').run(passwordHash, user.id, user.password_hash);
      if (!changed.changes) fail(409, '密码已被修改，请重新登录');
      db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').run(user.id, req.session.token_hash); db.exec('COMMIT');
    }
    catch (error) { db.exec('ROLLBACK'); throw error; }
    return { ok: true };
  });
  app.get('/api/state', async req => {
    const prefs = preferences(req.user);
    return { version: 1, remote: true, user: req.user ? ownUser(req.user) : null,
      items: listItems(req.user), favorites: req.user ? db.prepare('SELECT item_id FROM favorites WHERE user_id=?').all(req.user.id).map(row => row.item_id) : [],
      preferences: { sort: prefs.sort, saveSearchHistory: prefs.saveSearchHistory }, recentSearches: prefs.recentSearches,
      notices: db.prepare('SELECT * FROM notices WHERE expires_at>?').all(new Date().toISOString()).flatMap(row => { const item = getItem(row.item_id, req.user); return item.status === 'open' ? [{ ...item, reward: row.reward }] : []; }),
      urgentRequests: req.user?.role === 'admin' ? db.prepare('SELECT * FROM urgent_requests ORDER BY created_at').all().flatMap(row => { const item = getItem(row.item_id, req.user); return item.status === 'open' ? [{ ...item, reward: row.reward }] : []; }) : [] };
  });
  app.get('/api/items', async req => {
    const filters = { keyword: String(req.query.keyword || '').slice(0, 100), type: req.query.type, ownerId: req.query.ownerId, status: req.query.status,
      categories: [].concat(req.query.categories || []), locations: [].concat(req.query.locations || []), timeRange: req.query.timeRange, dateStart: req.query.dateStart, dateEnd: req.query.dateEnd, sort: req.query.sort };
    if (D.validateFilters(filters)) fail(400, D.validateFilters(filters));
    const items = D.queryItems(listItems(req.user), filters, []); const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30)); const offset = Math.max(0, Number(req.query.offset) || 0);
    return { items: items.slice(offset, offset + limit), total: items.length };
  });
  app.get('/api/items/:id', async req => getItem(req.params.id, req.user));
  app.post('/api/items', async (req, reply) => {
    const user = auth(req); const body = req.body || {};
    if (body.timePrecision === 'unknown') fail(400, '请填写丢失或拾取时间');
    const errors = D.validateItem(body); if (Object.keys(errors).length) fail(400, '请检查发布信息', errors);
    const item = D.createItem(body, user.id); item.image = ownedImage(body.image, user);
    db.prepare('INSERT INTO items (id,owner_id,data) VALUES (?,?,?)').run(item.id, user.id, JSON.stringify(item));
    reply.code(201); return getItem(item.id, user);
  });
  app.patch('/api/items/:id', async req => {
    const user = auth(req); const old = getItem(req.params.id, user); const body = req.body || {};
    if (old.ownerId !== user.id) fail(403, '只能管理本人发布的信息');
    if (body.version !== old.version) fail(409, '信息已被修改，请刷新后重试');
    let item;
    if (body.status !== undefined) {
      if (!['open', 'completed'].includes(body.status)) fail(400, '状态不正确');
      item = (body.status === 'completed' ? D.completeItem : D.reopenItem)([old], old.id, user.id)[0];
    } else {
      if (body.timePrecision === 'unknown') fail(400, '请填写丢失或拾取时间');
      try { item = D.updateItem([old], old.id, body, user.id)[0]; } catch (error) { fail(400, error.message, error.fields); }
      item.image = body.image === undefined ? old.image : ownedImage(body.image, user);
    }
    const result = db.prepare('UPDATE items SET data=?,version=version+1 WHERE id=? AND version=?').run(JSON.stringify(item), old.id, old.version);
    if (!result.changes) fail(409, '信息已被修改，请刷新后重试'); return getItem(old.id, user);
  });
  app.delete('/api/items/:id', async req => { const user = auth(req); const item = getItem(req.params.id, user); if (item.ownerId !== user.id) fail(403, '只能管理本人发布的信息'); db.prepare('DELETE FROM items WHERE id=?').run(item.id); return { ok: true }; });
  app.put('/api/favorites/:id', async req => { const user = auth(req); getItem(req.params.id, user); if (typeof req.body?.active !== 'boolean') fail(400, '收藏状态不正确'); if (req.body.active) db.prepare('INSERT OR IGNORE INTO favorites VALUES (?,?)').run(user.id, req.params.id); else db.prepare('DELETE FROM favorites WHERE user_id=? AND item_id=?').run(user.id, req.params.id); return { active: req.body.active }; });
  app.delete('/api/favorites', async req => { const user = auth(req); db.prepare('DELETE FROM favorites WHERE user_id=?').run(user.id); return { ok: true }; });
  app.patch('/api/me', async req => {
    const user = auth(req); const body = req.body || {};
    const nickname = body.nickname === undefined ? user.nickname : validateNickname(body.nickname);
    const avatar = body.avatar === undefined ? user.avatar : body.avatar === '' ? '' : ownedImage(body.avatar, user);
    const fields = {};
    const labels = { bio: '个人简介', campus: '所在校区', contact: '常用联系方式' };
    for (const [name, max] of [['bio', 160], ['campus', 30], ['contact', 120]]) {
      if (body[name] !== undefined && typeof body[name] !== 'string') fail(400, `请填写文字格式的${labels[name]}`);
      if (typeof body[name] === 'string' && body[name].trim().length > max) fail(400, `${labels[name]}不能超过 ${max} 字`);
      fields[name] = body[name] === undefined ? user[name] : body[name].trim();
    }
    db.prepare('UPDATE users SET nickname=?,avatar=?,bio=?,campus=?,contact=? WHERE id=?').run(nickname, avatar, fields.bio, fields.campus, fields.contact, user.id);
    return ownUser(db.prepare('SELECT * FROM users WHERE id=?').get(user.id));
  });
  app.patch('/api/me/preferences', async req => {
    const user = auth(req); const body = req.body || {}; const prefs = preferences(user);
    if (body.sort !== undefined) { if (!['newest', 'oldest'].includes(body.sort)) fail(400, '排序不正确'); prefs.sort = body.sort; }
    if (body.saveSearchHistory !== undefined) { if (typeof body.saveSearchHistory !== 'boolean') fail(400, '设置不正确'); prefs.saveSearchHistory = body.saveSearchHistory; }
    if (body.recentSearches !== undefined) { if (!Array.isArray(body.recentSearches) || body.recentSearches.length > 8 || !body.recentSearches.every(word => typeof word === 'string' && word.length <= 100)) fail(400, '搜索记录不正确'); prefs.recentSearches = body.recentSearches; }
    db.prepare('UPDATE users SET preferences=? WHERE id=?').run(JSON.stringify(prefs), user.id); return prefs;
  });
  app.get('/api/users/:id', async req => {
    const row = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id); if (!row) fail(404, '用户不存在');
    const items = listItems(req.user).filter(item => item.ownerId === row.id); const completed = items.filter(item => item.status === 'completed').length;
    return { user: publicUser(row), stats: { published: items.length, open: items.length - completed, completed }, items };
  });
  app.post('/api/uploads', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const user = auth(req); const usage = db.prepare('SELECT COALESCE(SUM(size),0) AS size FROM uploads WHERE user_id=?').get(user.id).size;
    if (usage >= 100 * 1024 * 1024) fail(413, '图片存储已达到 100 MB');
    const file = await req.file(); if (!file) fail(400, '请选择图片'); const input = await file.toBuffer();
    if (file.file.truncated) fail(413, '图片不能超过 5 MB');
    let output;
    try {
      const image = sharp(input, { limitInputPixels: 16000000, animated: false }); const meta = await image.metadata();
      if (!['jpeg', 'png', 'webp'].includes(meta.format)) fail(400, '请上传 JPG、PNG 或 WebP 图片');
      output = await image.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    } catch (_) { fail(400, '图片无法读取，请选择有效的 JPG、PNG 或 WebP 图片'); }
    const id = randomUUID(); const path = join(dataDir, 'uploads', `${id}.webp`);
    await writeFile(path, output, { flag: 'wx' });
    try { db.prepare('INSERT INTO uploads VALUES (?,?,?,?)').run(id, user.id, output.length, new Date().toISOString()); } catch (error) { await unlink(path); throw error; }
    reply.code(201); return { url: `/uploads/${id}.webp` };
  });
  app.put('/api/admin/notices/:id', async req => {
    admin(req); const item = getItem(req.params.id, req.user); const { reward = 0, expiresAt } = req.body || {};
    if (item.type !== 'lost' || item.status !== 'open' || !Number.isInteger(reward) || reward < 0 || reward > 100000 || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()) fail(400, '请填写有效的寻物公告、酬谢金额和到期时间');
    db.exec('BEGIN IMMEDIATE');
    try { db.prepare('INSERT INTO notices VALUES (?,?,?) ON CONFLICT(item_id) DO UPDATE SET reward=excluded.reward,expires_at=excluded.expires_at').run(item.id, reward, new Date(expiresAt).toISOString()); db.prepare('DELETE FROM urgent_requests WHERE item_id=?').run(item.id); db.exec('COMMIT'); }
    catch (error) { db.exec('ROLLBACK'); throw error; }
    return { ok: true };
  });
  app.post('/api/urgent-requests/:id', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req, reply) => {
    const user = auth(req); const item = getItem(req.params.id, user); const reward = req.body?.reward;
    if (item.ownerId !== user.id) fail(403, '只能为本人发布申请紧急公告');
    if (item.type !== 'lost' || item.status !== 'open' || !Number.isInteger(reward) || reward < 0 || reward > 100000) fail(400, '请选择进行中的寻物信息和有效酬谢金额');
    db.prepare('INSERT INTO urgent_requests VALUES (?,?,?) ON CONFLICT(item_id) DO UPDATE SET reward=excluded.reward').run(item.id, reward, new Date().toISOString());
    reply.code(201); return { ok: true };
  });
  app.delete('/api/admin/urgent-requests/:id', async req => { admin(req); db.prepare('DELETE FROM urgent_requests WHERE item_id=?').run(req.params.id); return { ok: true }; });
  app.delete('/api/admin/notices/:id', async req => { admin(req); db.prepare('DELETE FROM notices WHERE item_id=?').run(req.params.id); return { ok: true }; });
  app.delete('/api/admin/items/:id', async req => { admin(req); db.prepare('DELETE FROM items WHERE id=?').run(req.params.id); return { ok: true }; });
  return app;
}
module.exports = { buildServer };
