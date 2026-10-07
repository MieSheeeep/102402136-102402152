const { describe, it, beforeEach, afterEach } = require('mocha');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { buildServer } = require('../server/app.cjs');
const sharp = require('sharp');

describe('真实后端、多用户与持久化', function () {
  this.timeout(20000);
  let app, dir, a, b;
  async function call(method, url, payload, auth) {
    return app.inject({ method, url, payload, headers: auth ? { authorization: `Bearer ${auth.token}` } : {} });
  }
  async function register(account) {
    const res = await call('POST', '/api/auth/register', { account, password: 'CorrectPass!123', nickname: account, transport: 'bearer' });
    assert.equal(res.statusCode, 201, res.body); return res.json();
  }
  const post = () => ({ type: 'lost', name: '蓝色书包', category: '生活用品', locationGroups: ['教学楼', '食堂'], locationDetail: '东二302', occurredAt: '2026-10-07T09:00', contact: '微信abc', description: '蓝色', timePrecision: 'datetime' });
  beforeEach(async () => { dir = mkdtempSync(join(tmpdir(), 'campus-api-')); app = await buildServer({ dataDir: dir }); a = await register('student_a'); b = await register('student_b'); });
  afterEach(async () => { await app.close(); rmSync(dir, { recursive: true, force: true }); });
  it('registers unique accounts, rejects bad passwords, hashes secrets and hides private profile fields', async () => {
    assert.equal((await call('POST', '/api/auth/register', { account: 'student_a', password: 'CorrectPass!123', nickname: 'a' })).statusCode, 409);
    assert.equal((await call('POST', '/api/auth/login', { account: 'student_a', password: 'wrong' })).statusCode, 401);
    const profile = (await call('GET', `/api/users/${a.user.id}`)).json();
    assert.equal(profile.user.nickname, 'student_a');
    assert.equal(profile.user.account, undefined); assert.equal(profile.user.passwordHash, undefined);
    assert.ok(!readFileSync(join(dir, 'campus.sqlite')).includes(Buffer.from('CorrectPass!123')));
  });
  it('isolates write permissions and favorites between two accounts', async () => {
    assert.equal((await call('POST', '/api/items', post())).statusCode, 401);
    const created = await call('POST', '/api/items', { ...post(), ownerId: b.user.id }, a);
    assert.equal(created.statusCode, 201, created.body); const item = created.json(); assert.equal(item.ownerId, a.user.id);
    assert.equal((await call('PATCH', `/api/items/${item.id}`, { ...post(), version: item.version }, b)).statusCode, 403);
    assert.equal((await call('DELETE', `/api/items/${item.id}`, null, b)).statusCode, 403);
    assert.equal((await call('PUT', `/api/favorites/${item.id}`, { active: true }, b)).statusCode, 200);
    assert.deepEqual((await call('GET', '/api/state', null, a)).json().favorites, []);
    assert.deepEqual((await call('GET', '/api/state', null, b)).json().favorites, [item.id]);
    assert.equal((await call('GET', '/api/state')).json().items[0].contact, '');
    assert.equal((await call('GET', `/api/items/${item.id}`, null, b)).json().contact, '微信abc');
  });
  it('updates profile on historical posts, counts completion and rejects stale edits', async () => {
    let item = (await call('POST', '/api/items', post(), a)).json();
    assert.equal((await call('PATCH', '/api/me', { nickname: '新的昵称' }, a)).statusCode, 200);
    const done = await call('PATCH', `/api/items/${item.id}`, { status: 'completed', version: item.version }, a);
    assert.equal(done.statusCode, 200, done.body);
    assert.equal((await call('PATCH', `/api/items/${item.id}`, { status: 'open', version: item.version }, a)).statusCode, 409);
    let profile = (await call('GET', `/api/users/${a.user.id}`)).json();
    assert.deepEqual(profile.stats, { published: 1, open: 0, completed: 1 }); assert.equal(profile.items[0].ownerName, '新的昵称');
    item = done.json(); assert.equal((await call('PATCH', `/api/items/${item.id}`, { status: 'open', version: item.version }, a)).statusCode, 200);
    assert.equal((await call('GET', `/api/users/${a.user.id}`)).json().stats.completed, 0);
  });
  it('persists posts, favorites and login across server restart; deletion cascades favorites', async () => {
    const item = (await call('POST', '/api/items', post(), a)).json();
    await call('PUT', `/api/favorites/${item.id}`, { active: true }, b);
    await app.close(); app = await buildServer({ dataDir: dir });
    assert.deepEqual((await call('GET', '/api/state', null, b)).json().favorites, [item.id]);
    await call('DELETE', `/api/items/${item.id}`, null, a);
    assert.deepEqual((await call('GET', '/api/state', null, b)).json().favorites, []);
  });
  it('uses HttpOnly cookies with CSRF protection and revokes logout sessions', async () => {
    const login = await call('POST', '/api/auth/login', { account: 'student_a', password: 'CorrectPass!123' });
    const cookie = login.headers['set-cookie']; assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=Lax/i);
    const headers = { cookie: cookie.split(';')[0] };
    assert.equal((await app.inject({ method: 'PATCH', url: '/api/me', headers, payload: { nickname: '失败' } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'PATCH', url: '/api/me', headers: { ...headers, 'x-csrf-token': login.json().csrf }, payload: { nickname: '成功' } })).statusCode, 200);
    assert.equal((await call('POST', '/api/auth/logout', {}, a)).statusCode, 200);
    assert.equal((await call('GET', '/api/auth/me', null, a)).json().user, null);
    assert.equal((await call('PATCH', '/api/me', { nickname: '失败' }, a)).statusCode, 401);
  });
  it('recovers with one-time recovery code and revokes prior sessions', async () => {
    const reset = await call('POST', '/api/auth/recover', { account: 'student_a', recoveryCode: a.recoveryCode, password: 'NewCorrectPass!123' });
    assert.equal(reset.statusCode, 200, reset.body); assert.ok(reset.json().recoveryCode);
    assert.equal((await call('PATCH', '/api/me', { nickname: '失败' }, a)).statusCode, 401);
    assert.equal((await call('POST', '/api/auth/recover', { account: 'student_a', recoveryCode: a.recoveryCode, password: 'AnotherPass!123' })).statusCode, 401);
    assert.equal((await call('POST', '/api/auth/login', { account: 'student_a', password: 'NewCorrectPass!123' })).statusCode, 200);
  });
  it('validates image content and prevents another user claiming an uploaded image', async () => {
    const png = await sharp({ create: { width: 12, height: 12, channels: 3, background: '#abc' } }).png().toBuffer();
    const boundary = 'campus-test';
    const upload = data => app.inject({ method: 'POST', url: '/api/uploads', headers: { authorization: `Bearer ${a.token}`, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`), data, Buffer.from(`\r\n--${boundary}--\r\n`)]) });
    assert.equal((await upload(Buffer.from('<svg onload="alert(1)"></svg>'))).statusCode, 400);
    const result = await upload(png); assert.equal(result.statusCode, 201, result.body); const { url } = result.json();
    assert.equal((await call('PATCH', '/api/me', { avatar: url }, b)).statusCode, 403);
    assert.equal((await call('PATCH', '/api/me', { avatar: url }, a)).statusCode, 200);
    await app.close(); app = await buildServer({ dataDir: dir });
    const image = await call('GET', url); assert.equal(image.statusCode, 200); assert.match(image.headers['content-type'], /image\/webp/);
  });
  it('validates event time and protects filesystem and cross-origin requests', async () => {
    assert.equal((await call('POST', '/api/items', { ...post(), timePrecision: 'unknown', occurredAt: '' }, a)).statusCode, 400);
    assert.equal((await call('GET', '/server/app.cjs')).statusCode, 404);
    assert.equal((await call('GET', '/package.json')).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin: 'https://untrusted.example' }, payload: { account: 'student_a', password: 'CorrectPass!123' } })).statusCode, 403);
  });
  it('changing password revokes other sessions and expired sessions cannot write', async () => {
    const second = (await call('POST', '/api/auth/login', { account: 'student_a', password: 'CorrectPass!123', transport: 'bearer' })).json();
    assert.equal((await call('POST', '/api/auth/password', { currentPassword: 'wrong', password: 'ChangedPass!123' }, a)).statusCode, 401);
    assert.equal((await call('POST', '/api/auth/password', { currentPassword: 'CorrectPass!123', password: 'ChangedPass!123' }, a)).statusCode, 200);
    assert.equal((await call('PATCH', '/api/me', { nickname: '失败' }, second)).statusCode, 401);
    assert.equal((await call('PATCH', '/api/me', { nickname: '有效' }, a)).statusCode, 200);
    app.db.prepare('UPDATE sessions SET expires_at=0').run();
    assert.equal((await call('PATCH', '/api/me', { nickname: '过期' }, a)).statusCode, 401);
  });
  it('runs the backup command and restores database, login and uploaded files', async () => {
    const { promisify } = require('node:util'); const { execFile } = require('node:child_process');
    const { mkdirSync, writeFileSync, existsSync } = require('node:fs');
    const item = (await call('POST', '/api/items', post(), a)).json();
    await call('PUT', `/api/favorites/${item.id}`, { active: true }, b);
    writeFileSync(join(dir, 'uploads', 'backup-sentinel.txt'), 'stored-image-copy');
    const root = mkdtempSync(join(tmpdir(), 'campus-backup-')); const target = join(root, 'snapshot');
    let restored;
    try {
      await promisify(execFile)(process.execPath, [join(__dirname, '..', 'server', 'backup.cjs'), target], { env: { ...process.env, DATA_DIR: dir } });
      assert.ok(existsSync(join(target, 'uploads', 'backup-sentinel.txt')));
      restored = await buildServer({ dataDir: target });
      const state = (await restored.inject({ url: '/api/state', headers: { authorization: `Bearer ${b.token}` } })).json();
      assert.deepEqual(state.favorites, [item.id]); assert.equal(state.items[0].name, post().name);
    } finally { await restored?.close(); rmSync(root, { recursive: true, force: true }); }
  });
  it('prevents regular users from managing notices and excludes expired or completed notices', async () => {
    const item = (await call('POST', '/api/items', post(), a)).json();
    const body = { reward: 50, expiresAt: '2099-10-07T00:00:00Z' };
    assert.equal((await call('PUT', `/api/admin/notices/${item.id}`, body, a)).statusCode, 403);
    app.db.prepare("UPDATE users SET role='admin' WHERE id=?").run(a.user.id);
    assert.equal((await call('PUT', `/api/admin/notices/${item.id}`, body, a)).statusCode, 200);
    assert.equal((await call('GET', '/api/state')).json().notices.length, 1);
    await call('PATCH', `/api/items/${item.id}`, { status: 'completed', version: item.version }, a);
    assert.equal((await call('GET', '/api/state')).json().notices.length, 0);
    const reopened = (await call('PATCH', `/api/items/${item.id}`, { status: 'open', version: item.version + 1 }, a)).json();
    app.db.prepare('UPDATE notices SET expires_at=?').run('2000-01-01T00:00:00Z');
    assert.equal((await call('GET', '/api/state')).json().notices.length, 0);
    assert.equal(reopened.status, 'open');
  });
  it('queues urgent requests for own posts and exposes review queue only to administrators', async () => {
    const item = (await call('POST', '/api/items', post(), b)).json();
    assert.equal((await call('POST', `/api/urgent-requests/${item.id}`, { reward: 30 }, a)).statusCode, 403);
    assert.equal((await call('POST', `/api/urgent-requests/${item.id}`, { reward: 30 }, b)).statusCode, 201);
    assert.equal((await call('GET', '/api/state', null, a)).json().urgentRequests.length, 0);
    app.db.prepare("UPDATE users SET role='admin' WHERE id=?").run(a.user.id);
    assert.equal((await call('GET', '/api/state', null, a)).json().urgentRequests[0].id, item.id);
    await call('PUT', `/api/admin/notices/${item.id}`, { reward: 30, expiresAt: '2099-01-01T00:00:00Z' }, a);
    assert.equal((await call('GET', '/api/state', null, a)).json().urgentRequests.length, 0);
  });
  it('limits repeated login attempts and rejects oversized JSON bodies', async () => {
    let response;
    for (let attempt = 0; attempt < 16; attempt++) response = await call('POST', '/api/auth/login', { account: 'missing_account', password: 'wrong' });
    assert.equal(response.statusCode, 429);
    assert.equal((await call('POST', '/api/items', { ...post(), description: 'a'.repeat(40000) }, a)).statusCode, 413);
  });
});
