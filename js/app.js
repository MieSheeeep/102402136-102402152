(function () {
  'use strict';
  const D = window.CampusData;
  const V = window.CampusViews;
  const ownerId = 'me';
  const main = document.querySelector('#main');
  const modal = document.querySelector('#modal');
  const toastEl = document.querySelector('#toast');
  const warning = document.querySelector('#storage-warning');
  let state;
  const defaults = () => ({ keyword: '', type: 'all', locations: [], categories: [], timeRange: 'all', dateStart: '', dateEnd: '', sort: state?.preferences?.sort || 'newest', favoritesOnly: false });
  let filters = defaults();
  let advancedOpen = false;
  let filterDraft = null;
  let filterError = '';
  let myStatus = 'all';
  let myType = 'all';
  let draft = { type: 'lost', name: '', category: '', locationGroup: '', locationDetail: '', occurredAt: '', contact: '', description: '' };
  let editingId = null;
  let errors = {};
  let toastTimer;
  let submitting = false;
  let modalTrigger;
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
  try { state = store.load(); state = window.CampusSeed.upgrade(state); store.save(state); }
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
    return { page: ['home', 'publish', 'my', 'detail', 'edit', 'success', 'settings'].includes(parts[0]) ? parts[0] : 'home', id };
  }

  function readForm() {
    const form = document.querySelector('#publish-form');
    if (!form) return draft;
    const values = new FormData(form);
    const next = Object.fromEntries(values);
    next.locationGroups = next.type === 'lost' ? values.getAll('locationGroups') : [next.locationGroup];
    return next;
  }

  function navigate(path) {
    if (location.hash === `#${path}`) render();
    else location.hash = path;
  }

  function render() {
    const oldPanel = document.querySelector('#advanced-filters');
    const wasOpen = oldPanel && !oldPanel.hidden;
    const oldList = document.querySelector('.card-grid')?.innerHTML;
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
    const titles = { home: '寻物广场', publish: '发布信息', my: '我的', detail: '信息详情', edit: '编辑信息', success: '发布成功', settings: '设置' };
    document.title = `${titles[currentRoute.page]} · 校园失物招领`;
    switch (currentRoute.page) {
      case 'settings': main.innerHTML = V.settings(state); break;
      case 'my': main.innerHTML = V.my(state, myType, ownerId, myStatus); break;
      case 'detail': main.innerHTML = V.detail(item, state.favorites, ownerId); break;
      case 'edit':
        if (!item || item.ownerId !== ownerId) {
          main.innerHTML = V.detail(item, state.favorites, ownerId);
          toast(item ? '只能编辑本人发布的信息' : '这条信息已不存在', 'error');
        } else {
          if (editingId !== item.id || changed) { draft = { ...item }; errors = {}; editingId = item.id; }
          main.innerHTML = V.form(draft, errors, true);
        }
        break;
      case 'publish':
        if (editingId) { draft = { type: 'lost' }; editingId = null; errors = {}; }
        main.innerHTML = V.form(draft, errors);
        break;
      case 'success': main.innerHTML = item ? V.success(item) : V.detail(null, state.favorites, ownerId); break;
      default: main.innerHTML = V.home(state, filters, { advancedOpen, filterDraft, filterError });
    }
    const scrollArea = document.querySelector('#filter-scroll');
    if (scrollArea && !changed) scrollArea.scrollTop = filterScroll;
    showWarning();
    if (changed) { window.scrollTo({ top: 0, behavior: 'instant' }); main.focus({ preventScroll: true }); }
    if (changed) {
      animate(main, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], 280);
    } else {
      const panel = document.querySelector('#advanced-filters');
      if (panel?.animate && !reducedMotion()) {
        if (!wasOpen && !panel.hidden) {
          animate(panel, [{ height: '0px', opacity: 0 }, { height: `${panel.offsetHeight}px`, opacity: 1 }], 280);
        } else if (wasOpen && panel.hidden) {
          // Preserve the outgoing panel while the new state is already closed.
          const outgoing = oldPanel.cloneNode(true);
          outgoing.inert = true;
          outgoing.setAttribute('aria-hidden', 'true');
          panel.replaceWith(outgoing);
          const height = outgoing.offsetHeight;
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
      try { store.save(next); state = next; }
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

  document.addEventListener('click', event => {
    if (event.target.id === 'keyword') showHistory(true);
    else if (!event.target.closest('.search-wrap')) showHistory(false);
    const trigger = event.target.closest('[data-action]');
    if (!trigger || trigger.disabled) return;
    const action = trigger.dataset.action;
    const id = trigger.dataset.id;
    const item = state.items.find(post => post.id === id);
    try {
      switch (action) {
        case 'dismiss-toast': clearTimeout(toastTimer); toastEl.hidden = true; break;
        case 'type': filters.type = filters.type === trigger.dataset.value ? 'all' : trigger.dataset.value; render(); document.querySelector(`[data-action="type"][data-value="${trigger.dataset.value}"]`)?.focus(); break;
        case 'preference-sort':
          if (persist({ ...state, preferences: { saveSearchHistory: true, ...state.preferences, sort: trigger.dataset.value } }, '默认排序已保存')) {
            filters.sort = trigger.dataset.value; if (filterDraft) filterDraft.sort = trigger.dataset.value;
          }
          document.querySelector(`[data-action="preference-sort"][data-value="${trigger.dataset.value}"]`)?.focus(); break;
        case 'urgent-contact': openModal(V.urgentContact()); break;
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
        case 'advanced-filters':
          advancedOpen = !advancedOpen; filterError = '';
          filterDraft = advancedOpen ? { ...filters, locations: [...filters.locations], categories: [...filters.categories] } : null;
          render(); document.querySelector('[data-action="advanced-filters"]')?.focus(); break;
        case 'reset-pending': filterDraft = defaults(); filterError = ''; render(); document.querySelector('[data-action="reset-pending"]')?.focus(); break;
        case 'time-range': filterDraft.timeRange = trigger.dataset.value; filterError = ''; render(); document.querySelector(`[data-action="time-range"][data-value="${trigger.dataset.value}"]`)?.focus(); break;
        case 'my-status': myStatus = myStatus === 'completed' ? 'all' : 'completed'; render(); document.querySelector('[data-action="my-status"]')?.focus(); break;
        case 'clear-filters': filters = defaults(); advancedOpen = false; filterDraft = null; filterError = ''; navigate('home'); break;
        case 'favorites-filter': filters.favoritesOnly = !filters.favoritesOnly; render(); document.querySelector('[data-action="favorites-filter"]')?.focus(); break;
        case 'favorite':
          if (!item) throw new Error('这条信息已不存在');
          persist({ ...state, favorites: D.toggleFavorite(state.favorites, id) }, state.favorites.includes(id) ? '已取消收藏' : '已收藏，可在“我的”中查看');
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
    } catch (error) { toast(error.message, 'error'); }
  });

  function noticeIndex() {
    const track = document.querySelector('#urgent-track');
    return track ? Math.round(track.scrollLeft / track.clientWidth) : 0;
  }
  function moveNotice(index) {
    const track = document.querySelector('#urgent-track');
    if (!track) return;
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
  main.addEventListener('change', event => {
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
      if (persist({ ...state, preferences }, '设置已保存')) {
        if (name === 'sort') { filters.sort = value; if (filterDraft) filterDraft.sort = value; }
      }
      document.querySelector(`[data-preference="${name}"]`)?.focus();
      return;
    }

  });

  main.addEventListener('submit', event => {
    event.preventDefault();
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
      if (currentRoute.page === 'edit') {
        const next = { ...state, items: D.updateItem(state.items, currentRoute.id, draft, ownerId) };
        if (persist(next, '修改已保存', 'my')) { myType = 'all'; myStatus = 'all'; draft = { type: 'lost' }; editingId = null; }
      } else {
        const record = { ...D.createItem(draft, ownerId), ownerName: '我', isDemo: false };
        const next = { ...state, items: [record, ...state.items] };
        if (persist(next, '', `success/${encodeURIComponent(record.id)}`)) { myType = 'all'; myStatus = 'all'; draft = { type: 'lost' }; errors = {}; }
      }
    } catch (error) { toast(error.message, 'error'); }
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
  window.addEventListener('hashchange', render);
  render();
})();
