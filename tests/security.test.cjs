const { describe, it } = require('mocha');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const D = require('../js/data.js');
const V = require('../js/views.js');
const attack = '<img src=x onerror="alert(1)">';
const item = { id: 'x', ownerId: 'me', type: 'lost', name: attack, category: '生活用品', locationGroup: '教学楼', locationDetail: attack, occurredAt: '2026-10-06T09:20', contact: attack, description: attack, ownerName: attack, createdAt: '2026-10-06T00:00:00Z', updatedAt: '2026-10-06T00:00:00Z', status: 'open' };

describe('视图安全与信息展示', () => {
  it('user text cannot become injected elements in cards or details', () => {
    for (const html of [V.home({ items: [item], favorites: [] }, {}), V.detail(item, [], 'me')]) {
      assert.ok(!html.includes(attack));
      assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'));
    }
  });
  it('quotes in form values cannot break out of input attributes', () => {
    const html = V.form({ ...item, name: '\" autofocus onfocus=\"alert(1)' });
    assert.ok(!html.includes('value="" autofocus'));
    assert.ok(html.includes('value="&quot; autofocus onfocus=&quot;alert(1)"'));
  });
  it('default records can be restored through the same validated store', () => {
    const context = { window: {}, Date };
    vm.runInNewContext(fs.readFileSync(require.resolve('../js/seed.js'), 'utf8'), context);
    const initial = JSON.parse(JSON.stringify(context.window.CampusSeed()));
    const store = D.createStore({ getItem: () => JSON.stringify(initial), setItem: () => {} }, () => initial);
    const result = store.load();
    assert.equal(result.items.length, 7);
    assert.equal(result.items.filter(record => record.ownerId === 'me').length, 3);
    assert.ok(result.items.every(record => record.isDemo && record.contact === '微信：campus_demo'));
  });

  it('every urgent notice links to a complete record, including the third notice', () => {
    const context = { window: {}, Date };
    vm.runInNewContext(fs.readFileSync(require.resolve('../js/seed.js'), 'utf8'), context);
    const state = context.window.CampusSeed();
    const board = V.home(state, {}).split('<section class="square')[0];
    const links = [...board.matchAll(/href="#detail\/([^"]+)"/g)].map(match => match[1]);
    assert.equal(links.length, 3);
    for (const id of links) {
      const post = state.items.find(record => record.id === id);
      assert.ok(post && post.description && post.contact);
      assert.ok(V.detail(post, [], 'me').includes('复制联系方式'));
    }
    assert.equal(state.items.find(post => post.id === links[2]).name, '黑色U盘');
  });

  it('notice upgrade preserves saved data and only adds the missing record once', () => {
    const context = { window: {}, Date };
    vm.runInNewContext(fs.readFileSync(require.resolve('../js/seed.js'), 'utf8'), context);
    const old = { version: 1, items: [item], favorites: ['x'], recentSearches: ['雨伞'] };
    const upgraded = context.window.CampusSeed.upgrade(old);
    assert.equal(old.items.length, 1);
    assert.equal(upgraded.items.length, 2);
    assert.equal(upgraded.items[0], item);
    assert.equal(upgraded.favorites, old.favorites);
    assert.equal(upgraded.recentSearches, old.recentSearches);
    assert.equal(context.window.CampusSeed.upgrade(upgraded), upgraded);
    const deleted = { ...upgraded, items: [item] };
    assert.equal(context.window.CampusSeed.upgrade(deleted).items.length, 1);
  });


  it('urgent notices emphasize time and location without publishing item descriptions', () => {
    const post = { ...item, id: 'demo-1', name: '验收雨伞', description: '私密细节不属于公告', locationDetail: '教学楼302' };
    const html = V.home({ items: [post], favorites: [] }, {});
    const board = html.split('<section class="square')[0];
    assert.ok(board.includes('丢失时间') && board.includes('丢失地点'));
    assert.ok(board.includes('教学楼302') && board.includes('联系我们发布紧急'));
    assert.ok(!board.includes(post.description));
    assert.ok(!V.home({ items: [{ ...post, status: 'completed' }], favorites: [] }, {}).split('<section class="square')[0].includes('验收雨伞'));
  });
  it('settings reflect saved preferences and counts', () => {
    const html = V.settings({ items: [item], favorites: ['x'], recentSearches: ['雨伞'], preferences: { sort: 'oldest', saveSearchHistory: false } });
    assert.ok(html.includes('data-value="oldest" aria-pressed="true"'));
    assert.ok(!html.includes('data-preference="saveSearchHistory" checked'));
    assert.ok(html.includes('1 条'));
    assert.ok(V.urgentContact().includes('校园失物招领运营团队'));
  });


  it('event precision is displayed without invented midnight and publication is shown in my posts', () => {
    const post = { ...item, name: '日期测试物品', timePrecision: 'date', occurredAt: '2026-10-02', createdAt: '2026-10-06T00:00:00Z' };
    const state = { items: [post], favorites: ['x'] };
    const homeCard = V.home(state, {}).split('<div class="card-grid">')[1];
    assert.ok(homeCard.includes('2026/10/02（大致日期）'));
    assert.ok(!homeCard.includes('发布于'));
    assert.ok(V.my(state, 'all', 'me').includes('发布于'));
    assert.ok(V.detail({ ...post, timePrecision: 'unknown', occurredAt: '' }, [], 'me').includes('未记录时间'));
    assert.ok(!V.detail({ ...post, timePrecision: 'unknown', occurredAt: '' }, [], 'me').includes('Invalid Date'));
  });
  it('completed publisher view preserves type filter and ignores it for saved list', () => {
    const state = { items: [item, { ...item, id: 'done', name: '完成测试', status: 'completed' }], favorites: ['x'] };
    const html = V.my(state, 'lost', 'me', 'completed');
    assert.ok(html.includes('完成测试') && !html.includes('href="#detail/x"'));
    assert.ok(V.my(state, 'saved', 'me', 'completed').includes('href="#detail/x"'));
  });
  it('legacy unknown events must supply a date when edited', () => {
    const html = V.form({ ...item, timePrecision: 'unknown', occurredAt: '' });
    assert.ok(!html.includes('value="unknown"'));
    assert.ok(html.includes('type="date"'));
    assert.ok(!html.includes('type="datetime-local"'));
  });


  it('multiple lost areas are labeled uncertain in cards and details', () => {
    const post = { ...item, name: '多区域测试', locationGroups: ['教学楼', '食堂'], locationDetail: '东2教学楼302' };
    for (const html of [V.home({ items: [post], favorites: [] }, {}), V.detail(post, [], 'me')]) {
      assert.ok(html.includes('教学楼') && html.includes('食堂') && html.includes('模糊范围'));
      assert.ok(html.includes('东2教学楼302'));
    }
    assert.ok(V.form(post).includes('name="locationGroups"'));
    assert.ok(V.form(post).includes('最有可能的地点'));
    assert.ok(!V.form({ ...post, type: 'found', locationGroups: ['教学楼'] }).includes('name="locationGroups"'));
  });


  it('product pages omit demonstration and implementation disclaimers', () => {
    const post = { ...item, name: '验收物品', isDemo: true, contact: '示例联系方式：campus_demo（非真实联系账号）' };
    const state = { items: [post], favorites: [] };
    for (const html of [V.home(state, {}), V.detail(post, [], 'me'), V.my(state, 'all', 'me'), V.form(post), V.settings(state), V.urgentContact()]) {
      assert.ok(!/示例|非真实|默认配图|本地用户|尚未配置|仅作演示|不支持跨设备/.test(html));
    }
    assert.ok(V.detail(post, [], 'me').includes('微信：campus_demo'));
  });
});
