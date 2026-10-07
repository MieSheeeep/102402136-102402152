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
  it('edits item content while preserving publisher and publication time', async () => {
    const item = (await call('POST', '/api/items', post(), a)).json();
    const edited = await call('PATCH', `/api/items/${item.id}`, { ...post(), name: '蓝色双肩书包', locationDetail: '图书馆二楼', version: item.version }, a);
    assert.equal(edited.statusCode, 200, edited.body);
    const result = edited.json();
    assert.equal(result.name, '蓝色双肩书包'); assert.equal(result.locationDetail, '图书馆二楼');
    assert.equal(result.ownerId, a.user.id); assert.equal(result.createdAt, item.createdAt); assert.equal(result.type, item.type);
    assert.equal((await call('GET', `/api/items/${item.id}`, null, b)).json().name, '蓝色双肩书包');
  });
  it('saves personal contact privately, exposes biography and campus and validates profile lengths', async () => {
    const response = await call('PATCH', '/api/me', { bio: '喜欢校园互助', campus: '旗山校区', contact: '微信private' }, a);
    assert.equal(response.statusCode, 200); assert.equal(response.json().contact, '微信private');
    const profile = (await call('GET', `/api/users/${a.user.id}`, null, b)).json();
    assert.equal(profile.user.bio, '喜欢校园互助'); assert.equal(profile.user.campus, '旗山校区'); assert.equal(profile.user.contact, undefined);
    assert.equal((await call('PATCH', '/api/me', { bio: '字'.repeat(161) }, a)).statusCode, 400);
    assert.equal((await call('PATCH', '/api/me', { campus: {} }, a)).statusCode, 400);
  });
});
