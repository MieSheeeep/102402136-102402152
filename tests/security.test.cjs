const { describe, it } = require('mocha');
const assert = require('node:assert/strict');
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

});
