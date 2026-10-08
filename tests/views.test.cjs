const { describe, it } = require('mocha');
const assert = require('node:assert/strict');
const D = require('../js/data.js');
const V = require('../js/views.js');

// 便利函数：把高亮结果里的 <mark> 还原成一个标记，便于断言语义
const plain = html => html.replace(/<mark class="keyword-mark">(.*?)<\/mark>/g, '[$1]');
const MARKS = html => (html.match(/<mark class="keyword-mark">/g) || []).length;

describe('搜索结果关键词高亮', () => {
  it('without keywords it returns exactly the escaped text', () => {
    assert.equal(V.highlight('黑色雨伞 <b>', []), V.esc('黑色雨伞 <b>'));
    assert.equal(V.highlight('黑色雨伞', undefined), '黑色雨伞');
  });

  it('wraps every occurrence of the keyword', () => {
    assert.equal(plain(V.highlight('黑色雨伞', ['雨伞'])), '黑色[雨伞]');
    assert.equal(plain(V.highlight('雨伞和雨伞', ['雨伞'])), '[雨伞]和[雨伞]');
    assert.equal(MARKS(V.highlight('雨伞和雨伞', ['雨伞'])), 2);
  });

  it('matches case-insensitively but keeps the original spelling', () => {
    assert.equal(plain(V.highlight('AirPods 耳机盒', ['airpods'])), '[AirPods] 耳机盒');
    assert.equal(plain(V.highlight('airpods', ['AirPods'])), '[airpods]');
  });

  it('highlights several keywords at once', () => {
    const html = V.highlight('黑色雨伞 带银色金属环', ['黑色', '金属']);
    assert.equal(plain(html), '[黑色]雨伞 带银色[金属]环');
    assert.equal(MARKS(html), 2);
  });

  it('prefers the longer keyword so a short one cannot split it', () => {
    // 「雨伞」比「伞」长，应该整体高亮，而不是被拆成 雨[伞]
    assert.equal(plain(V.highlight('黑色雨伞', ['伞', '雨伞'])), '黑色[雨伞]');
  });

  it('escapes user text inside the highlighted segment', () => {
    const html = V.highlight('<img src=x onerror=alert(1)>', ['onerror']);
    assert.ok(!html.includes('<img'), '不应出现未转义的 <img 标签');
    assert.ok(html.includes('&lt;img'));
    assert.ok(html.includes('<mark class="keyword-mark">onerror</mark>'));
  });

  it('escaping is safe even when the keyword is a tag name', () => {
    // 关键回归：如果实现是「先 esc 再替换」，<b> 会被还原成真正的标签，
    // 页面就会把 hello 渲染成粗体，等于用高亮功能打开了 XSS 的口子。
    const html = V.highlight('<b>hello</b>', ['b']);
    assert.ok(!html.includes('<b>'), '不应出现未转义的 <b> 标签');
    assert.equal(plain(html), '&lt;[b]&gt;hello&lt;/[b]&gt;');
  });

  it('does not break HTML entities when the keyword matches inside one', () => {
    // A&B 转义后是 A&amp;B，其中含有子串 amp。
    // 「先 esc 再替换」的实现会把实体切成 A&<mark>amp</mark>; 而破坏它。
    const html = V.highlight('A&B', ['amp']);
    assert.equal(html, 'A&amp;B');
    assert.equal(MARKS(html), 0);
  });

  it('treats regex metacharacters in the keyword as literal text', () => {
    assert.equal(MARKS(V.highlight('价格 3.5 元', ['3.5'])), 1);
    assert.equal(plain(V.highlight('价格 3.5 元', ['3.5'])), '价格 [3.5] 元');
    assert.equal(MARKS(V.highlight('a+b', ['+'])), 1);
    assert.equal(MARKS(V.highlight('abc', ['a|b'])), 0);
  });

  it('ignores empty and duplicate keywords', () => {
    assert.equal(MARKS(V.highlight('黑色雨伞', ['', '  '])), 0);
    assert.equal(MARKS(V.highlight('黑色雨伞', ['雨伞', '雨伞'])), 1);
  });

  it('handles non-string values without throwing', () => {
    assert.equal(V.highlight(undefined, ['a']), '');
    assert.equal(V.highlight(null, ['a']), '');
    assert.equal(plain(V.highlight(123, ['2'])), '1[2]3');
  });

  it('reuses the same tokenizer as the search so highlighting never disagrees with filtering', () => {
    // 搜索用 D.splitKeywords 分词，高亮也用同一套，保证「搜到了就一定能看到高亮」
    const words = D.splitKeywords('  黑色\u3000雨伞 ');
    assert.deepEqual(words, ['黑色', '雨伞']);
    assert.equal(MARKS(V.highlight('黑色雨伞', words)), 2);
  });
});
