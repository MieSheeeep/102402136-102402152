const { describe, it } = require('mocha');
const assert = require('node:assert/strict');
const D = require('../js/data.js');
const now = '2026-10-06T10:00:00.000Z';
const input = { type: 'lost', name: '黑色雨伞', category: '生活用品', locationGroup: '教学楼', locationDetail: 'A区302', occurredAt: '2026-10-06T09:20', contact: '微信：demo', description: '银色金属环' };
function item(overrides = {}) { return { id: 'one', ownerId: 'me', ...input, status: 'open', createdAt: now, updatedAt: now, ...overrides }; }
function memory(initial = null) { let value = initial; return { getItem: () => value, setItem: (_, v) => { value = v; } }; }
const seed = () => ({ version: 1, items: [item()], favorites: [] });

describe('数据校验、筛选与状态管理', () => {
  it('form validation and creation handle valid and blank input', () => {
    // valid form has no field errors
    { assert.deepEqual(D.validateItem(input), {}); }
    // whitespace-only required fields are rejected
    {
      const errors = D.validateItem({ ...input, name: '  ', contact: '\n', locationDetail: '' });
      assert.ok(errors.name && errors.contact && errors.locationDetail);
    }
    // create trims fields and starts open
    {
      const result = D.createItem({ ...input, name: ' 黑色雨伞 ' }, 'me', now);
      assert.equal(result.name, '黑色雨伞'); assert.equal(result.status, 'open'); assert.equal(result.ownerId, 'me'); assert.equal(result.createdAt, now); assert.ok(result.id);
    }
  });

  it('search matches name, description and place with consistent keyword rules', () => {
    // search trims input and matches case-insensitively by name
    { assert.equal(D.queryItems([item({ name: 'AirPods 耳机' })], { keyword: ' airpods ' }, []).length, 1); }
    // search also matches the description and the detailed place
    {
      const list = [item(), item({ id: 'two', name: '白色保温杯', description: '杯身贴有一只小猫贴纸', locationDetail: '图书馆三楼自习区' })];
      assert.deepEqual(D.queryItems(list, { keyword: '贴纸' }, []).map(x => x.id), ['two']);
      assert.deepEqual(D.queryItems(list, { keyword: '自习区' }, []).map(x => x.id), ['two']);
      assert.deepEqual(D.queryItems(list, { keyword: '金属环' }, []).map(x => x.id), ['one']);
    }
    // multiple keywords must all match, ignoring full-width spaces
    {
      const list = [item(), item({ id: 'two', name: '白色保温杯', description: '杯身贴有小猫贴纸' }), item({ id: 'three', name: '黑色保温杯', description: '杯身贴有小猫贴纸' })];
      assert.deepEqual(D.queryItems(list, { keyword: '保温杯 贴纸' }, []).map(x => x.id), ['two', 'three']);
      assert.deepEqual(D.queryItems(list, { keyword: '保温杯\u3000黑色' }, []).map(x => x.id), ['three']);
      assert.equal(D.queryItems(list, { keyword: '保温杯 雨伞' }, []).length, 0);
    }
    // a whitespace-only keyword does not filter anything
    {
      const list = [item(), item({ id: 'two' })];
      assert.equal(D.queryItems(list, { keyword: '   ' }, []).length, 2);
      assert.equal(D.queryItems(list, { keyword: '\u3000' }, []).length, 2);
    }
  });

  it('images validate sources and size, persist locally and read legacy records', () => {
    // accepts the three supported image sources and rejects everything else
    {
      const uuid = 'a'.repeat(8) + '-' + 'b'.repeat(4) + '-' + 'c'.repeat(4) + '-' + 'd'.repeat(4) + '-' + 'e'.repeat(12);
      for (const good of ['assets/default-item.svg', `/uploads/${uuid}.webp`,
                          'data:image/webp;base64,UklGRg==', 'data:image/jpeg;base64,/9j/4A==', 'data:image/png;base64,iVBORw0KGgo=']) {
        assert.equal(D.validImage(good), true, `应接受 ${good.slice(0, 30)}`);
      }
      for (const bad of ['', '   ', null, undefined, 123, {}, 'assets/other.png',
                         'http://example.com/x.webp', '/uploads/not-a-uuid.webp',
                         'data:image/svg+xml;base64,PHN2Zz4=',   // SVG 可内嵌脚本，刻意不放行
                         'data:text/html;base64,PHNjcmlwdD4=',
                         'data:image/webp;base64,!!!',             // 非 base64 字符
                         'javascript:alert(1)']) {
        assert.equal(D.validImage(bad), false, `应拒绝 ${String(bad).slice(0, 30)}`);
      }
    }
    // rejects an image longer than the storage limit
    {
      const huge = 'data:image/webp;base64,' + 'A'.repeat(D.imageLimit);
      assert.ok(huge.length > D.imageLimit);
      assert.equal(D.validImage(huge), false);
      assert.equal(D.validateItem({ ...input, image: huge }).image, '图片过大，请换一张更小的图片');
    }
    // createItem keeps a valid local image and uses the default when none is given
    {
      const local = 'data:image/webp;base64,UklGRg==';
      assert.equal(D.createItem({ ...input, image: local }, 'me', now).image, local);
      assert.equal(D.createItem({ ...input, image: '' }, 'me', now).image, 'assets/default-item.svg');
      assert.equal(D.createItem(input, 'me', now).image, 'assets/default-item.svg');
      // 非法图片应当在校验阶段就被拦下，而不是静默回退成默认图
      assert.throws(() => D.createItem({ ...input, image: 'data:image/svg+xml;base64,PHN2Zz4=' }, 'me', now), /信息填写不完整/);
    }
    // a stored state without an image field is still readable (历史数据兼容)
    {
      // 老版本写入的数据可能没有 image 字段，不能因为加了图片校验就把人锁在门外
      const legacy = memory(JSON.stringify({ ...seed(), items: [{ ...item(), image: undefined }] }));
      assert.equal(D.createStore(legacy, seed).load().items.length, 1);
    }
    // a stored state whose item carries an unsupported image is rejected
    {
      const good = { ...seed(), items: [item({ image: 'data:image/webp;base64,UklGRg==' })] };
      const storage = memory(JSON.stringify(good));
      assert.equal(D.createStore(storage, seed).load().items[0].image, 'data:image/webp;base64,UklGRg==');
      const bad = memory(JSON.stringify({ ...seed(), items: [item({ image: 'data:image/svg+xml;base64,PHN2Zz4=' })] }));
      assert.throws(() => D.createStore(bad, seed).load(), /无法读取浏览器保存的数据/);
    }
  });

  it('favorite toggle adds once then removes', () => {
    // favorite toggle adds once then removes
    { const a = D.toggleFavorite([], 'one'); assert.deepEqual(a, ['one']); assert.deepEqual(D.toggleFavorite(a, 'one'), []); }
  });

  it('reopening preserves content and publication time for both types', () => {
    // reopening preserves content and publication time for both types
    {
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
    }
  });

  it('multiple locations and categories combine union within groups and intersection across groups', () => {
    // multiple locations and categories combine union within groups and intersection across groups
    {
      const list = [item(), item({ id: 'two', locationGroup: '食堂', category: '电子设备' }), item({ id: 'three', locationGroup: '图书馆' }), item({ id: 'four', locationGroup: '食堂', category: '其他' })];
      assert.deepEqual(D.queryItems(list, { locations: ['教学楼', '食堂'], categories: ['生活用品', '电子设备'] }).map(x => x.id), ['one', 'two']);
      assert.equal(D.queryItems(list, { locations: [], categories: [] }).length, 4);
    }
  });

  it('pagination returns correct pages and handles invalid limits and empty data', () => {
    // paginate returns one page plus the counters used by the UI
    {
      const list = Array.from({ length: 30 }, (_, i) => i);
      assert.deepEqual(D.paginate(list, 12), { shown: list.slice(0, 12), total: 30, shownCount: 12, remaining: 18 });
      assert.deepEqual(D.paginate(list, 24).remaining, 6);
      assert.deepEqual(D.paginate(list, 30).remaining, 0);
    }
    // paginate falls back to the whole list when the limit is missing or invalid
    {
      const list = [1, 2, 3];
      for (const bad of [undefined, null, 0, -5, NaN, Infinity, 'abc']) {
        const page = D.paginate(list, bad);
        assert.equal(page.shownCount, 3, `limit=${String(bad)} 应展示全部`);
        assert.equal(page.remaining, 0);
      }
    }
    // paginate handles an empty list and floors a fractional limit
    {
      assert.deepEqual(D.paginate([], 12), { shown: [], total: 0, shownCount: 0, remaining: 0 });
      assert.equal(D.paginate([1, 2, 3, 4, 5], 2.9).shownCount, 2);
    }
  });

  it('event date range is inclusive, independent of publication, and excludes unknown dates', () => {
    // event date range is inclusive, independent of publication, and excludes unknown dates
    {
      const list = [item({ id: 'first', occurredAt: '2026-10-01', timePrecision: 'date' }), item({ id: 'last', occurredAt: '2026-10-06T23:59' }), item({ id: 'old', occurredAt: '2026-09-30T12:00' }), item({ id: 'unknown', occurredAt: '', timePrecision: 'unknown' })];
      assert.deepEqual(D.queryItems(list, { timeRange: 'custom', dateStart: '2026-10-01', dateEnd: '2026-10-06' }).map(x => x.id), ['first', 'last']);
      assert.equal(D.queryItems(list, { timeRange: 'all' }).length, 4);
    }
  });
});
