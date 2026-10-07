const { describe, it } = require('mocha');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { buildServer } = require('../server/app.cjs');

describe('后端演示数据初始化', function () {
  this.timeout(15000);
  async function sandbox(test) {
    const dir = mkdtempSync(join(tmpdir(), 'campus-demo-')); let app;
    try { app = await buildServer({ dataDir: dir, demoData: true }); await test(app, dir, async () => { await app.close(); app = await buildServer({ dataDir: dir, demoData: true }); return app; }); }
    finally { await app?.close(); rmSync(dir, { recursive: true, force: true }); }
  }
  it('stores sample users, seven posts, three notices and working demo logins', async () => sandbox(async app => {
    const state = (await app.inject('/api/state')).json();
    assert.equal(state.items.length, 7); assert.equal(state.notices.length, 3);
    assert.ok(state.items.some(item => item.type === 'found')); assert.ok(state.items.some(item => item.status === 'completed'));
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { account: 'demo_student', password: 'CampusDemo123!', transport: 'bearer' } });
    assert.equal(login.statusCode, 200, login.body); const { user, token } = login.json();
    const mine = (await app.inject({ url: '/api/state', headers: { authorization: `Bearer ${token}` } })).json();
    assert.equal(mine.items.filter(item => item.ownerId === user.id).length, 3); assert.equal(mine.favorites.length, 2);
    assert.equal(mine.user.campus, '旗山校区'); assert.ok(mine.user.bio); assert.equal(mine.user.contact, '微信：campus_demo');
    assert.match(mine.user.avatar, /^\/uploads\/.*\.webp$/);
    assert.equal((await app.inject(mine.user.avatar)).statusCode, 200);
    const profile = (await app.inject(`/api/users/${user.id}`)).json();
    assert.deepEqual(profile.stats, { published: 3, open: 2, completed: 1 });
    assert.equal(profile.user.contact, undefined);
  }));
  it('preserves edits and does not resurrect deleted records or notices on restart', async () => sandbox(async (app, dir, restart) => {
    const login = (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { account: 'demo_student', password: 'CampusDemo123!', transport: 'bearer' } })).json();
    const headers = { authorization: `Bearer ${login.token}` };
    await app.inject({ method: 'PATCH', url: '/api/me', headers, payload: { nickname: '更新后的同学', bio: '我写的简介', campus: '铜盘校区', contact: '微信changed', avatar: '' } });
    assert.equal((await app.inject({ method: 'DELETE', url: '/api/items/demo-5', headers })).statusCode, 200);
    app = await restart(); const state = (await app.inject('/api/state')).json();
    assert.equal(state.items.length, 6); assert.equal(state.notices.length, 2);
    assert.ok(!state.items.some(item => item.id === 'demo-5'));
    assert.equal(state.items.find(item => item.id === 'demo-3').ownerName, '更新后的同学');
    const mine = (await app.inject({ url: '/api/state', headers })).json();
    assert.equal(mine.user.bio, '我写的简介'); assert.equal(mine.user.campus, '铜盘校区'); assert.equal(mine.user.contact, '微信changed'); assert.equal(mine.user.avatar, '');
  }));
  it('adds samples beside existing real data and never takes over a colliding account', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'campus-demo-existing-')); let app;
    try {
      app = await buildServer({ dataDir: dir });
      const registered = (await app.inject({ method: 'POST', url: '/api/auth/register', payload: { account: 'demo_student', password: 'PrivateExisting123!', nickname: '原有用户', transport: 'bearer' } })).json();
      const original = await app.inject({ method: 'POST', url: '/api/items', headers: { authorization: `Bearer ${registered.token}` }, payload: { type: 'lost', name: '原有物品', category: '生活用品', locationGroups: ['教学楼'], locationDetail: '东二302', occurredAt: '2026-10-07T10:00', contact: '微信private' } });
      assert.equal(original.statusCode, 201);
      await app.close(); app = await buildServer({ dataDir: dir, demoData: true });
      const state = (await app.inject('/api/state')).json(); assert.equal(state.items.length, 8);
      assert.equal(state.items.find(item => item.name === '原有物品').ownerId, registered.user.id);
      assert.equal((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { account: 'demo_student', password: 'CampusDemo123!' } })).statusCode, 401);
      assert.equal((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { account: 'demo_student_2', password: 'CampusDemo123!' } })).statusCode, 200);
    } finally { await app?.close(); rmSync(dir, { recursive: true, force: true }); }
  });
  it('upgrades already seeded databases by filling blanks and preserving custom profile fields', async () => sandbox(async (app, dir, restart) => {
    app.db.prepare('DELETE FROM app_meta WHERE key=?').run('demo-profiles-v1');
    app.db.prepare("UPDATE users SET avatar='',bio='',campus='',contact=''").run();
    app.db.prepare("UPDATE users SET nickname='保留的昵称',bio='保留的简介',campus='铜盘校区',contact='微信private' WHERE account='demo_student'").run();
    app = await restart();
    const login = (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { account: 'demo_student', password: 'CampusDemo123!', transport: 'bearer' } })).json();
    assert.equal(login.user.nickname, '保留的昵称'); assert.equal(login.user.bio, '保留的简介'); assert.equal(login.user.campus, '铜盘校区'); assert.equal(login.user.contact, '微信private');
    assert.match(login.user.avatar, /uploads/); assert.equal((await app.inject('/api/state')).json().items.length, 7);
  }));
});
