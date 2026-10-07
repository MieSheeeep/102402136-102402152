const { describe, it } = require('mocha');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = path.join(__dirname, '../js/data.js');
const D = fs.existsSync(source) ? require(source) : {};
const now = '2026-10-06T10:00:00.000Z';
const input = { type: 'lost', name: '黑色雨伞', category: '生活用品', locationGroup: '教学楼', locationDetail: 'A区302', occurredAt: '2026-10-06T09:20', contact: '微信：demo', description: '银色金属环' };
function item(overrides = {}) { return { id: 'one', ownerId: 'me', ...input, status: 'open', createdAt: now, updatedAt: now, ...overrides }; }
function memory(initial = null) { let value = initial; return { getItem: () => value, setItem: (_, v) => { value = v; }, value: () => value }; }
const seed = () => ({ version: 1, items: [item()], favorites: [] });

describe('数据校验、筛选与状态管理', () => {
  it('valid form has no field errors', () => assert.deepEqual(D.validateItem(input), {}));
  it('whitespace-only required fields are rejected', () => {
    const errors = D.validateItem({ ...input, name: '  ', contact: '\n', locationDetail: '' });
    assert.ok(errors.name && errors.contact && errors.locationDetail);
  });
  it('February 30 is rejected instead of normalized', () => assert.ok(D.validateItem({ ...input, occurredAt: '2026-02-30T10:00' }).occurredAt));
  it('invalid type and missing classification are rejected', () => {
    const e = D.validateItem({ ...input, type: 'other', category: '' });
    assert.ok(e.type && e.category);
  });
  it('excessively long values are rejected', () => assert.ok(D.validateItem({ ...input, name: '物'.repeat(61) }).name));
  it('create trims fields and starts open', () => {
    const result = D.createItem({ ...input, name: ' 黑色雨伞 ' }, 'me', now);
    assert.equal(result.name, '黑色雨伞'); assert.equal(result.status, 'open'); assert.equal(result.ownerId, 'me'); assert.equal(result.createdAt, now); assert.ok(result.id);
  });
  it('two posts have different ids', () => assert.notEqual(D.createItem(input, 'me', now).id, D.createItem(input, 'me', now).id));
  it('invalid create throws and does not publish', () => assert.throws(() => D.createItem({ ...input, name: '' }, 'me', now), /信息/));
  it('search trims input and matches case-insensitively by name', () => assert.equal(D.queryItems([item({ name: 'AirPods 耳机' })], { keyword: ' airpods ' }, []).length, 1));
  it('combined filters use intersection', () => {
    const list = [item(), item({ id: 'two', type: 'found' }), item({ id: 'three', locationGroup: '食堂' })];
    assert.deepEqual(D.queryItems(list, { type: 'lost', locationGroup: '教学楼' }, []).map(x => x.id), ['one']);
  });
  it('favorites filter returns only saved posts', () => assert.deepEqual(D.queryItems([item(), item({ id: 'two' })], { favoritesOnly: true }, ['two']).map(x => x.id), ['two']));
  it('unknown keyword returns empty results', () => assert.deepEqual(D.queryItems([item()], { keyword: '不存在' }, []), []));
  it('sort uses publication time and does not mutate source', () => {
    const list = [item({ id: 'old', createdAt: '2026-10-01T00:00:00Z' }), item({ id: 'new' })];
    assert.deepEqual(D.queryItems(list, {}, []).map(x => x.id), ['new', 'old']);
    assert.deepEqual(D.queryItems(list, { sort: 'oldest' }, []).map(x => x.id), ['old', 'new']);
    assert.equal(list[0].id, 'old');
  });
  it('editing preserves publication time, owner and type', () => {
    const original = [item()];
    const next = D.updateItem(original, 'one', { ...input, name: '蓝色雨伞', ownerId: 'intruder' }, 'me', '2026-10-07T00:00:00Z');
    assert.equal(next[0].name, '蓝色雨伞'); assert.equal(next[0].createdAt, now); assert.equal(next[0].ownerId, 'me'); assert.equal(original[0].name, '黑色雨伞');
  });
  it('editing cannot switch publication type', () => assert.throws(() => D.updateItem([item()], 'one', { ...input, type: 'found' }, 'me', now), /类型/));
  it('another user cannot edit', () => assert.throws(() => D.updateItem([item()], 'one', input, 'other', now), /本人/));
  it('another user cannot complete', () => assert.throws(() => D.completeItem([item()], 'one', 'other', now), /本人/));
  it('completing works for both publication types', () => {
    for (const type of ['lost', 'found']) assert.equal(D.completeItem([item({ type })], 'one', 'me', now)[0].status, 'completed');
  });
  it('status labels distinguish returned from found', () => {
    assert.equal(D.statusLabel(item({ status: 'completed' })), '已找到');
    assert.equal(D.statusLabel(item({ type: 'found', status: 'completed' })), '已归还');
    assert.equal(D.statusLabel(item({ type: 'found' })), '待认领');
  });
  it('another user cannot delete', () => assert.throws(() => D.deleteItem([item()], 'one', 'other'), /本人/));
  it('owner can delete without mutating input', () => { const list = [item()]; assert.deepEqual(D.deleteItem(list, 'one', 'me'), []); assert.equal(list.length, 1); });
  it('missing post produces understandable error', () => assert.throws(() => D.completeItem([], 'one', 'me', now), /不存在/));
  it('favorite toggle adds once then removes', () => { const a = D.toggleFavorite([], 'one'); assert.deepEqual(a, ['one']); assert.deepEqual(D.toggleFavorite(a, 'one'), []); });
  it('store restores records and favorites after reload', () => {
    const storage = memory(); const store = D.createStore(storage, seed); const state = store.load();
    state.favorites = ['one']; store.save(state);
    assert.deepEqual(D.createStore(storage, seed).load(), state);
  });
  it('corrupt saved data is reported and cannot be silently overwritten', () => {
    const storage = memory('{broken'); const store = D.createStore(storage, seed);
    assert.throws(() => store.load(), /读取/); assert.throws(() => store.save(seed()), /恢复/); assert.equal(storage.value(), '{broken');
    store.reset(); assert.deepEqual(store.load(), seed());
  });
  it('invalid stored records and unsupported version are rejected', () => {
    for (const state of [{ ...seed(), version: 9 }, { ...seed(), items: [{ id: 'bad' }] }]) assert.throws(() => D.createStore(memory(JSON.stringify(state)), seed).load(), /读取/);
  });
  it('quota errors propagate without overwriting existing data', () => {
    const storage = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    const store = D.createStore(storage, seed); store.load(); assert.throws(() => store.save(seed()), /保存/);
  });

  it('recent search is trimmed and repeated keywords move to the front', () => {
    assert.deepEqual(D.rememberSearch(['校园卡', '雨伞'], ' 雨伞 '), ['雨伞', '校园卡']);
    assert.deepEqual(D.rememberSearch(['AirPods', '校园卡'], 'airpods'), ['airpods', '校园卡']);
  });
  it('empty search is not recorded and history is limited to eight entries', () => {
    assert.deepEqual(D.rememberSearch(['校园卡'], '  '), ['校园卡']);
    assert.equal(D.rememberSearch(['1','2','3','4','5','6','7','8'], '9').length, 8);
    assert.equal(D.rememberSearch(['1','2','3','4','5','6','7','8'], '9').at(-1), '7');
  });
  it('recent searches survive reload without changing existing posts', () => {
    const storage = memory(); const store = D.createStore(storage, seed); const state = store.load();
    store.save({ ...state, recentSearches: ['校园卡', '雨伞'] });
    const loaded = D.createStore(storage, seed).load();
    assert.deepEqual(loaded.recentSearches, ['校园卡', '雨伞']);
    assert.deepEqual(loaded.items, state.items);
  });


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
  it('reopening requires the publisher and an existing post', () => {
    assert.throws(() => D.reopenItem([item({ status: 'completed' })], 'one', 'other', now), /本人/);
    assert.throws(() => D.reopenItem([], 'one', 'me', now), /不存在/);
  });


  it('browsing preferences persist and old states remain valid', () => {
    const storage = memory(); const store = D.createStore(storage, seed); const old = store.load();
    assert.equal(old.preferences, undefined);
    const next = { ...old, preferences: { sort: 'oldest', saveSearchHistory: false } };
    store.save(next); assert.deepEqual(D.createStore(storage, seed).load().preferences, next.preferences);
    assert.deepEqual(D.createStore(storage, seed).load().items, old.items);
  });
  it('invalid browsing preferences cannot be saved', () => {
    const store = D.createStore(memory(), seed); store.load();
    for (const preferences of [null, { sort: 'invalid', saveSearchHistory: true }, { sort: 'newest', saveSearchHistory: 'yes' }]) {
      assert.throws(() => store.save({ ...seed(), preferences }), /格式/);
    }
  });


  it('multiple locations and categories combine union within groups and intersection across groups', () => {
    const list = [item(), item({ id: 'two', locationGroup: '食堂', category: '电子设备' }), item({ id: 'three', locationGroup: '图书馆' }), item({ id: 'four', locationGroup: '食堂', category: '其他' })];
    assert.deepEqual(D.queryItems(list, { locations: ['教学楼', '食堂'], categories: ['生活用品', '电子设备'] }).map(x => x.id), ['one', 'two']);
    assert.equal(D.queryItems(list, { locations: [], categories: [] }).length, 4);
  });
  it('date-only and explicitly unknown event times are valid and persist without invented hours', () => {
    for (const [timePrecision, occurredAt] of [['date', '2026-10-06'], ['unknown', '']]) {
      const record = D.createItem({ ...input, timePrecision, occurredAt }, 'me', now);
      assert.equal(record.occurredAt, occurredAt); assert.equal(record.timePrecision, timePrecision);
      const storage = memory(); const store = D.createStore(storage, seed); store.load();
      store.save({ ...seed(), items: [record] }); assert.deepEqual(D.createStore(storage, seed).load().items[0], record);
    }
    assert.ok(D.validateItem({ ...input, timePrecision: 'date', occurredAt: '2026-02-30' }).occurredAt);
    assert.ok(D.validateItem({ ...input, occurredAt: '' }).occurredAt);
  });
  it('event date range is inclusive, independent of publication, and excludes unknown dates', () => {
    const list = [item({ id: 'first', occurredAt: '2026-10-01', timePrecision: 'date' }), item({ id: 'last', occurredAt: '2026-10-06T23:59' }), item({ id: 'old', occurredAt: '2026-09-30T12:00' }), item({ id: 'unknown', occurredAt: '', timePrecision: 'unknown' })];
    assert.deepEqual(D.queryItems(list, { timeRange: 'custom', dateStart: '2026-10-01', dateEnd: '2026-10-06' }).map(x => x.id), ['first', 'last']);
    assert.equal(D.queryItems(list, { timeRange: 'all' }).length, 4);
  });
  it('relative date range uses local calendar dates and includes today', () => {
    const reference = new Date(2026, 9, 6, 12);
    const list = ['03', '04', '05', '06', '07'].map(day => item({ id: day, occurredAt: `2026-10-${day}`, timePrecision: 'date' }));
    assert.deepEqual(D.queryItems(list, { timeRange: '3days' }, [], reference).map(x => x.id), ['04', '05', '06']);
    assert.deepEqual(D.queryItems(list, { timeRange: 'today' }, [], reference).map(x => x.id), ['06']);
  });
  it('custom range rejects missing, impossible, or reversed dates', () => {
    assert.equal(D.validateFilters({ timeRange: 'custom', dateStart: '2026-10-01', dateEnd: '2026-10-06' }), '');
    for (const dates of [{}, { dateStart: '2026-02-30', dateEnd: '2026-10-06' }, { dateStart: '2026-10-07', dateEnd: '2026-10-06' }]) assert.ok(D.validateFilters({ timeRange: 'custom', ...dates }));
  });
  it('completed filter combines with publisher and type', () => {
    const list = [item(), item({ id: 'done', status: 'completed' }), item({ id: 'found', type: 'found', status: 'completed' }), item({ id: 'other', ownerId: 'other', status: 'completed' })];
    assert.deepEqual(D.queryItems(list, { ownerId: 'me', type: 'lost', status: 'completed' }).map(x => x.id), ['done']);
  });


  it('lost posts persist multiple possible areas and match each selected area', () => {
    const record = D.createItem({ ...input, locationGroups: ['教学楼', '食堂', '教学楼'] }, 'me', now);
    assert.deepEqual(record.locationGroups, ['教学楼', '食堂']);
    assert.equal(D.queryItems([record], { locations: ['食堂'] }).length, 1);
    assert.equal(D.queryItems([record], { locations: ['图书馆'] }).length, 0);
    const storage = memory(); const store = D.createStore(storage, seed); store.load();
    store.save({ ...seed(), items: [record] }); assert.deepEqual(D.createStore(storage, seed).load().items[0].locationGroups, record.locationGroups);
  });
  it('area validation rejects empty, unknown areas and multiple found areas', () => {
    for (const locationGroups of [[], ['无效区域']]) assert.ok(D.validateItem({ ...input, locationGroups }).locationGroup);
    assert.ok(D.validateItem({ ...input, type: 'found', locationGroups: ['教学楼', '食堂'] }).locationGroup);
  });
  it('editing possible areas preserves publication time and legacy scalar areas remain searchable', () => {
    const next = D.updateItem([item()], 'one', { ...input, locationGroups: ['食堂', '图书馆'] }, 'me', now);
    assert.deepEqual(next[0].locationGroups, ['食堂', '图书馆']); assert.equal(next[0].createdAt, now);
    assert.equal(D.queryItems([item()], { locations: ['教学楼'] }).length, 1);
  });


  it('stale tabs cannot overwrite records saved by another tab', () => {
    const storage = memory(); const first = D.createStore(storage, seed); const second = D.createStore(storage, seed);
    const a = first.load(); first.save(a); const b = second.load();
    first.save({ ...a, favorites: ['one'] });
    assert.throws(() => second.save({ ...b, recentSearches: ['stale'] }), /另一.*页面|其他.*页面/);
    assert.deepEqual(D.createStore(storage, seed).load().favorites, ['one']);
    const refreshed = second.load(); second.save({ ...refreshed, recentSearches: ['fresh'] });
    assert.deepEqual(D.createStore(storage, seed).load().recentSearches, ['fresh']);
  });
});
