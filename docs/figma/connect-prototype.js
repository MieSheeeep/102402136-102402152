// Run after prototype-builder.js, on the same Figma page.
await figma.loadFontAsync({ family: 'Noto Sans SC', style: 'Regular' });
await figma.loadFontAsync({ family: 'Noto Sans SC', style: 'Medium' });
const page = figma.currentPage;
const changed = [], created = [];
const screens = page.children.filter(n => n.type === 'FRAME' && n.name !== '基础组件');
const targets = Object.fromEntries(screens.map(n => [n.name, n.id]));
for (const component of page.findAllWithCriteria({ types: ['COMPONENT'] })) {
  if (component.name.startsWith('按钮/')) {
    component.counterAxisAlignItems = 'CENTER';
    component.primaryAxisAlignItems = 'CENTER';
    changed.push(component.id);
  }
}
for (const screen of screens) {
  for (const node of screen.findAllWithCriteria({ types: ['FRAME'] })) {
    if (node.name === '公告入口') {
      const button = node.children.find(c => c.type === 'INSTANCE');
      if (button) {
        button.resize(210, 24); button.paddingTop = 2; button.paddingBottom = 2;
        button.fills = []; button.strokes = []; changed.push(button.id);
      }
    }
    if (node.name === '公告分页') {
      node.counterAxisAlignItems = 'CENTER';
      for (const button of node.children.filter(c => c.type === 'INSTANCE')) {
        button.resize(64, 24); button.paddingTop = 2; button.paddingBottom = 2;
        changed.push(button.id);
      }
      changed.push(node.id);
    }
    if (node.name === '筛选面板' && !node.children.some(c => c.name === '筛选选项滚动区')) {
      const operations = node.children.find(c => c.name === '筛选操作');
      const scroll = figma.createFrame(); scroll.name = '筛选选项滚动区';
      scroll.resize(334, 190); scroll.fills = []; scroll.clipsContent = true;
      scroll.overflowDirection = 'VERTICAL';
      const inner = figma.createAutoLayout(); inner.name = '全部筛选选项'; inner.layoutMode = 'VERTICAL';
      inner.resize(334, 40); inner.primaryAxisSizingMode = 'AUTO';
      inner.counterAxisSizingMode = 'FIXED'; inner.itemSpacing = 12;
      inner.fills = []; inner.clipsContent = false; scroll.appendChild(inner);
      for (const child of [...node.children]) if (child !== operations) inner.appendChild(child);
      node.insertChild(0, scroll); created.push(scroll.id, inner.id); changed.push(node.id);
    }
  }
  for (const node of screen.findAll(n => n.name.includes(' → '))) {
    const destination = targets[node.name.split(' → ').pop()];
    if (!destination || destination === screen.id) continue;
    await node.setReactionsAsync([{
      trigger: { type: 'ON_CLICK' },
      actions: [{ type: 'NODE', destinationId: destination, navigation: 'NAVIGATE',
        transition: { type: 'DISSOLVE', duration: 0.18, easing: { type: 'EASE_OUT' } },
        resetScrollPosition: true }]
    }]);
    changed.push(node.id);
  }
}
page.flowStartingPoints = [
  { nodeId: targets['首页'], name: '校园失物招领' },
  { nodeId: targets['发布寻物'], name: '发布信息' },
  { nodeId: targets['我的'], name: '个人中心' }
];
changed.push(page.id);
return { createdNodeIds: created, mutatedNodeIds: changed, screenCount: screens.length,
  flowStartingPoints: page.flowStartingPoints };
