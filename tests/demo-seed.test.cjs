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

});
