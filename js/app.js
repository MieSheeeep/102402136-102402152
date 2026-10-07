(function () {
  'use strict';
  const D = window.CampusData;
  const V = window.CampusViews;
  const backend = Boolean(window.CampusAPI && /^https?:$/.test(location.protocol));
  const API = window.CampusAPI;
  let ownerId = backend ? null : 'me';
  let backendReady = !backend;
  let publicProfile = null;
  let profileRequest = '';
  let returnAfterLogin = 'my';
  let pendingItemFile = null;
  let pendingAvatarFile = null;
  let previewUrl = '';
  const main = document.querySelector('#main');
  const modal = document.querySelector('#modal');
  const toastEl = document.querySelector('#toast');
  const warning = document.querySelector('#storage-warning');
  // Keep navigation above the keyboard and inside the actual visible viewport.
  function syncNavigationInset() {
    const viewport = window.visualViewport;
    const inset = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
    document.documentElement?.style.setProperty('--navigation-inset', `${inset}px`);
  }
  syncNavigationInset();
  window.visualViewport?.addEventListener('resize', syncNavigationInset);
  window.visualViewport?.addEventListener('scroll', syncNavigationInset);
  window.addEventListener('resize', syncNavigationInset);
  let state;
  const defaults = () => ({ keyword: '', type: 'all', locations: [], categories: [], timeRange: 'all', dateStart: '', dateEnd: '', sort: state?.preferences?.sort || 'newest', favoritesOnly: false });
  let filters = defaults();
  let advancedOpen = false;
  let filterDraft = null;
  let filterError = '';
  let filterMotionSerial = 0;
  let myStatus = 'all';
  let myType = 'all';
  let draft = { type: 'lost', name: '', category: '', locationGroup: '', locationDetail: '', occurredAt: '', contact: '', description: '' };
  let editingId = null;
  let errors = {};
  let toastTimer;
  let submitting = false;
  let modalTrigger;
  const favoriteMotions = new WeakMap();
  let warningText = '';
  let currentRoute = { page: 'home', id: '' };
  let storage;
  const motionEase = 'cubic-bezier(.22, 1, .36, 1)';
  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  function animate(element, frames, duration = 240) {
    if (!element?.animate || reducedMotion()) return null;
    element.getAnimations().forEach(animation => animation.cancel());
    return element.animate(frames, { duration, easing: motionEase });
  }
  try { storage = window.localStorage; }
  catch (_) { storage = { getItem() { throw new Error('unavailable'); }, setItem() { throw new Error('unavailable'); } }; }
  const store = D.createStore(storage, window.CampusSeed);
  try { state = backend ? { remote: true, user: null, items: [], favorites: [], recentSearches: [], preferences: { sort: 'newest', saveSearchHistory: true }, notices: [] } : store.load(); if (!backend) { state = window.CampusSeed.upgrade(state); store.save(state); } }
  catch (error) { state = state || window.CampusSeed(); warningText = error.message; }

  filters = defaults();

  function toast(message, kind = 'success') {
    clearTimeout(toastTimer);
    toastEl.innerHTML = `${V.icon(kind === 'success' ? 'check' : kind === 'error' ? 'shield' : 'clock')}<span>${V.esc(message)}</span><button data-action="dismiss-toast" aria-label="关闭提示">${V.icon('close')}</button>`;
    toastEl.dataset.kind = kind;
    toastEl.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    toastEl.setAttribute('aria-live', kind === 'error' ? 'assertive' : 'polite');
    toastEl.hidden = false;
    animate(toastEl, [{ opacity: 0, transform: 'translate(-50%, 8px)' }, { opacity: 1, transform: 'translate(-50%, 0)' }]);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, kind === 'success' ? 3200 : 5500);
  }

  function showWarning() {
    warning.hidden = !warningText;
    if (warningText) warning.innerHTML = `${V.esc(warningText)} <button data-action="reset">重置数据</button>`;
  }

  function route() {
    const parts = location.hash.replace(/^#/, '').split('/');
    let id = '';
    try { id = decodeURIComponent(parts[1] || ''); } catch (_) { /* malformed URL uses empty id */ }
    return { page: ['home', 'publish', 'my', 'detail', 'edit', 'success', 'settings', 'user', 'login', 'register', 'recover', 'admin'].includes(parts[0]) ? parts[0] : 'home', id };
  }

  function readForm() {
    const form = document.querySelector('#publish-form');
    if (!form) return draft;
    const values = new FormData(form);
    const next = Object.fromEntries(values);
    next.locationGroups = next.type === 'lost' ? values.getAll('locationGroups') : [next.locationGroup];
    return { ...next, image: draft.image, remote: backend };
  }

  function navigate(path) {
    if (location.hash === `#${path}`) render();
    else location.hash = path;
  }

  function render() {
    if (!backendReady) { main.innerHTML = `<section class="empty-state"><h2>${warningText ? '暂时无法连接服务' : '正在载入'}</h2>${warningText ? '<button class="button button-primary" data-action="retry-server">重新连接</button>' : ''}</section>`; return; }
    const oldPanel = document.querySelector('#advanced-filters');
    const wasOpen = oldPanel && !oldPanel.hidden;
    const panelHeight = wasOpen ? oldPanel.getBoundingClientRect?.().height || 0 : 0;
    const oldList = document.querySelector('.card-grid')?.innerHTML;
    const oldQuick = document.querySelector('.compact-filters');
    const noticeScroll = document.querySelector('#urgent-track')?.scrollLeft || 0;
    const filterScroll = document.querySelector('#filter-scroll')?.scrollTop || 0;
    const nextRoute = route();
    const changed = nextRoute.page !== currentRoute.page || nextRoute.id !== currentRoute.id;
    currentRoute = nextRoute;
    const item = state.items.find(post => post.id === currentRoute.id);
    let nav = currentRoute.page;
    if (nav === 'detail') nav = 'home';
    if (nav === 'edit' || nav === 'success' || nav === 'settings') nav = 'my';
    document.querySelectorAll('[data-nav]').forEach(link => {
      const active = link.dataset.nav === nav;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    const titles = { home: '寻物广场', publish: '发布信息', my: '我的', detail: '信息详情', edit: '编辑信息', success: '发布成功', settings: '设置', user: '用户主页', login: '登录', register: '注册', recover: '找回账号', admin: '内容管理' };
    document.title = `${titles[currentRoute.page]} · 校园失物招领`;
    switch (currentRoute.page) {
      case 'login': case 'register': case 'recover': main.innerHTML = V.auth(currentRoute.page); break;
      case 'user':
        if (backend) {
          if (publicProfile?.user.id === currentRoute.id) main.innerHTML = V.userProfile(publicProfile, state.favorites);
          else { main.innerHTML = '<section class="empty-state"><h2>正在载入用户主页</h2></section>'; void loadProfile(currentRoute.id); }
        } else {
          const posts = state.items.filter(post => post.ownerId === currentRoute.id);
          const completed = posts.filter(post => post.status === 'completed').length;
          main.innerHTML = posts.length ? V.userProfile({ user: { id: currentRoute.id, nickname: posts[0].ownerName }, items: posts, stats: { published: posts.length, open: posts.length - completed, completed } }, state.favorites) : V.detail(null, [], ownerId);
        }
        break;
      case 'admin': main.innerHTML = state.user?.role === 'admin' ? V.adminPanel(state) : '<section class="empty-state"><h2>需要管理员权限</h2></section>'; break;
      case 'settings': main.innerHTML = V.settings(state); break;
      case 'my': main.innerHTML = V.my(state, myType, ownerId, myStatus); break;
      case 'detail': main.innerHTML = V.detail(item, state.favorites, ownerId); break;
      case 'edit':
        if (!item || item.ownerId !== ownerId) {
          main.innerHTML = V.detail(item, state.favorites, ownerId);
          toast(item ? '只能编辑本人发布的信息' : '这条信息已不存在', 'error');
        } else {
          if (editingId !== item.id || changed) { draft = { ...item, remote: backend }; pendingItemFile = null; errors = {}; editingId = item.id; }
          main.innerHTML = V.form(draft, errors, true);
        }
        break;
      case 'publish':
        if (editingId) { draft = { type: 'lost' }; editingId = null; errors = {}; }
        main.innerHTML = V.form({ ...draft, contact: draft.contact || state.user?.contact || '', remote: backend }, errors);
        break;
      case 'success': main.innerHTML = item ? V.success(item) : V.detail(null, state.favorites, ownerId); break;
      default: main.innerHTML = V.home(state, filters, { advancedOpen, filterDraft, filterError });
    }
    if (backend && !state.user && ['my', 'settings', 'publish', 'edit'].includes(currentRoute.page)) {
      returnAfterLogin = `${currentRoute.page}${currentRoute.id ? '/' + encodeURIComponent(currentRoute.id) : ''}`;
      main.innerHTML = V.auth('login');
    }
    if (pendingItemFile && document.querySelector('#item-preview')) syncItemImage();
    const freshPanel = document.querySelector('#advanced-filters');
    const freshQuick = document.querySelector('.compact-filters');
    if (!changed && oldQuick && freshQuick?.replaceWith) {
      freshQuick.querySelectorAll('[data-action]').forEach(fresh => {
        const existing = [...oldQuick.querySelectorAll('[data-action]')].find(button => button.dataset.action === fresh.dataset.action && button.dataset.value === fresh.dataset.value);
        if (!existing) return;
        existing.className = fresh.className;
        ['aria-pressed', 'aria-expanded', 'aria-label'].forEach(name => {
          const value = fresh.getAttribute(name);
          if (value === null) existing.removeAttribute(name); else existing.setAttribute(name, value);
        });
        const oldCount = existing.querySelector('.filter-count');
        const newCount = fresh.querySelector('.filter-count');
        if (oldCount && newCount) oldCount.textContent = newCount.textContent;
        else if (oldCount) oldCount.remove();
        else if (newCount) existing.append(newCount.cloneNode(true));
      });
      freshQuick.replaceWith(oldQuick);
    }
    if (!changed && advancedOpen && wasOpen && !oldPanel.inert && freshPanel?.replaceWith) {
      const error = oldPanel.querySelector('#filter-error');
      error.textContent = filterError;
      error.hidden = !filterError;
      freshPanel.replaceWith(oldPanel);
    }
    const track = document.querySelector('#urgent-track');
    if (track && !changed) track.scrollLeft = noticeScroll;
    const scrollArea = document.querySelector('#filter-scroll');
    if (scrollArea && !changed) scrollArea.scrollTop = filterScroll;
    showWarning();
    if (changed) { window.scrollTo({ top: 0, behavior: 'instant' }); main.focus({ preventScroll: true }); }
    if (changed) {
      animate(main, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], 280);
    } else {
      const panel = document.querySelector('#advanced-filters');
      if (panel?.animate && !reducedMotion()) {
        if ((!wasOpen || oldPanel.inert) && !panel.hidden) {
          const style = window.getComputedStyle(panel);
          animate(panel, [
            { height: `${panelHeight}px`, opacity: .2, marginTop: '0px', marginBottom: '0px' },
            { height: `${panel.offsetHeight}px`, opacity: 1, marginTop: style.marginTop, marginBottom: style.marginBottom }
          ], 260);
        } else if (wasOpen && panel.hidden) {
          // Preserve the outgoing panel while the new state is already closed.
          const outgoing = oldPanel.cloneNode(true);
          outgoing.inert = true;
          outgoing.setAttribute('aria-hidden', 'true');
          panel.replaceWith(outgoing);
          const height = panelHeight;
          outgoing.querySelector('#filter-scroll').scrollTop = filterScroll;
          const style = window.getComputedStyle(outgoing);
          const animation = animate(outgoing, [
            { height: `${height}px`, opacity: 1, marginTop: style.marginTop, marginBottom: style.marginBottom },
            { height: '0px', opacity: 0, marginTop: '0px', marginBottom: '0px' }
          ], 220);
          animation.finished.then(() => outgoing.replaceWith(panel), () => outgoing.replaceWith(panel));
        }
      }
      const list = document.querySelector('.card-grid');
      if (list && list.innerHTML !== oldList) {
        animate(list, [{ opacity: .45, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }], 200);
      }
    }
  }

  function persist(next, message, target) {
    try {
      store.save(next);
      state = next;
      if (target) navigate(target); else render();
      if (message) toast(message);
      return true;
    } catch (error) { toast(error.message, 'error'); return false; }
  }

  function syncAccount() {
    const account = document.querySelector('.header-account');
    if (backend && account) {
      account.innerHTML = `${state.user ? V.avatar(state.user) : '<span>我</span>'}<span class="header-account-label">${V.esc(state.user?.nickname || '登录')}</span>`;
      account.href = state.user ? '#my' : '#login';
    }
  }
  async function refreshRemote(draw = true) {
    state = await API.request('GET', '/state'); ownerId = state.user?.id || null; publicProfile = null;
    syncAccount(); if (draw) render();
  }
  async function initializeRemote() {
    try { await API.request('GET', '/auth/me'); await refreshRemote(false); backendReady = true; warningText = ''; filters = defaults(); render(); }
    catch (error) { warningText = error.message; render(); toast('无法连接后端，请确认服务已启动', 'error'); }
  }
  async function loadProfile(id) {
    if (profileRequest === id) return; profileRequest = id;
    try {
      const result = await API.request('GET', `/users/${encodeURIComponent(id)}`);
      if (route().page === 'user' && route().id === id) { publicProfile = result; render(); }
    } catch (error) { if (route().id === id) main.innerHTML = `<section class="empty-state"><h2>${V.esc(error.message)}</h2><a href="#home">返回广场</a></section>`; }
    finally { if (profileRequest === id) profileRequest = ''; }
  }
  function requireLogin() {
    if (state.user) return;
    returnAfterLogin = `${currentRoute.page}${currentRoute.id ? '/' + encodeURIComponent(currentRoute.id) : ''}`;
    navigate('login'); throw new Error('请先登录后操作');
  }
  async function remoteError(error) {
    if (error.status === 401) { await refreshRemote(false); requireLogin(); }
    if (error.status === 409) await refreshRemote();
    toast(error.message, 'error');
  }
  async function remoteAction(action, trigger, item) {
    const actions = ['preference-sort', 'settings-clear-history', 'clear-history', 'confirm-clear-favorites', 'confirm-complete', 'confirm-reopen', 'confirm-delete', 'logout', 'remove-avatar', 'remove-notice', 'confirm-admin-delete', 'dismiss-urgent'];
    if (!actions.includes(action)) return false;
    requireLogin(); trigger.disabled = true;
    try {
      let message = '已保存';
      switch (action) {
        case 'preference-sort': await API.request('PATCH', '/me/preferences', { sort: trigger.dataset.value }); filters.sort = trigger.dataset.value; if (filterDraft) filterDraft.sort = filters.sort; break;
        case 'settings-clear-history': case 'clear-history': await API.request('PATCH', '/me/preferences', { recentSearches: [] }); message = '搜索记录已清空'; break;
        case 'confirm-clear-favorites': await API.request('DELETE', '/favorites'); message = '收藏已清空'; closeModal(); break;
        case 'confirm-complete': case 'confirm-reopen': await API.request('PATCH', `/items/${encodeURIComponent(item.id)}`, { version: item.version, status: action === 'confirm-complete' ? 'completed' : 'open' }); message = action === 'confirm-complete' ? '已标记完成' : '已恢复进行中'; closeModal(); break;
        case 'confirm-delete': await API.request('DELETE', `/items/${encodeURIComponent(item.id)}`); message = '信息已删除'; closeModal(); break;
        case 'logout': await API.request('POST', '/auth/logout', {}); pendingAvatarFile = pendingItemFile = null; draft = { type: 'lost' }; editingId = null; message = '已退出登录'; break;
        case 'remove-avatar': await API.request('PATCH', '/me', { avatar: '' }); pendingAvatarFile = null; message = '头像已移除'; break;
        case 'dismiss-urgent': await API.request('DELETE', `/admin/urgent-requests/${encodeURIComponent(trigger.dataset.id)}`); message = '申请已驳回'; break;
        case 'remove-notice': await API.request('DELETE', `/admin/notices/${encodeURIComponent(trigger.dataset.id)}`); message = '公告已撤下'; break;
        case 'confirm-admin-delete': await API.request('DELETE', `/admin/items/${encodeURIComponent(trigger.dataset.id)}`); closeModal(); message = '信息已删除'; break;
      }
      await refreshRemote(); if (action === 'logout') navigate('home'); toast(message);
    } catch (error) { await remoteError(error); }
    finally { if (trigger.isConnected) trigger.disabled = false; }
    return true;
  }
  async function submitAccountForm(form) {
    const button = form.querySelector('[type="submit"],button');
    if (button.disabled) return; button.disabled = true;
    const values = Object.fromEntries(new FormData(form));
    try {
      if (form.id === 'auth-form') {
        const mode = form.dataset.mode;
        const result = await API.request('POST', `/auth/${mode}`, values);
        await API.request('GET', '/auth/me'); await refreshRemote(false);
        navigate(mode === 'recover' ? 'login' : returnAfterLogin);
        if (result.recoveryCode) openModal(V.recoveryDialog(result.recoveryCode, values.account));
        else toast('登录成功');
      } else if (form.id === 'profile-form') {
        requireLogin();
        if (pendingAvatarFile) values.avatar = await API.upload(pendingAvatarFile);
        await API.request('PATCH', '/me', values); pendingAvatarFile = null;
        await refreshRemote(); toast('个人资料已更新');
      } else if (form.id === 'password-form') {
        requireLogin(); await API.request('POST', '/auth/password', values); form.reset(); toast('密码已修改，其他设备已退出登录');
      } else if (form.id === 'urgent-request-form') {
        requireLogin(); await API.request('POST', `/urgent-requests/${encodeURIComponent(values.itemId)}`, { reward: Number(values.reward) }); closeModal(); toast('申请已提交给运营团队');
      } else {
        await API.request('PUT', `/admin/notices/${encodeURIComponent(values.itemId)}`, { reward: Number(values.reward), expiresAt: new Date(values.expiresAt).toISOString() }); await refreshRemote(); toast('公告已发布');
      }
    } catch (error) {
      const feedback = form.querySelector('#auth-error');
      if (feedback) { feedback.textContent = error.message; feedback.hidden = false; }
      else toast(error.message, 'error');
    } finally { if (button.isConnected) button.disabled = false; }
  }
  function showHistory(open) {
    const panel = document.querySelector('#recent-searches');
    const input = document.querySelector('#keyword');
    if (panel && input) {
      panel.hidden = !open;
      input.setAttribute('aria-expanded', String(open));
    }
  }

  function search(keyword) {
    filters.keyword = String(keyword || '').trim();
    if (filters.keyword && state.preferences?.saveSearchHistory !== false) {
      const next = { ...state, recentSearches: D.rememberSearch(state.recentSearches || [], filters.keyword) };
      try { if (!backend) store.save(next); else if (state.user) void API.request('PATCH', '/me/preferences', { recentSearches: next.recentSearches }).catch(error => toast(error.message, 'error')); state = next; }
      catch (error) { toast('搜索记录未保存：' + error.message, 'error'); }
    }
    render();
  }

  function openModal(content) {
    modalTrigger = document.activeElement;
    modal.innerHTML = content;
    modal.setAttribute('aria-describedby', 'modal-description');
    document.body.classList.add('modal-open');
    modal.showModal();
    modal.classList.remove('is-closing');
  }

  function closeModal() {
    if (!modal.open || modal.classList.contains('is-closing')) return;
    modal.classList.add('is-closing');
    modal.querySelectorAll('button').forEach(button => { button.disabled = true; });
    const animation = animate(modal, [{ opacity: 1, transform: 'translateY(0) scale(1)' }, { opacity: 0, transform: 'translateY(6px) scale(.98)' }], 160);
    const finish = () => { modal.classList.remove('is-closing'); modal.close(); };
    if (animation) animation.finished.then(finish, finish); else finish();
  }

  function syncFilterDraft() {
    const panel = document.querySelector('#advanced-filters');
    if (!panel?.querySelector) { render(); return; }
    panel.querySelectorAll('[data-multi]').forEach(input => { input.checked = filterDraft[input.dataset.multi].includes(input.value); });
    panel.querySelectorAll('[data-pending]').forEach(input => { input.value = filterDraft[input.dataset.pending]; });
    panel.querySelectorAll('[data-action="time-range"]').forEach(button => {
      const active = button.dataset.value === filterDraft.timeRange;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const error = panel.querySelector('#filter-error'); error.hidden = true;
    const dates = panel.querySelector('.custom-dates');
    const show = filterDraft.timeRange === 'custom';
    const height = dates.hidden ? 0 : dates.getBoundingClientRect().height;
    dates.getAnimations().forEach(animation => animation.cancel());
    if (show) dates.hidden = false;
    if (!height && !show) return;
    dates.inert = !show;
    dates.setAttribute('aria-hidden', String(!show));
    const animation = animate(dates, [
      { height: `${height}px`, opacity: height ? 1 : 0, marginTop: height ? '9px' : '0px' },
      { height: show ? `${dates.offsetHeight}px` : '0px', opacity: show ? 1 : 0, marginTop: show ? '9px' : '0px' }
    ], 200);
    const finish = () => { if (dates.isConnected && filterDraft) dates.hidden = filterDraft.timeRange !== 'custom'; };
    if (animation) animation.finished.then(finish, () => {}); else finish();
  }

  function toggleFilterPanel() {
    const panel = document.querySelector('#advanced-filters');
    advancedOpen = !advancedOpen;
    filterError = '';
    filterDraft = advancedOpen ? { ...filters, locations: [...filters.locations], categories: [...filters.categories] } : null;
    if (!panel?.animate) { render(); return; }
    const serial = ++filterMotionSerial;
    const opening = advancedOpen;
    const wasHidden = panel.hidden;
    const style = window.getComputedStyle(panel);
    const clip = wasHidden ? 'inset(0 0 100% 0)' : style.clipPath;
    const opacity = wasHidden ? 0 : Number(style.opacity);
    const followers = [...panel.parentElement.children].filter(node => node !== panel && (node.classList.contains('results-heading') || node.classList.contains('card-grid') || node.classList.contains('empty-state')));
    const positions = followers.map(node => node.getBoundingClientRect().top);
    panel.getAnimations().forEach(animation => animation.cancel());
    followers.forEach(node => node.getAnimations().forEach(animation => animation.cancel()));
    panel.hidden = false;
    panel.inert = !opening;
    panel.setAttribute('aria-hidden', String(!opening));
    if (opening) syncFilterDraft();
    const button = document.querySelector('[data-action="advanced-filters"]');
    button.setAttribute('aria-expanded', String(opening));
    const count = Boolean(filters.categories?.length || filters.locations?.length || filters.timeRange !== 'all' || filters.sort === 'oldest');
    button.classList.toggle('active', opening || count);
    const finalStyle = window.getComputedStyle(panel);
    const distance = panel.offsetHeight + parseFloat(finalStyle.marginTop || 0) + parseFloat(finalStyle.marginBottom || 0);
    const duration = opening ? 220 : 180;
    // Move existing content on the compositor instead of relaying it out each frame.
    followers.forEach((node, index) => {
      const delta = positions[index] - node.getBoundingClientRect().top;
      animate(node, [{ transform: `translateY(${delta}px)` }, { transform: `translateY(${opening ? 0 : -distance}px)` }], duration);
    });
    const animation = animate(panel, [
      { clipPath: clip === 'none' ? 'inset(0 0 0 0)' : clip, opacity },
      { clipPath: opening ? 'inset(0 0 0 0)' : 'inset(0 0 100% 0)', opacity: opening ? 1 : 0 }
    ], duration);
    const finish = () => {
      if (serial !== filterMotionSerial || !panel.isConnected) return;
      panel.hidden = !advancedOpen;
    };
    if (animation) animation.finished.then(finish, () => {}); else finish();
    button.focus({ preventScroll: true });
  }
  modal.addEventListener('submit', event => { if (backend && event.target.id === 'urgent-request-form') { event.preventDefault(); void submitAccountForm(event.target); } });
  modal.addEventListener('cancel', event => { event.preventDefault(); closeModal(); });
  modal.addEventListener('close', () => {
    document.body.classList.remove('modal-open');
    if (modalTrigger?.isConnected) modalTrigger.focus();
    else main.focus({ preventScroll: true });
  });
  modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });

  async function copyContact(item) {
    if (!item) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('unsupported');
      await navigator.clipboard.writeText(item.contact === '示例联系方式：campus_demo（非真实联系账号）' ? '微信：campus_demo' : item.contact);
      toast('联系方式已复制');
    } catch (_) {
      const contact = document.querySelector('#contact-text');
      if (contact) {
        const range = document.createRange(); range.selectNodeContents(contact);
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        contact.focus();
      }
      toast('请长按或选中联系方式复制', 'info');
    }
  }

  async function toggleFavorite(item, trigger) {
    const active = !state.favorites.includes(item.id);
    const next = { ...state, favorites: D.toggleFavorite(state.favorites, item.id) };
    if (backend) { requireLogin(); trigger.disabled = true; try { await API.request('PUT', `/favorites/${encodeURIComponent(item.id)}`, { active }); } finally { if (trigger.isConnected) trigger.disabled = false; } }
    else store.save(next);
    state = backend ? { ...state, favorites: active ? [...new Set([...state.favorites, item.id])] : state.favorites.filter(id => id !== item.id) } : next;
    const buttons = [...document.querySelectorAll('[data-action="favorite"]')].filter(button => button.dataset.id === item.id);
    buttons.forEach(button => {
      button.classList.toggle('is-favorite', active);
      button.setAttribute('aria-pressed', String(active));
      button.setAttribute('aria-label', `${active ? '取消收藏' : '收藏'}${item.name}`);
      const label = button.querySelector('.favorite-label');
      if (label) label.textContent = active ? '已收藏' : '收藏信息';
      button.closest('.item-card')?.classList.toggle('has-favorite', active);
      const mark = button.querySelector('.favorite-mark');
      favoriteMotions.get(mark)?.cancel();
      mark.querySelectorAll('.favorite-feedback').forEach(effect => effect.remove());
      if (!mark.animate || reducedMotion()) return;
      // Animate the wrapper only: CSS remains responsible for the heart's fill.
      const motion = mark.animate(active ? [
        { transform: 'scale(.85)' },
        { transform: 'scale(1.2)', offset: .4 },
        { transform: 'scale(1)' }
      ] : [
        { transform: 'scale(1)' },
        { transform: 'scale(.82)', offset: .4 },
        { transform: 'scale(1)' }
      ], { duration: active ? 300 : 220, easing: motionEase });
      favoriteMotions.set(mark, motion);
      const cleanup = () => { if (favoriteMotions.get(mark) === motion) favoriteMotions.delete(mark); };
      motion.finished.then(cleanup, cleanup);
      if (active) {
        const feedback = document.createElement('span');
        feedback.className = 'favorite-feedback';
        feedback.setAttribute('aria-hidden', 'true');
        mark.append(feedback);
        const ring = feedback.animate([
          { transform: 'scale(.7)', opacity: .55 },
          { transform: 'scale(1.55)', opacity: 0 }
        ], { duration: 420, easing: 'ease-out' });
        ring.finished.then(() => feedback.remove(), () => feedback.remove());
      }
    });
    const count = state.items.filter(post => state.favorites.includes(post.id)).length;
    const overview = document.querySelector('.account-overview:not(.public-profile) .account-stats>div:last-child strong');
    const tabCount = document.querySelector('[data-action="my-type"][data-value="saved"] span');
    if (overview) overview.textContent = count;
    if (tabCount) tabCount.textContent = count;
    toast(active ? '已收藏' : '已取消收藏');
    const savedList = (currentRoute.page === 'home' && filters.favoritesOnly) || (currentRoute.page === 'my' && myType === 'saved');
    if (!active && savedList) {
      const card = trigger.closest('.item-card');
      const animation = animate(card, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.97)' }], 160);
      if (animation) {
        card.inert = true;
        const finish = () => {
          if (!card.isConnected) return;
          render();
          const focusTarget = document.querySelector('.card-grid [data-action="favorite"]') || main;
          focusTarget.focus({ preventScroll: true });
        };
        animation.finished.then(finish, finish);
      } else { render(); main.focus({ preventScroll: true }); }
    }
  }

  document.addEventListener('click', async event => {
    if (event.target.id === 'keyword') showHistory(true);
    else if (!event.target.closest('.search-wrap')) showHistory(false);
    const trigger = event.target.closest('[data-action]');
    if (!trigger || trigger.disabled) return;
    const action = trigger.dataset.action;
    const id = trigger.dataset.id;
    const item = state.items.find(post => post.id === id);
    try {
      if (backend && await remoteAction(action, trigger, item)) return;
      switch (action) {
        case 'review-urgent': { const form = document.querySelector('#notice-form'); form.elements.itemId.value = id; form.elements.reward.value = trigger.dataset.value; form.scrollIntoView({ behavior: reducedMotion() ? 'instant' : 'smooth' }); form.elements.expiresAt.focus(); break; }
        case 'retry-server': void initializeRemote(); break;
        case 'login': returnAfterLogin = `detail/${encodeURIComponent(id)}`; navigate('login'); break;
        case 'download-recovery': {
          const url = URL.createObjectURL(new Blob([`校园失物招领账号恢复码\n账号：${trigger.dataset.account || state.user?.account || ''}\n恢复码：${trigger.dataset.value}\n`], { type: 'text/plain;charset=utf-8' }));
          const link = document.createElement('a'); link.href = url; link.download = '校园失物招领-恢复码.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); break;
        }
        case 'remove-image': pendingItemFile = null; if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = ''; } draft = { ...readForm(), image: 'assets/default-item.svg' }; render(); document.querySelector('#item-image')?.focus({ preventScroll: true }); break;
        case 'admin-delete': openModal(V.confirmation('删除这条发布？', '该信息及其收藏记录将被移除。', 'confirm-admin-delete', id, true)); break;
        case 'dismiss-toast': clearTimeout(toastTimer); toastEl.hidden = true; break;
        case 'type': filters.type = filters.type === trigger.dataset.value ? 'all' : trigger.dataset.value; render(); document.querySelector(`[data-action="type"][data-value="${trigger.dataset.value}"]`)?.focus(); break;
        case 'preference-sort':
          if (persist({ ...state, preferences: { saveSearchHistory: true, ...state.preferences, sort: trigger.dataset.value } }, '默认排序已保存')) {
            filters.sort = trigger.dataset.value; if (filterDraft) filterDraft.sort = trigger.dataset.value;
          }
          document.querySelector(`[data-action="preference-sort"][data-value="${trigger.dataset.value}"]`)?.focus(); break;
        case 'urgent-contact': openModal(V.urgentContact(state)); break;
        case 'notice-page': moveNotice(Number(trigger.dataset.value)); break;
        case 'notice-prev': moveNotice(noticeIndex() - 1); break;
        case 'notice-next': moveNotice(noticeIndex() + 1); break;
        case 'settings-clear-history': persist({ ...state, recentSearches: [] }, '搜索记录已清空'); break;
        case 'clear-favorites': openModal(V.confirmation('清空全部收藏？', '清空后需要重新收藏，已发布的信息会保留。', 'confirm-clear-favorites', '')); break;
        case 'confirm-clear-favorites': if (persist({ ...state, favorites: [] }, '收藏已清空')) closeModal(); break;
        case 'recent-keyword': search(trigger.dataset.value); break;
        case 'clear-history':
          if (persist({ ...state, recentSearches: [] })) document.querySelector('#keyword')?.focus();
          break;
        case 'advanced-filters': toggleFilterPanel(); break;
        case 'reset-pending': filterDraft = defaults(); filterError = ''; syncFilterDraft(); document.querySelector('[data-action="reset-pending"]')?.focus({ preventScroll: true }); break;
        case 'time-range': filterDraft.timeRange = trigger.dataset.value; filterError = ''; syncFilterDraft(); document.querySelector(`[data-action="time-range"][data-value="${trigger.dataset.value}"]`)?.focus({ preventScroll: true }); break;
        case 'my-status': myStatus = myStatus === 'completed' ? 'all' : 'completed'; render(); document.querySelector('[data-action="my-status"]')?.focus(); break;
        case 'clear-filters': filters = defaults(); advancedOpen = false; filterDraft = null; filterError = ''; navigate('home'); break;
        case 'favorites-filter': filters.favoritesOnly = !filters.favoritesOnly; render(); document.querySelector('[data-action="favorites-filter"]')?.focus(); break;
        case 'favorite':
          if (!item) throw new Error('这条信息已不存在');
          await toggleFavorite(item, trigger);
          break;
        case 'my-type': myType = trigger.dataset.value; render(); break;
        case 'set-type':
          if (currentRoute.page === 'edit') return;
          draft = { ...readForm(), type: trigger.dataset.value };
          if (draft.type === 'found') { draft.locationGroup = draft.locationGroups?.[0] || ''; draft.locationGroups = draft.locationGroup ? [draft.locationGroup] : []; }
          errors = {}; render(); break;
        case 'edit': navigate(`edit/${encodeURIComponent(id)}`); break;
        case 'copy': void copyContact(item); break;
        case 'close-modal': closeModal(); break;
        case 'complete':
          if (!item || item.ownerId !== ownerId) throw new Error('只能管理本人发布的信息');
          openModal(V.confirmation(item.type === 'lost' ? '物品已经找到了？' : '物品已经归还了？', `“${item.name}”将标记为${item.type === 'lost' ? '已找到' : '已归还'}。之后可以在“我的发布”中恢复。`, 'confirm-complete', id));
          break;
        case 'confirm-complete': {
          const next = { ...state, items: D.completeItem(state.items, id, ownerId) };
          if (persist(next, item?.type === 'lost' ? '已标记为找到' : '已标记为归还')) closeModal();
          break;
        }
        case 'reopen':
          if (!item || item.ownerId !== ownerId) throw new Error('只能管理本人发布的信息');
          openModal(V.confirmation(item.type === 'lost' ? '取消已找到状态？' : '取消已归还状态？', `“${item.name}”将恢复为${item.type === 'lost' ? '寻找中' : '待认领'}。`, 'confirm-reopen', id));
          break;
        case 'confirm-reopen': {
          const next = { ...state, items: D.reopenItem(state.items, id, ownerId) };
          if (persist(next, item?.type === 'lost' ? '已恢复为寻找中' : '已恢复为待认领')) closeModal();
          break;
        }
        case 'delete':
          if (!item || item.ownerId !== ownerId) throw new Error('只能管理本人发布的信息');
          openModal(V.confirmation('删除这条信息？', `“${item.name}”及其收藏记录将被移除，删除后无法恢复。`, 'confirm-delete', id, true));
          break;
        case 'confirm-delete': {
          const next = { ...state, items: D.deleteItem(state.items, id, ownerId), favorites: state.favorites.filter(saved => saved !== id) };
          if (persist(next, '信息已删除')) closeModal();
          break;
        }
        case 'reset':
          openModal(V.confirmation('确认重置数据？', '发布、收藏、搜索记录和设置将恢复初始状态。此操作无法撤销。', 'confirm-reset', '', true));
          break;
        case 'confirm-reset':
          state = store.reset(); warningText = ''; filters = defaults(); advancedOpen = false; filterDraft = null; filterError = ''; myType = 'all'; myStatus = 'all'; draft = { type: 'lost' }; errors = {}; editingId = null;
          closeModal(); navigate('home'); toast('数据已重置'); break;
      }
    } catch (error) { if (backend) await remoteError(error).catch(loginError => toast(loginError.message, 'error')); else toast(error.message, 'error'); }
  });

  function noticeIndex() {
    const track = document.querySelector('#urgent-track');
    return track ? Math.round(track.scrollLeft / track.clientWidth) : 0;
  }
  function moveNotice(index) {
    const track = document.querySelector('#urgent-track');
    if (!track || !track.querySelector('.urgent-slide')) return;
    const count = track.children.length;
    track.scrollTo({ left: ((index + count) % count) * track.clientWidth, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  main.addEventListener('scroll', event => {
    if (event.target.id !== 'urgent-track') return;
    const index = noticeIndex();
    document.querySelectorAll('[data-action="notice-page"]').forEach((button, i) => {
      button.classList.toggle('active', i === index); button.setAttribute('aria-pressed', String(i === index));
    });
    document.querySelector('#notice-count').textContent = `${index + 1} / ${event.target.children.length}`;
  }, true);
  main.addEventListener('keydown', event => {
    if (event.target.id === 'urgent-track' && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault(); moveNotice(noticeIndex() + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });
  function syncItemImage() {
    const editor = document.querySelector('#item-image-editor'); if (!editor || !pendingItemFile) return;
    editor.classList.add('has-image'); editor.querySelector('#item-preview').src = previewUrl;
    editor.querySelector('[data-action="remove-image"]').hidden = false;
    editor.querySelector('#item-image-filename').textContent = pendingItemFile.name;
  }
  function selectItemImage(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast('请选择不超过 5 MB 的 JPG、PNG 或 WebP 图片', 'error'); return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file); pendingItemFile = file; syncItemImage();
  }
  main.addEventListener('dragover', event => {
    const zone = event.target.closest('.item-image-zone'); if (!zone) return;
    event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; zone.classList.add('drag-over');
  });
  main.addEventListener('dragleave', event => {
    const zone = event.target.closest('.item-image-zone');
    if (zone && !zone.contains(event.relatedTarget)) zone.classList.remove('drag-over');
  });
  main.addEventListener('drop', event => {
    const zone = event.target.closest('.item-image-zone'); if (!zone) return;
    event.preventDefault(); zone.classList.remove('drag-over');
    if (event.dataTransfer.files.length > 1) { toast('每条信息请选择一张物品图片', 'error'); return; }
    selectItemImage(event.dataTransfer.files[0]);
  });
  main.addEventListener('change', async event => {
    if (['item-image', 'avatar-file'].includes(event.target.id)) {
      const file = event.target.files[0]; if (!file) return;
      if (event.target.id === 'item-image') { selectItemImage(file); event.target.value = ''; return; }
      if (file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { toast('请选择不超过 5 MB 的 JPG、PNG 或 WebP 图片', 'error'); event.target.value = ''; return; }
      if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = URL.createObjectURL(file);
      { pendingAvatarFile = file; const old = document.querySelector('#profile-form .user-avatar'); const image = document.createElement('img'); image.className = 'user-avatar'; image.alt = '头像预览'; image.src = previewUrl; old.replaceWith(image); }
      return;
    }
    if (event.target.id === 'timePrecision') {
      const nextPrecision = event.target.value;
      draft = readForm(); draft.timePrecision = nextPrecision;
      draft.occurredAt = nextPrecision === 'date' ? (draft.occurredAt || '').slice(0, 10) : nextPrecision === 'unknown' || (draft.occurredAt || '').length === 10 ? '' : draft.occurredAt;
      errors = {}; render(); document.querySelector('#timePrecision')?.focus(); return;
    }
    if (event.target.matches('[data-multi]')) {
      const group = event.target.dataset.multi;
      filterDraft[group] = [...document.querySelectorAll(`[data-multi="${group}"]:checked`)].map(input => input.value);
      return;
    }
    if (event.target.matches('[data-pending]')) {
      filterDraft[event.target.dataset.pending] = event.target.value;
      filterError = ''; const error = document.querySelector('#filter-error'); if (error) error.hidden = true;
      return;
    }

    if (event.target.matches('[data-preference]')) {
      const name = event.target.dataset.preference;
      const value = name === 'saveSearchHistory' ? event.target.checked : event.target.value;
      const preferences = { sort: 'newest', saveSearchHistory: true, ...state.preferences, [name]: value };
      if (backend) { try { requireLogin(); await API.request('PATCH', '/me/preferences', { [name]: value }); await refreshRemote(); toast('设置已保存'); } catch (error) { toast(error.message, 'error'); } return; }
      if (persist({ ...state, preferences }, '设置已保存')) {
        if (name === 'sort') { filters.sort = value; if (filterDraft) filterDraft.sort = value; }
      }
      document.querySelector(`[data-preference="${name}"]`)?.focus();
      return;
    }

  });

  main.addEventListener('submit', async event => {
    event.preventDefault();
    if (backend && ['auth-form', 'profile-form', 'password-form', 'notice-form'].includes(event.target.id)) {
      await submitAccountForm(event.target); return;
    }
    if (event.target.id === 'advanced-filters') {
      filterError = D.validateFilters(filterDraft);
      if (filterError) { render(); document.querySelector('[data-pending="dateStart"]')?.focus(); return; }
      const { locations, categories, timeRange, dateStart, dateEnd, sort } = filterDraft;
      filters = { ...filters, locations: [...locations], categories: [...categories], timeRange, dateStart, dateEnd, sort };
      advancedOpen = true; filterDraft = { ...filters, locations: [...locations], categories: [...categories] }; render();
      document.querySelector('#advanced-filters button[type="submit"]')?.focus({ preventScroll: true }); return;
    }
    if (event.target.id === 'search-form') {
      search(new FormData(event.target).get('keyword'));
      return;
    }
    if (event.target.id !== 'publish-form' || submitting) return;
    draft = readForm();
    errors = D.validateItem(draft);
    if (Object.keys(errors).length) {
      render(); document.getElementById(Object.keys(errors)[0])?.focus(); return;
    }
    submitting = true;
    const submit = event.target.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      if (backend) {
        requireLogin(); if (pendingItemFile) draft.image = await API.upload(pendingItemFile);
        const edit = currentRoute.page === 'edit';
        const record = await API.request(edit ? 'PATCH' : 'POST', edit ? `/items/${encodeURIComponent(currentRoute.id)}` : '/items', { ...draft, ...(edit ? { version: state.items.find(post => post.id === currentRoute.id)?.version } : {}) });
        await refreshRemote(false); myType = myStatus = 'all'; draft = { type: 'lost' }; errors = {}; editingId = null; pendingItemFile = null;
        navigate(edit ? 'my' : `success/${encodeURIComponent(record.id)}`); if (edit) toast('修改已保存'); return;
      }
      if (currentRoute.page === 'edit') {
        const next = { ...state, items: D.updateItem(state.items, currentRoute.id, draft, ownerId) };
        if (persist(next, '修改已保存', 'my')) { myType = 'all'; myStatus = 'all'; draft = { type: 'lost' }; editingId = null; }
      } else {
        const record = { ...D.createItem(draft, ownerId), ownerName: '我', isDemo: false };
        const next = { ...state, items: [record, ...state.items] };
        if (persist(next, '', `success/${encodeURIComponent(record.id)}`)) { myType = 'all'; myStatus = 'all'; draft = { type: 'lost' }; errors = {}; }
      }
    } catch (error) { if (backend) { errors = error.fields || {}; if (Object.keys(errors).length) render(); await remoteError(error).catch(() => {}); } else toast(error.message, 'error'); }
    finally { submitting = false; if (submit.isConnected) submit.disabled = false; }
  });
  main.addEventListener('focusin', event => {
    if (event.target.id === 'keyword') showHistory(true);
  });
  main.addEventListener('focusout', event => {
    if (event.target.closest('.search-wrap') && !event.relatedTarget?.closest('.search-wrap')) showHistory(false);
  });
  main.addEventListener('keydown', event => {
    if (event.key === 'Escape' && event.target.closest('.search-wrap')) showHistory(false);
  });
  main.addEventListener('input', event => {
    const field = event.target.closest('.form-field');
    if (field?.classList.contains('has-error')) {
      field.classList.remove('has-error');
      event.target.removeAttribute('aria-invalid');
      field.querySelector('.field-error').hidden = true;
      delete errors[event.target.name];
    }
  });
  window.addEventListener('hashchange', async () => {
    if (backend && backendReady && ['home', 'my', 'detail', 'user', 'success', 'admin'].includes(route().page)) {
      main.innerHTML = '<section class="empty-state"><h2>正在载入</h2></section>';
      try { await refreshRemote(); } catch (error) { render(); toast(error.message, 'error'); }
    } else render();
  });
  render();
  if (backend) {
    void initializeRemote();
    window.addEventListener('focus', () => { if (backendReady && ['home', 'my', 'detail', 'user'].includes(route().page)) void refreshRemote().catch(error => toast(error.message, 'error')); });
  }
})();
