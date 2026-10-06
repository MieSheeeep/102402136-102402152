const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const D = require('../js/data.js');
const V = require('../js/views.js');

// Exercise the real controller's events without claiming browser/layout coverage.
function controller() {
  const events = {}; const checked = {}; const seen = []; const mySeen = []; let formValues = [];
  const element = name => ({ hidden: false, innerHTML: '', focus() {}, addEventListener(type, handler) { events[`${name}:${type}`] = handler; } });
  const main = element('main'); const modal = element('modal'); const toast = element('toast'); const warning = element('warning');
  let stored = null;
  const context = {
    document: { title: '', activeElement: null,
      querySelector(selector) { return ({ '#main': main, '#modal': modal, '#toast': toast, '#storage-warning': warning })[selector] || (selector === '#publish-form' ? { values: formValues } : null); },
      querySelectorAll(selector) { const group = selector.match(/data-multi="([^\"]+)"/); return group ? (checked[group[1]] || []).map(value => ({ value })) : []; },
      addEventListener(type, handler) { events[`document:${type}`] = handler; }
    },
    FormData: class { constructor(form) { this.values = form.values; } [Symbol.iterator]() { return this.values[Symbol.iterator](); } getAll(key) { return this.values.filter(([name]) => name === key).map(([,value]) => value); } },
    location: { hash: '#home' }, setTimeout: () => 1, clearTimeout() {}, Date,
    window: { CampusData: D, CampusViews: { ...V, my(state, type, ownerId, status) { mySeen.push({ type, status }); return V.my(state, type, ownerId, status); }, home(state, filters, ui) { seen.push(JSON.parse(JSON.stringify({ filters, ui }))); return V.home(state, filters, ui); } },
      localStorage: { getItem: () => stored, setItem: (_, value) => { stored = value; } },
      scrollTo() {}, addEventListener(type, handler) { events[`window:${type}`] = handler; }
    }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/seed.js'), 'utf8'), context);
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/app.js'), 'utf8'), context);
  return {
    seen, main, mySeen,
    navigate(hash) { context.location.hash = hash; events['window:hashchange'](); },
    publish(values) { formValues = values; events['main:submit']({ preventDefault() {}, target: { id: 'publish-form', querySelector: () => ({ disabled: false, isConnected: false }) } }); },
    click(action, value) { const trigger = { dataset: { action, value }, disabled: false }; events['document:click']({ target: { closest: selector => selector === '[data-action]' ? trigger : null } }); },
    multi(group, values) { checked[group] = values; events['main:change']({ target: { dataset: { multi: group }, matches: selector => selector === '[data-multi]' } }); },
    pending(name, value) { events['main:change']({ target: { dataset: { pending: name }, value, matches: selector => selector === '[data-pending]' } }); },
    apply() { events['main:submit']({ preventDefault() {}, target: { id: 'advanced-filters' } }); }
  };
}
test('multi-select stays a draft until apply and closing discards unapplied changes', () => {
  const c = controller(); c.click('advanced-filters'); c.multi('locations', ['教学楼', '食堂']);
  c.click('time-range', '3days');
  assert.deepEqual(c.seen.at(-1).filters.locations, []);
  c.click('advanced-filters'); c.click('advanced-filters');
  assert.deepEqual(c.seen.at(-1).ui.filterDraft.locations, []);
  c.multi('locations', ['教学楼', '食堂']); c.multi('categories', ['生活用品']); c.apply();
  assert.deepEqual(c.seen.at(-1).filters.locations, ['教学楼', '食堂']);
  assert.equal(c.seen.at(-1).ui.advancedOpen, true);
  c.click('reset-pending');
  assert.deepEqual(c.seen.at(-1).filters.locations, ['教学楼', '食堂']);
  c.apply(); assert.deepEqual(c.seen.at(-1).filters.locations, []);
});
test('reversed custom range remains open and does not alter applied filters', () => {
  const c = controller(); c.click('advanced-filters'); c.click('time-range', 'custom');
  c.pending('dateStart', '2026-10-07'); c.pending('dateEnd', '2026-10-06'); c.apply();
  assert.equal(c.seen.at(-1).filters.timeRange, 'all');
  assert.equal(c.seen.at(-1).ui.advancedOpen, true); assert.ok(c.seen.at(-1).ui.filterError);
  c.pending('dateStart', '2026-10-01'); c.apply();
  assert.equal(c.seen.at(-1).filters.timeRange, 'custom');
  assert.equal(c.seen.at(-1).filters.dateEnd, '2026-10-06');
});


test('changing default sort synchronizes an already open filter draft', () => {
  const c = controller(); c.click('advanced-filters'); c.click('preference-sort', 'oldest'); c.apply();
  assert.equal(c.seen.at(-1).filters.sort, 'oldest');
});
test('successful publication returns to my posts without stale completion or type filters', () => {
  const c = controller(); c.navigate('#my'); c.click('my-type', 'found'); c.click('my-status');
  c.navigate('#publish');
  c.publish([['type','lost'],['name','新发布验收'],['category','生活用品'],['locationGroups','教学楼'],['locationDetail','教学楼302'],['occurredAt','2026-10-06T10:00'],['timePrecision','datetime'],['contact','示例微信']]);
  c.navigate('#my');
  assert.equal(c.mySeen.at(-1).type, 'all'); assert.equal(c.mySeen.at(-1).status, 'all');
  assert.ok(c.main.innerHTML.includes('新发布验收'));
});
