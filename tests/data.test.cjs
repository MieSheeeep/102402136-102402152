const { describe, it } = require('mocha');
const assert = require('node:assert/strict');
const D = require('../js/data.js');
const now = '2026-10-06T10:00:00.000Z';
const input = { type: 'lost', name: '黑色雨伞', category: '生活用品', locationGroup: '教学楼', locationDetail: 'A区302', occurredAt: '2026-10-06T09:20', contact: '微信：demo', description: '银色金属环' };
function item(overrides = {}) { return { id: 'one', ownerId: 'me', ...input, status: 'open', createdAt: now, updatedAt: now, ...overrides }; }
function memory(initial = null) { let value = initial; return { getItem: () => value, setItem: (_, v) => { value = v; } }; }
const seed = () => ({ version: 1, items: [item()], favorites: [] });

describe('数据校验、筛选与状态管理', () => {
  it('valid form has no field errors', () => assert.deepEqual(D.validateItem(input), {}));
  it('whitespace-only required fields are rejected', () => {
    const errors = D.validateItem({ ...input, name: '  ', contact: '\n', locationDetail: '' });
    assert.ok(errors.name && errors.contact && errors.locationDetail);
  });
  it('create trims fields and starts open', () => {
    const result = D.createItem({ ...input, name: ' 黑色雨伞 ' }, 'me', now);
    assert.equal(result.name, '黑色雨伞'); assert.equal(result.status, 'open'); assert.equal(result.ownerId, 'me'); assert.equal(result.createdAt, now); assert.ok(result.id);
  });
  it('search trims input and matches case-insensitively by name', () => assert.equal(D.queryItems([item({ name: 'AirPods 耳机' })], { keyword: ' airpods ' }, []).length, 1));
  it('search also matches the description and the detailed place', () => {
    const list = [item(), item({ id: 'two', name: '白色保温杯', description: '杯身贴有一只小猫贴纸', locationDetail: '图书馆三楼自习区' })];
    assert.deepEqual(D.queryItems(list, { keyword: '贴纸' }, []).map(x => x.id), ['two']);
    assert.deepEqual(D.queryItems(list, { keyword: '自习区' }, []).map(x => x.id), ['two']);
    assert.deepEqual(D.queryItems(list, { keyword: '金属环' }, []).map(x => x.id), ['one']);
  });
  it('multiple keywords must all match, ignoring full-width spaces', () => {
    const list = [item(), item({ id: 'two', name: '白色保温杯', description: '杯身贴有小猫贴纸' }), item({ id: 'three', name: '黑色保温杯', description: '杯身贴有小猫贴纸' })];
    assert.deepEqual(D.queryItems(list, { keyword: '保温杯 贴纸' }, []).map(x => x.id), ['two', 'three']);
    assert.deepEqual(D.queryItems(list, { keyword: '保温杯\u3000黑色' }, []).map(x => x.id), ['three']);
    assert.equal(D.queryItems(list, { keyword: '保温杯 雨伞' }, []).length, 0);
  });
  it('a whitespace-only keyword does not filter anything', () => {
    const list = [item(), item({ id: 'two' })];
    assert.equal(D.queryItems(list, { keyword: '   ' }, []).length, 2);
    assert.equal(D.queryItems(list, { keyword: '\u3000' }, []).length, 2);
  });
  it('favorite toggle adds once then removes', () => { const a = D.toggleFavorite([], 'one'); assert.deepEqual(a, ['one']); assert.deepEqual(D.toggleFavorite(a, 'one'), []); });
  it('reopening preserves content and publication time for both types', () => {
    for (const type of ['lost', 'found']) {
      const original = [item({ type, status: 'completed' })];
      const next = D.reopenItem(original, 'one', 'me', '2026-10-07T00:00:00Z');
      assert.equal(next[0].status, 'open');
      assert.equal(D.statusLabel(next[0]), type === 'lost' ? '寻找中' : '待认领');
      assert.equal(next[0].createdAt, now);
      assert.equal(next[0].updatedAt, '2026-10-07T00:00:00.000Z');
      assert.equal(next[0].name, original[0].name);
      assert.equal(original[0].status, 'completed');
      const storage = memory(); const store = D.createStore(storage, seed); store.load();
      store.save({ ...seed(), items: next });
      assert.equal(D.createStore(storage, seed).load().items[0].status, 'open');
    }
  });
  it('multiple locations and categories combine union within groups and intersection across groups', () => {
    const list = [item(), item({ id: 'two', locationGroup: '食堂', category: '电子设备' }), item({ id: 'three', locationGroup: '图书馆' }), item({ id: 'four', locationGroup: '食堂', category: '其他' })];
    assert.deepEqual(D.queryItems(list, { locations: ['教学楼', '食堂'], categories: ['生活用品', '电子设备'] }).map(x => x.id), ['one', 'two']);
    assert.equal(D.queryItems(list, { locations: [], categories: [] }).length, 4);
  });
  it('event date range is inclusive, independent of publication, and excludes unknown dates', () => {
    const list = [item({ id: 'first', occurredAt: '2026-10-01', timePrecision: 'date' }), item({ id: 'last', occurredAt: '2026-10-06T23:59' }), item({ id: 'old', occurredAt: '2026-09-30T12:00' }), item({ id: 'unknown', occurredAt: '', timePrecision: 'unknown' })];
    assert.deepEqual(D.queryItems(list, { timeRange: 'custom', dateStart: '2026-10-01', dateEnd: '2026-10-06' }).map(x => x.id), ['first', 'last']);
    assert.equal(D.queryItems(list, { timeRange: 'all' }).length, 4);
  });

});
