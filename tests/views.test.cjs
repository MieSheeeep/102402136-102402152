const { describe, it } = require('mocha');
const assert = require('node:assert/strict');
const D = require('../js/data.js');
const V = require('../js/views.js');

// 便利函数：把高亮结果里的 <mark> 还原成一个标记，便于断言语义
const plain = html => html.replace(/<mark class="keyword-mark">(.*?)<\/mark>/g, '[$1]');
const MARKS = html => (html.match(/<mark class="keyword-mark">/g) || []).length;

// 构造首页渲染所需的最小 state
const mkItem = (id, name) => ({
  id, ownerId: 'u1', ownerName: '叶同学', type: 'lost', name, category: '生活用品',
  locationGroups: ['教学楼'], locationGroup: '教学楼', locationDetail: '教学楼A区302',
  occurredAt: '2026-10-06T09:20', timePrecision: 'datetime', contact: '微信：demo',
  description: '银色金属环', image: 'assets/default-item.svg', status: 'open',
  createdAt: '2026-10-07T10:00:00.000Z', updatedAt: '2026-10-07T10:00:00.000Z',
});
const mkState = count => ({
  version: 1, favorites: [], recentSearches: [], notices: [],
  items: Array.from({ length: count }, (_, i) => mkItem('id' + i, '物品' + i)),
});
const F = { keyword: '', type: 'all', locations: [], categories: [], timeRange: 'all' };
const CARDS = html => (html.match(/<article class="item-card/g) || []).length;

describe('搜索、分页与图片展示', () => {
  it('keyword highlighting stays consistent and safely escapes text', () => {
    // without keywords it returns exactly the escaped text
    {
      assert.equal(V.highlight('黑色雨伞 <b>', []), V.esc('黑色雨伞 <b>'));
      assert.equal(V.highlight('黑色雨伞', undefined), '黑色雨伞');
    }
    // wraps every occurrence of the keyword
    {
      assert.equal(plain(V.highlight('黑色雨伞', ['雨伞'])), '黑色[雨伞]');
      assert.equal(plain(V.highlight('雨伞和雨伞', ['雨伞'])), '[雨伞]和[雨伞]');
      assert.equal(MARKS(V.highlight('雨伞和雨伞', ['雨伞'])), 2);
    }
    // matches case-insensitively but keeps the original spelling
    {
      assert.equal(plain(V.highlight('AirPods 耳机盒', ['airpods'])), '[AirPods] 耳机盒');
      assert.equal(plain(V.highlight('airpods', ['AirPods'])), '[airpods]');
    }
    // highlights several keywords at once
    {
      const html = V.highlight('黑色雨伞 带银色金属环', ['黑色', '金属']);
      assert.equal(plain(html), '[黑色]雨伞 带银色[金属]环');
      assert.equal(MARKS(html), 2);
    }
    // prefers the longer keyword so a short one cannot split it
    {
      // 「雨伞」比「伞」长，应该整体高亮，而不是被拆成 雨[伞]
      assert.equal(plain(V.highlight('黑色雨伞', ['伞', '雨伞'])), '黑色[雨伞]');
    }
    // escapes user text inside the highlighted segment
    {
      const html = V.highlight('<img src=x onerror=alert(1)>', ['onerror']);
      assert.ok(!html.includes('<img'), '不应出现未转义的 <img 标签');
      assert.ok(html.includes('&lt;img'));
      assert.ok(html.includes('<mark class="keyword-mark">onerror</mark>'));
    }
    // escaping is safe even when the keyword is a tag name
    {
      // 关键回归：如果实现是「先 esc 再替换」，<b> 会被还原成真正的标签，
      // 页面就会把 hello 渲染成粗体，等于用高亮功能打开了 XSS 的口子。
      const html = V.highlight('<b>hello</b>', ['b']);
      assert.ok(!html.includes('<b>'), '不应出现未转义的 <b> 标签');
      assert.equal(plain(html), '&lt;[b]&gt;hello&lt;/[b]&gt;');
    }
    // does not break HTML entities when the keyword matches inside one
    {
      // A&B 转义后是 A&amp;B，其中含有子串 amp。
      // 「先 esc 再替换」的实现会把实体切成 A&<mark>amp</mark>; 而破坏它。
      const html = V.highlight('A&B', ['amp']);
      assert.equal(html, 'A&amp;B');
      assert.equal(MARKS(html), 0);
    }
    // treats regex metacharacters in the keyword as literal text
    {
      assert.equal(MARKS(V.highlight('价格 3.5 元', ['3.5'])), 1);
      assert.equal(plain(V.highlight('价格 3.5 元', ['3.5'])), '价格 [3.5] 元');
      assert.equal(MARKS(V.highlight('a+b', ['+'])), 1);
      assert.equal(MARKS(V.highlight('abc', ['a|b'])), 0);
    }
    // ignores empty and duplicate keywords
    {
      assert.equal(MARKS(V.highlight('黑色雨伞', ['', '  '])), 0);
      assert.equal(MARKS(V.highlight('黑色雨伞', ['雨伞', '雨伞'])), 1);
    }
    // handles non-string values without throwing
    {
      assert.equal(V.highlight(undefined, ['a']), '');
      assert.equal(V.highlight(null, ['a']), '');
      assert.equal(plain(V.highlight(123, ['2'])), '1[2]3');
    }
    // reuses the same tokenizer as the search so highlighting never disagrees with filtering
    {
      // 搜索用 D.splitKeywords 分词，高亮也用同一套，保证「搜到了就一定能看到高亮」
      const words = D.splitKeywords('  黑色\u3000雨伞 ');
      assert.deepEqual(words, ['黑色', '雨伞']);
      assert.equal(MARKS(V.highlight('黑色雨伞', words)), 2);
    }
  });

  it('home pagination renders cards, counters and both empty states', () => {
    // renders only the requested page of cards
    {
      const html = V.home(mkState(30), F, { limit: 12 });
      assert.equal(CARDS(html), 12);
      assert.ok(html.includes('还有 18 条'));
      assert.ok(html.includes('已显示 12 / 30 条'));
    }
    // hides the load-more button once everything is shown
    {
      const html = V.home(mkState(8), F, { limit: 12 });
      assert.equal(CARDS(html), 8);
      assert.ok(!html.includes('data-action="load-more"'));
      assert.ok(html.includes('已经到底啦，共 8 条信息'));
    }
    // shows everything when no limit is given
    {
      assert.equal(CARDS(V.home(mkState(30), F, {})), 30);
    }
    // tells "nothing published yet" apart from "nothing matched"
    {
      const empty = V.home(mkState(0), F, {});
      assert.ok(empty.includes('广场上还没有信息'));
      const noMatch = V.home(mkState(5), { ...F, keyword: '不存在的东西' }, {});
      assert.ok(noMatch.includes('没有匹配的信息'));
      assert.ok(noMatch.includes('搜索支持物品名称、描述和地点'));
      assert.ok(!noMatch.includes('广场上还没有信息'));
    }
  });

  it('image rendering accepts supported sources and preserves a local photo', () => {
    // passes the three supported sources through and falls back otherwise
    {
      const local = 'data:image/webp;base64,UklGRg==';
      assert.equal(V.imageUrl(local), local);
      assert.equal(V.imageUrl('assets/default-item.svg'), 'assets/default-item.svg');
      assert.equal(V.imageUrl('data:image/svg+xml;base64,PHN2Zz4='), 'assets/default-item.svg');
      assert.equal(V.imageUrl('javascript:alert(1)'), 'assets/default-item.svg');
      assert.equal(V.imageUrl(undefined), 'assets/default-item.svg');
    }
    // renders a locally stored image inside the card
    {
      const state = mkState(1);
      state.items[0].image = 'data:image/webp;base64,UklGRg==';
      const html = V.home(state, F, {});
      assert.ok(html.includes('src="data:image/webp;base64,UklGRg=="'));
      assert.ok(!html.includes('src="assets/default-item.svg"'));
    }
  });
});
