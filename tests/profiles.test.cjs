const { describe, it } = require('mocha');
const assert = require('node:assert/strict');
const V = require('../js/views.js');
describe('账号和用户主页视图', () => {
  const user = { id: 'u1', nickname: '<script>昵称</script>', avatar: '/uploads/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.webp', createdAt: '2026-10-07T00:00:00Z', account: 'private-account' };
  it('settings allow profile edits and password change, without resetting shared data', () => {
    const html = V.settings({ remote: true, user, items: [], favorites: [] });
    assert.ok(html.includes('profile-form') && html.includes('password-form') && html.includes('name="nickname"'));
    assert.ok(!html.includes('data-action="reset"')); assert.ok(!html.includes('<script>昵称</script>'));
  });
  it('public profiles show actual stats and posts without edit controls or private account', () => {
    const html = V.userProfile({ user, stats: { published: 3, open: 2, completed: 1 }, items: [] }, []);
    assert.ok(html.includes('发布总数') && html.includes('加入于'));
    assert.ok(!html.includes('private-account') && !html.includes('data-action="edit"'));
  });
  it('auth form supports login, register and account recovery', () => {
    assert.ok(V.auth('login').includes('autocomplete="current-password"'));
    assert.ok(V.auth('register').includes('name="nickname"'));
    assert.ok(V.auth('recover').includes('name="recoveryCode"'));
  });
  it('image source rejects javascript and untrusted external URLs', () => {
    assert.equal(V.imageUrl('javascript:alert(1)'), 'assets/default-item.svg');
    assert.equal(V.imageUrl('https://untrusted.example/a.png'), 'assets/default-item.svg');
    assert.equal(V.imageUrl(user.avatar), user.avatar);
  });
  it('profile fields are editable, escaped and public contact stays private', () => {
    const filled = { ...user, bio: '<script>简介</script>', campus: '旗山校区', contact: 'private-wechat' };
    const settings = V.profileSettings(filled); assert.ok(settings.includes('name="bio"') && settings.includes('name="campus"') && settings.includes('name="contact"'));
    const html = V.userProfile({ user: filled, stats: { published: 0, open: 0, completed: 0 }, items: [] }, []);
    assert.ok(html.includes('旗山校区') && html.includes('&lt;script&gt;简介&lt;/script&gt;'));
    assert.ok(!html.includes('private-wechat'));
  });
});
