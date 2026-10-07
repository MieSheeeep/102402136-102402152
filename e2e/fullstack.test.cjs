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
  let app, browser, dir, url, ca, cb, a, b, itemId, userId;
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
  after(async () => { await browser?.close(); await app?.close(); if (dir) rmSync(dir, { recursive: true, force: true }); assert.deepEqual(failures, []); });
  it('registers and shows personal account overview', async () => {
    await register(a, 'web_student_a'); await register(b, 'web_student_b');
    await a.locator('.account-overview h1').waitFor(); assert.match(await a.locator('.account-overview').innerText(), /web_student_a/);
    userId = (await (await a.request.get(`${url}/api/auth/me`)).json()).user.id;
  });
  it('keeps bottom navigation fixed across pages, scrolling and viewport changes', async () => {
    const page = await cb.newPage();
    try {
      await page.addInitScript(() => {
        const viewport = new EventTarget();
        Object.defineProperties(viewport, { height: { value: innerHeight, writable: true }, offsetTop: { value: 0, writable: true } });
        Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
      });
      const fixedNav = async () => assert.equal(await page.locator('.mobile-nav').evaluate(nav => {
        const r = nav.getBoundingClientRect();
        return getComputedStyle(nav).display !== 'none' && getComputedStyle(nav).position === 'fixed' && Math.abs(r.bottom - innerHeight) < 1;
      }), true);
      for (const width of [390, 1200]) {
        await page.setViewportSize({ width, height: 844 });
        for (const route of ['home', 'publish', 'my', 'settings', 'login', 'register', 'recover']) {
          await go(page, route); await fixedNav();
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, `${width}px ${route} horizontal overflow`);
          await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
          await fixedNav();
        }
      }
      await page.setViewportSize({ width: 390, height: 844 }); await go(page, 'publish');
      await page.locator('#description').focus();
      await page.evaluate(() => { visualViewport.height = innerHeight - 300; visualViewport.offsetTop = 100; visualViewport.dispatchEvent(new Event('resize')); visualViewport.dispatchEvent(new Event('scroll')); });
      await fixedNav();
      await page.setViewportSize({ width: 390, height: 544 }); await fixedNav();
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
      assert.equal(await page.locator('.submit-button').evaluate(button => button.getBoundingClientRect().bottom < document.querySelector('.mobile-nav').getBoundingClientRect().top), true);
      assert.equal(await page.locator('.mobile-nav [data-nav=publish]').getAttribute('aria-current'), 'page');
    } finally { await page.close(); }
  });
  it('publishes real image and multiple locations; another account can view and save it', async () => {
    await go(a, 'publish'); await a.locator('[name=name]').fill('端到端蓝色书包'); await a.locator('[name=category]').selectOption('生活用品');
    await a.locator('.publish-area-chip:has(input[value="教学楼"])').click(); await a.locator('.publish-area-chip:has(input[value="食堂"])').click();
    await a.locator('[name=locationDetail]').fill('东二302'); await a.locator('[name=occurredAt]').fill('2026-10-07T09:30'); await a.locator('[name=contact]').fill('微信test_student');
    const image = await sharp({ create: { width: 200, height: 150, channels: 3, background: '#467966' } }).png().toBuffer();
    await a.locator('#item-image').setInputFiles({ name: 'bag.png', mimeType: 'image/png', buffer: image });
    assert.equal(await a.locator('.item-image-editor.has-image').count(), 1);
    assert.equal(await a.locator('#item-image-filename').innerText(), 'bag.png');
    await a.locator('#item-image').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('invalid image') });
    assert.equal(await a.locator('#item-image-filename').innerText(), 'bag.png');
    await a.locator('.item-image-zone').evaluate((zone, bytes) => {
      const transfer = new DataTransfer(); transfer.items.add(new File([new Uint8Array(bytes)], 'dropped.png', { type: 'image/png' }));
      zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    }, Array.from(image));
    assert.equal(await a.locator('#item-image-filename').innerText(), 'dropped.png');
    await a.locator('[name=timePrecision]').selectOption('date');
    assert.equal(await a.locator('#item-image-filename').innerText(), 'dropped.png');
    assert.equal(await a.locator('.item-image-editor.has-image').count(), 1);
    await a.locator('[name=timePrecision]').selectOption('datetime');
    await a.locator('[name=occurredAt]').fill('2026-10-07T09:30');
    await a.locator('[data-action=remove-image]').click();
    assert.equal(await a.locator('.item-image-editor.has-image').count(), 0);
    assert.equal(await a.locator('[name=name]').inputValue(), '端到端蓝色书包');
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
    await a.locator('[name=campus]').selectOption('铜盘校区');
    const image = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#bb7788' } }).png().toBuffer();
    await a.locator('#avatar-file').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: image });
    await a.locator('#profile-form [type=submit]').click(); await a.waitForFunction(() => document.querySelector('.header-account-label')?.textContent === '书包同学');
    await go(a, 'settings'); assert.equal(await a.locator('[name=campus]').inputValue(), '铜盘校区');
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
    await a.locator('[data-action=reopen]').click(); await a.locator('[data-action=confirm-reopen]').click(); await a.locator('.completed-card').waitFor({ state: 'hidden' }); await a.locator('[data-action=complete]').waitFor(); await a.locator('#modal').waitFor({ state: 'hidden' });
  });
  it('edits without losing the uploaded picture', async () => {
    await go(a, `edit/${itemId}`); await a.locator('[name=name]').fill('编辑后的书包');
    const patch = a.waitForRequest(r => r.method() === 'PATCH' && r.url().endsWith(`/api/items/${itemId}`));
    await a.locator('#publish-form [type=submit]').click();
    assert.equal((await patch).postDataJSON().name, '编辑后的书包'); await a.waitForURL(/#my/);
    await go(b, `detail/${itemId}`); assert.equal(await b.locator('#detail-heading').innerText(), '编辑后的书包');
    assert.match(await b.locator('.detail-picture img').getAttribute('src'), /uploads/);
  });
  it('deletes with confirmation and removes saved references in another account', async () => {
    await go(a, 'my'); await a.locator('[data-action=delete]').click(); await a.locator('[data-action=confirm-delete]').click(); await a.locator('.item-card').waitFor({ state: 'hidden' });
    await go(b, 'my'); await b.locator('[data-action=my-type][data-value=saved]').click(); assert.equal(await b.locator('.item-card').count(), 0);
  });

});
