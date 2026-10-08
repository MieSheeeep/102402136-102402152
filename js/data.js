(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CampusData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const campuses = Object.freeze(['旗山校区', '铜盘校区', '怡山校区', '晋江校区', '泉港校区', '厦门集美校区', '厦门鼓浪屿校区']);
  const categories = ['校园卡 / 证件', '电子设备', '生活用品', '书籍文具', '衣物配饰', '其他'];
  const locations = ['教学楼', '食堂', '图书馆', '宿舍区', '运动场', '其他'];
  const key = 'campus-lost-found-v1';
  const limits = { name: 60, locationDetail: 100, contact: 120, description: 1000 };
  const text = value => typeof value === 'string' ? value.trim() : '';

  function validTime(value) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value || '')) return false;
    const [y, mo, d, h, mi] = value.match(/\d+/g).map(Number);
    const date = new Date(y, mo - 1, d, h, mi);
    return y >= 2000 && y <= 2100 && date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d && date.getHours() === h && date.getMinutes() === mi;
  }

  function validDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && validTime(value + 'T12:00');
  }
  function normalize(input) {
    const value = Object.fromEntries(['type', 'name', 'category', 'locationGroup', 'locationDetail', 'occurredAt', 'contact', 'description'].map(field => [field, text(input[field])]));
    value.locationGroups = Array.isArray(input.locationGroups) ? [...new Set(input.locationGroups.map(text))] : input.locationGroups === undefined && value.locationGroup ? [value.locationGroup] : [];
    value.locationGroup = value.locationGroups[0] || '';
    value.timePrecision = input.timePrecision || (validDate(value.occurredAt) ? 'date' : 'datetime');
    if (value.timePrecision === 'unknown') value.occurredAt = '';
    return value;
  }

  function validateItem(input) {
    const value = normalize(input || {});
    const errors = {};
    if (!['lost', 'found'].includes(value.type)) errors.type = '请选择寻物或招领';
    if (!value.name) errors.name = '请填写物品名称';
    if (!categories.includes(value.category)) errors.category = '请选择物品分类';
    if (!value.locationGroups.length || !value.locationGroups.every(area => locations.includes(area)) || (value.type === 'found' && value.locationGroups.length !== 1)) errors.locationGroup = value.type === 'lost' ? '请选择至少一个可能丢失的区域' : '请选择一个拾取区域';
    if (!value.locationDetail) errors.locationDetail = value.type === 'lost' ? '请填写最有可能的地点' : '请填写具体拾取地点';
    if (!['datetime', 'date', 'unknown'].includes(value.timePrecision) || (value.timePrecision === 'datetime' && !validTime(value.occurredAt)) || (value.timePrecision === 'date' && !validDate(value.occurredAt))) errors.occurredAt = '请填写有效的日期或时间';
    if (!value.contact) errors.contact = '请填写方便联系的微信、QQ或电话';
    for (const [field, limit] of Object.entries(limits)) {
      if (value[field].length > limit) errors[field] = `请控制在 ${limit} 字以内`;
    }
    return errors;
  }

  function assertValid(input) {
    const errors = validateItem(input);
    if (Object.keys(errors).length) {
      const error = new Error('信息填写不完整，请检查表单');
      error.fields = errors;
      throw error;
    }
  }

  function createItem(input, ownerId, now = new Date().toISOString()) {
    assertValid(input);
    if (!ownerId) throw new Error('发布者信息缺失');
    const id = typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : `post-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return { ...normalize(input), id, ownerId, image: 'assets/default-item.svg', status: 'open', createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() };
  }

  function owned(items, id, ownerId) {
    const record = items.find(item => item.id === id);
    if (!record) throw new Error('这条信息已不存在');
    if (record.ownerId !== ownerId) throw new Error('只能管理本人发布的信息');
    return record;
  }

  function updateItem(items, id, patch, ownerId, now = new Date().toISOString()) {
    const old = owned(items, id, ownerId);
    if (patch.type && patch.type !== old.type) throw new Error('发布后不能修改类型');
    const merged = { ...old, ...patch, type: old.type };
    if (patch.locationGroup !== undefined && patch.locationGroups === undefined) merged.locationGroups = [patch.locationGroup];
    const value = normalize(merged);
    assertValid(value);
    return items.map(item => item.id === id ? { ...old, ...value, updatedAt: new Date(now).toISOString() } : item);
  }

  function completeItem(items, id, ownerId, now = new Date().toISOString()) {
    owned(items, id, ownerId);
    return items.map(item => item.id === id ? { ...item, status: 'completed', updatedAt: new Date(now).toISOString() } : item);
  }

  function reopenItem(items, id, ownerId, now = new Date().toISOString()) {
    owned(items, id, ownerId);
    return items.map(item => item.id === id ? { ...item, status: 'open', updatedAt: new Date(now).toISOString() } : item);
  }

  function deleteItem(items, id, ownerId) {
    owned(items, id, ownerId);
    return items.filter(item => item.id !== id);
  }

  function validateFilters(filters) {
    if (filters.timeRange !== 'custom') return '';
    if (!validDate(filters.dateStart) || !validDate(filters.dateEnd)) return '请选择有效的开始和结束日期';
    if (filters.dateStart > filters.dateEnd) return '开始日期不能晚于结束日期';
    return '';
  }
  function eventRange(filters, now) {
    if (!filters.timeRange || filters.timeRange === 'all') return null;
    if (filters.timeRange === 'custom') return validateFilters(filters) ? ['', ''] : [filters.dateStart, filters.dateEnd];
    const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const end = new Date(now); const start = new Date(now);
    start.setDate(start.getDate() - ({ today: 0, '3days': 2, '7days': 6 }[filters.timeRange] ?? 0));
    return [localDate(start), localDate(end)];
  }
  const itemAreas = item => Array.isArray(item.locationGroups) ? item.locationGroups : [item.locationGroup];

  // 把搜索词按空白拆成多个关键词，兼容半角与全角空格
  function splitKeywords(value) {
    return text(value).toLocaleLowerCase().split(/[\s\u3000]+/).filter(Boolean);
  }

  // 关键词匹配范围：物品名称 + 物品描述 + 具体地点。
  // 作业要求「通过物品名称等关键词进行搜索」，只比对名称会漏掉
  // 用户最常用来描述物品特征的描述与地点文字。
  // 多个关键词之间是「与」的关系：必须全部命中，便于逐步缩小范围。
  function matchesKeywords(item, words) {
    if (!words.length) return true;
    const haystack = [item.name, item.description, item.locationDetail].map(text).join('\n').toLocaleLowerCase();
    return words.every(word => haystack.includes(word));
  }

  function queryItems(items, filters = {}, favorites = [], now = new Date()) {
    const words = splitKeywords(filters.keyword);
    const range = eventRange(filters, now);
    return items.filter(item =>
      matchesKeywords(item, words) &&
      (!filters.type || filters.type === 'all' || item.type === filters.type) &&
      (!filters.category || item.category === filters.category) &&
      (!filters.locationGroup || itemAreas(item).includes(filters.locationGroup)) &&
      (!filters.categories?.length || filters.categories.includes(item.category)) &&
      (!filters.locations?.length || itemAreas(item).some(area => filters.locations.includes(area))) &&
      (!filters.status || filters.status === 'all' || item.status === filters.status) &&
      (!range || (item.timePrecision !== 'unknown' && Boolean(item.occurredAt) && item.occurredAt.slice(0, 10) >= range[0] && item.occurredAt.slice(0, 10) <= range[1])) &&
      (!filters.ownerId || item.ownerId === filters.ownerId) &&
      (!filters.favoritesOnly || favorites.includes(item.id))
    ).slice().sort((a, b) => (filters.sort === 'oldest' ? 1 : -1) * (Date.parse(a.createdAt) - Date.parse(b.createdAt)));
  }

  function statusLabel(item) {
    if (item.status === 'completed') return item.type === 'lost' ? '已找到' : '已归还';
    return item.type === 'lost' ? '寻找中' : '待认领';
  }

  function toggleFavorite(favorites, id) {
    return favorites.includes(id) ? favorites.filter(value => value !== id) : [...favorites, id];
  }

  function rememberSearch(history, keyword) {
    const word = text(keyword).slice(0, 100);
    if (!word) return history.slice();
    return [word, ...history.filter(value => value.toLocaleLowerCase() !== word.toLocaleLowerCase())].slice(0, 8);
  }

  function validState(state) {
    if (!state || state.version !== 1 || !Array.isArray(state.items) || !Array.isArray(state.favorites)) return false;
    if (state.recentSearches !== undefined && (!Array.isArray(state.recentSearches) || state.recentSearches.length > 8 || !state.recentSearches.every(value => typeof value === 'string' && value.trim() && value.length <= 100))) return false;
    if (state.preferences !== undefined && (!state.preferences || !['newest', 'oldest'].includes(state.preferences.sort) || typeof state.preferences.saveSearchHistory !== 'boolean')) return false;
    const ids = new Set();
    for (const item of state.items) {
      if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id) || typeof item.ownerId !== 'string' || !item.ownerId || Object.keys(validateItem(item)).length || !['open', 'completed'].includes(item.status) || !Number.isFinite(Date.parse(item.createdAt)) || !Number.isFinite(Date.parse(item.updatedAt))) return false;
      ids.add(item.id);
    }
    return state.favorites.every(id => typeof id === 'string') && new Set(state.favorites).size === state.favorites.length;
  }

  function createStore(storage, seed) {
    let issue = false;
    let expectedRaw;
    return {
      load() {
        try {
          const raw = storage.getItem(key);
          const state = raw === null ? seed() : JSON.parse(raw);
          if (!validState(state)) throw new Error('invalid');
          issue = false; expectedRaw = raw;
          return state;
        } catch (_) {
          issue = true;
          throw new Error('无法读取浏览器保存的数据，原数据已保留。请恢复示例数据后再操作。');
        }
      },
      save(state) {
        if (issue) throw new Error('请先恢复示例数据，再尝试保存');
        if (!validState(state)) throw new Error('保存的信息格式不正确');
        let currentRaw;
        try { currentRaw = storage.getItem(key); }
        catch (_) { throw new Error('保存失败，无法读取浏览器存储'); }
        if (expectedRaw === undefined || currentRaw !== expectedRaw) throw new Error('另一页面已更新数据，请刷新当前页面后重试；本次修改未保存。');
        const serialized = JSON.stringify(state);
        try { storage.setItem(key, serialized); expectedRaw = serialized; }
        catch (_) { throw new Error('保存失败，浏览器存储可能已满或被禁用。请检查后重试。'); }
      },
      reset() {
        const state = seed();
        const serialized = JSON.stringify(state);
        try { storage.setItem(key, serialized); }
        catch (_) { throw new Error('保存失败，无法恢复示例数据'); }
        expectedRaw = serialized; issue = false;
        return state;
      }

    };
  }

  return { campuses, categories, locations, key, splitKeywords, validateItem, createItem, validateFilters, queryItems, updateItem, completeItem, reopenItem, deleteItem, statusLabel, toggleFavorite, rememberSearch, createStore };
});
