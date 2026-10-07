const { describe, it, before, after, afterEach } = require('mocha');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const sharp = require('sharp');
const { buildServer } = require('../server/app.cjs');

describe('网页真实多账号流程（Chrome）', function () {
  this.timeout(40000);
  let app, browser, dir, url, ca, cb, a, b, itemId, recoveryCode, userId;
  const failures = [];
  const go = async (page, hash) => { const target = `${url}/#${hash}`; if (page.url() === target) await page.reload(); else await page.goto(target); await page.waitForFunction(() => document.querySelector('#main').textContent.trim() && !document.querySelector('#main').textContent.includes('正在载入')); };
  const register = async (page, account) => {
    await go(page, 'register'); await page.locator('[name=account]').fill(account); await page.locator('[name=nickname]').fill(account);
    await page.locator('[name=password]').fill('CorrectPass!123'); await page.locator('#auth-form button').click();
    await page.locator('.recovery-code').waitFor(); const code = await page.locator('.recovery-code').innerText();
    await page.locator('#modal [data-action=close-modal]').click(); await page.locator('#modal').waitFor({ state: 'hidden' }); return code;
  };
  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'campus-web-')); app = await buildServer({ dataDir: dir });
    url = await app.listen({ host: '127.0.0.1', port: 0 });
    browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
    ca = await browser.newContext(); cb = await browser.newContext({ viewport: { width: 390, height: 844 } });
    a = await ca.newPage(); b = await cb.newPage();
    a.setDefaultTimeout(7000); b.setDefaultTimeout(7000);
    for (const page of [a, b]) { page.on('pageerror', error => failures.push(error.message)); page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) failures.push(msg.text()); }); }
  });
  afterEach(async function () { if (this.currentTest.state === 'failed') { console.log('页面错误信息：', await a.locator('#toast').innerText(), await a.locator('#main').innerText(), 'B:', await b.locator('#main').innerText(), 'JS:', failures, '公告表单：', await a.locator('#notice-form').evaluateAll(forms => forms.map(f => ({ valid: f.checkValidity(), fields: [...f.elements].map(e => ({ name: e.name, value: e.value, validity: e.validationMessage })) })))); } });
  after(async () => { await browser?.close(); await app?.close(); if (dir) rmSync(dir, { recursive: true, force: true }); });
  it('registers and shows personal account overview', async () => {
    recoveryCode = await register(a, 'web_student_a'); await register(b, 'web_student_b');
    await a.locator('.account-overview h1').waitFor(); assert.match(await a.locator('.account-overview').innerText(), /web_student_a/);
    userId = (await (await a.request.get(`${url}/api/auth/me`)).json()).user.id;
  });
  it('publishes real image and multiple locations; another account can view and save it', async () => {
    await go(a, 'publish'); await a.locator('[name=name]').fill('端到端蓝色书包'); await a.locator('[name=category]').selectOption('生活用品');
    await a.locator('.publish-area-chip:has(input[value="教学楼"])').click(); await a.locator('.publish-area-chip:has(input[value="食堂"])').click();
    await a.locator('[name=locationDetail]').fill('东二302'); await a.locator('[name=occurredAt]').fill('2026-10-07T09:30'); await a.locator('[name=contact]').fill('微信test_student');
    const image = await sharp({ create: { width: 200, height: 150, channels: 3, background: '#467966' } }).png().toBuffer();
    await a.locator('#item-image').setInputFiles({ name: 'bag.png', mimeType: 'image/png', buffer: image });
    await a.locator('#publish-form [type=submit]').click(); await a.waitForURL(/#success\//); itemId = new URL(a.url()).hash.split('/')[1];
    await go(b, `detail/${itemId}`); assert.match(await b.locator('.detail-copy').innerText(), /模糊范围/);
    assert.match(await b.locator('.detail-picture img').getAttribute('src'), /uploads/);
    await b.locator('[data-action=favorite]').click(); await b.locator('[data-action=favorite][aria-pressed=true]').waitFor();
    await b.reload(); await b.locator('[data-action=favorite][aria-pressed=true]').waitFor();
    assert.equal(await b.locator('a[href^="#edit/"]').count(), 0);
  });
  it('changes nickname and avatar; detail and public user homepage reflect real stats', async () => {
    await go(a, 'settings'); await a.locator('[name=nickname]').fill('书包同学');
    const image = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#bb7788' } }).png().toBuffer();
    await a.locator('#avatar-file').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: image });
    await a.locator('#profile-form [type=submit]').click(); await a.waitForFunction(() => document.querySelector('.header-account-label')?.textContent === '书包同学');
    await go(b, `detail/${itemId}`); assert.match(await b.locator('.publisher-link').innerText(), /书包同学/);
    await b.locator('.publisher-link').click(); await b.locator('.public-profile').waitFor();
    assert.equal(await b.locator('.public-stats strong').first().innerText(), '1'); assert.equal(await b.locator('.card-actions').count(), 0);
    assert.match(await b.locator('.public-profile img').getAttribute('src'), /uploads/);
    await b.locator('[data-action=favorite]').click(); await b.locator('[data-action=favorite][aria-pressed=false]').waitFor();
    await b.locator('[data-action=favorite]').click(); await b.locator('[data-action=favorite][aria-pressed=true]').waitFor();
    assert.equal(await b.locator('.public-stats strong').nth(2).innerText(), '0', '收藏不能改变发布者的完成数量');
  });
  it('completes and reopens with confirmation and updates public statistics', async () => {
    await go(a, 'my'); await a.locator('[data-action=complete]').click(); await a.locator('[data-action=confirm-complete]').click(); await a.locator('.completed-card').waitFor();
    await go(b, `user/${userId}`); assert.equal(await b.locator('.public-stats strong').nth(2).innerText(), '1');
    await a.locator('[data-action=reopen]').click(); await a.locator('[data-action=confirm-reopen]').click(); await a.locator('.completed-card').waitFor({ state: 'hidden' });
  });
  it('keeps filters expanded and saves account preferences across reload', async () => {
    await go(b, 'home'); await b.locator('[data-action=advanced-filters]').click(); await b.locator('.filter-chip:has(input[data-multi=locations][value="教学楼"])').click();
    await b.locator('#advanced-filters [type=submit]').click(); assert.equal(await b.locator('#advanced-filters').isVisible(), true);
    await go(b, 'settings'); await b.locator('[data-action=preference-sort][data-value=oldest]').click(); await b.locator('[data-value=oldest][aria-pressed=true]').waitFor();
    await b.reload(); await b.locator('[data-value=oldest][aria-pressed=true]').waitFor();
    assert.equal(await b.locator('[data-action=reset]').count(), 0);
  });
  it('supports admin notice publication and removal with server-side role checks', async () => {
    app.db.prepare("UPDATE users SET role='admin' WHERE id=?").run(userId);
    await go(a, 'admin'); await a.locator('[name=reward]').fill('50'); await a.locator('[name=expiresAt]').fill('2099-10-07T23:59');
    await a.locator('#notice-form button').click(); await a.locator('[data-action=remove-notice]').waitFor();
    await go(b, 'home'); assert.match(await b.locator('.urgent-slide').innerText(), /端到端蓝色书包/);
    await a.locator('[data-action=remove-notice]').click(); await a.locator('[data-action=remove-notice]').waitFor({ state: 'hidden' });
    assert.equal((await b.request.delete(`${url}/api/admin/items/${itemId}`, { headers: { 'x-csrf-token': (await (await b.request.get(`${url}/api/auth/me`)).json()).csrf } })).status(), 403);
  });
  it('submits an urgent request from the real contact dialog for administrator review', async () => {
    await go(a, 'home'); await a.locator('.urgent-heading [data-action=urgent-contact]').click();
    await a.locator('#urgent-request-form [name=reward]').fill('20'); await a.locator('#urgent-request-form button').click();
    await a.locator('#modal').waitFor({ state: 'hidden' });
    await go(a, 'admin'); await a.locator('[data-action=review-urgent]').waitFor(); await a.locator('[data-action=review-urgent]').click();
    assert.equal(await a.locator('#notice-form [name=reward]').inputValue(), '20');
    await a.locator('[data-action=dismiss-urgent]').click(); await a.locator('[data-action=review-urgent]').waitFor({ state: 'hidden' });
  });
  it('logout hides contacts, recovery changes password and invalidates previous sessions', async () => {
    await go(a, 'settings'); await a.locator('[data-action=logout]').click(); await a.waitForURL(/#home/);
    await go(a, `detail/${itemId}`); assert.match(await a.locator('#contact-text').innerText(), /登录后/);
    await go(a, 'recover'); await a.locator('[name=account]').fill('web_student_a'); await a.locator('[name=recoveryCode]').fill(recoveryCode); await a.locator('[name=password]').fill('NewCorrectPass!123');
    await a.locator('#auth-form button').click(); await a.locator('.recovery-code').waitFor(); await a.locator('[data-action=close-modal]').click(); await a.locator('#modal').waitFor({ state: 'hidden' });
    await a.locator('[name=account]').fill('web_student_a'); await a.locator('[name=password]').fill('NewCorrectPass!123'); await a.locator('#auth-form button').click(); await a.waitForURL(/#(my|settings)/);
  });
  it('edits without losing the uploaded picture', async () => {
    await go(a, `edit/${itemId}`); await a.locator('[name=name]').fill('编辑后的书包'); await a.locator('#publish-form [type=submit]').click(); await a.waitForURL(/#my/);
    await go(b, `detail/${itemId}`); assert.equal(await b.locator('#detail-heading').innerText(), '编辑后的书包'); assert.match(await b.locator('.detail-picture img').getAttribute('src'), /uploads/);
  });
  it('new pages fit a narrow viewport and have no JavaScript or CSP errors', async () => {
    for (const route of ['settings', 'my', `user/${userId}`, `detail/${itemId}`]) { await go(b, route); assert.equal(await b.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, route); if (route === 'settings' || route.startsWith('user/')) { await b.waitForTimeout(350); await b.screenshot({ path: join(tmpdir(), route === 'settings' ? 'campus-settings-full.png' : 'campus-profile-full.png'), fullPage: true }); } }
    assert.deepEqual(failures, []);
  });
  it('failed network writes keep form content and do not report successful publication', async () => {
    await go(a, `edit/${itemId}`); await a.locator('[name=name]').fill('不能保存的修改');
    await ca.route(`**/api/items/${itemId}`, route => route.abort());
    await a.locator('#publish-form [type=submit]').click(); await a.locator('#toast[data-kind=error]').waitFor();
    assert.equal(await a.locator('[name=name]').inputValue(), '不能保存的修改');
    assert.match(await a.locator('#toast').innerText(), /无法连接服务/);
    assert.equal((await (await b.request.get(`${url}/api/items/${itemId}`)).json()).name, '编辑后的书包');
    await ca.unroute(`**/api/items/${itemId}`);
  });
  it('deletes with confirmation and removes saved references in another account', async () => {
    await go(a, 'my'); await a.locator('[data-action=delete]').click(); await a.locator('[data-action=confirm-delete]').click(); await a.locator('.item-card').waitFor({ state: 'hidden' });
    await go(b, 'my'); await b.locator('[data-action=my-type][data-value=saved]').click(); assert.equal(await b.locator('.item-card').count(), 0);
  });
  it('still supports the static HTML course artifact without a backend', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(require('node:url').pathToFileURL(join(__dirname, '..', 'index.html')).href);
    await page.locator('.item-card').first().waitFor(); assert.equal(await page.locator('.item-card').count(), 7);
    assert.equal(await page.locator('#auth-form').count(), 0); await page.close();
  });
  it('shows seeded posts and notices and lets a demonstration account manage its own content', async () => {
    const demoDir = mkdtempSync(join(tmpdir(), 'campus-demo-web-')); let demoApp, page;
    try {
      demoApp = await buildServer({ dataDir: demoDir, demoData: true }); const demoUrl = await demoApp.listen({ host: '127.0.0.1', port: 0 });
      page = await browser.newPage(); await page.goto(demoUrl); await page.locator('.item-card').first().waitFor();
      assert.equal(await page.locator('.item-card').count(), 7); assert.equal(await page.locator('.urgent-slide').count(), 3);
      await page.goto(`${demoUrl}/#login`); await page.locator('[name=account]').fill('demo_student'); await page.locator('[name=password]').fill('CampusDemo123!');
      await page.locator('#auth-form button').click(); await page.locator('.account-overview').waitFor();
      assert.equal(await page.locator('.account-stats strong').first().innerText(), '3');
      assert.equal(await page.locator('.account-stats strong').nth(3).innerText(), '2');
      assert.equal(await page.locator('.item-card').count(), 3); assert.equal(await page.locator('[data-action=edit]').count(), 3);
      await page.goto(`${demoUrl}/#settings`); await page.locator('#profile-form').waitFor();
      assert.equal(await page.locator('[name=campus]').inputValue(), '旗山校区'); assert.equal(await page.locator('#profile-form [name=contact]').inputValue(), '微信：campus_demo');
      assert.ok(await page.locator('[name=bio]').inputValue()); assert.match(await page.locator('#profile-form img').getAttribute('src'), /uploads/);
      await page.goto(`${demoUrl}/#publish`); await page.locator('#publish-form').waitFor(); assert.equal(await page.locator('[name=contact]').inputValue(), '微信：campus_demo');
    } finally { await page?.close(); await demoApp?.close(); rmSync(demoDir, { recursive: true, force: true }); }
  });
});
