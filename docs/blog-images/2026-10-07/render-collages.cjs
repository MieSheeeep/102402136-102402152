// 拼接真实浏览器截图，只做裁切、等比例缩放及图外标注。
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const base = __dirname;
const groups = [
  { name: '01-overview', title: '主要页面', subtitle: '首页、发布和我的', shots: [['home.jpg', '① 首页：公告与物品列表'], ['publish.jpg', '② 发布：选择类型与填写信息'], ['my.jpg', '③ 我的：统计与管理入口']] },
  { name: '02-search', title: '名称搜索', subtitle: '有结果与无结果，两种情况都展示', shots: [['search-result.jpg', '① 搜索雨伞：显示匹配信息'], ['search-empty.jpg', '② 搜索紫色滑板：无匹配提示']] },
  { name: '03-publish', title: '发布信息', subtitle: '分段展示长表单，按填写顺序查看', shots: [['publish.jpg', '① 类型、名称和分类'], ['publish-time.jpg', '② 可能区域、地点和事件时间'], ['publish-full.jpg', '③ 联系方式、图片和描述', { left: 0, top: 900, width: 466, height: 847 }]] },
  { name: '04-status', title: '本人管理与完成状态', subtitle: '已归还用文字和配色区分，取消前再次确认', shots: [['my.jpg', '① 我的发布与管理入口'], ['completed-list.jpg', '② 已完成筛选：只显示已归还'], ['reopen-confirm.jpg', '③ 取消已归还：确认弹窗']] },
  { name: '05-filter', title: '更多筛选', subtitle: '面板内滚动，应用后保持展开', shots: [['filter-expanded.jpg', '① 展开地点和物品分类'], ['filter-dates.jpg', '② 自定义日期范围与筛选结果']] },
  { name: '06-contact-favorite', title: '查看、联系与收藏', subtitle: '打开详情查看时间地点，复制联系方式，收藏后再查看', shots: [['detail.jpg', '① 详情：发布者、时间与地点'], ['detail-contact.jpg', '② 联系发布者与复制入口'], ['favorite-list.jpg', '③ 我的收藏：保留物品信息']] },
  { name: '07-profile-settings', title: '个人主页与设置', subtitle: '公开资料、本人资料编辑与浏览偏好', shots: [['public-profile.jpg', '① 公开主页与发布统计'], ['settings.jpg', '② 修改昵称、头像和校区'], ['settings-preferences.jpg', '③ 浏览偏好与数据管理']] },
  { name: '08-notices', title: '紧急寻物公告', subtitle: '三条公告依次展示，核心信息为物品、时间、地点和酬谢', short: true, shots: [['home.jpg', '① 黑色长柄雨伞', { left: 0, top: 70, width: 480, height: 190 }], ['notice-2.jpg', '② 高等数学课本', { left: 0, top: 65, width: 467, height: 185 }], ['notice-3.jpg', '③ 黑色U盘', { left: 0, top: 65, width: 467, height: 185 }]] },
];
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
const label = (x, y, value, size = 23, color = '#294237') => `<text x="${x}" y="${y}" fill="${color}" font-family="Microsoft YaHei, sans-serif" font-size="${size}">${escape(value)}</text>`;
(async () => {
  const used = [];
  for (const group of groups) {
    const gap = 28, margin = 28, panelW = 480;
    const panelH = group.short ? 200 : 872;
    const width = margin * 2 + panelW * group.shots.length + gap * (group.shots.length - 1);
    const height = 157 + panelH + 33;
    let labels = label(margin, 46, group.title, 32) + label(margin, 84, group.subtitle, 21, '#61766a');
    const layers = [];
    for (let i = 0; i < group.shots.length; i++) {
      const [filename, caption, crop] = group.shots[i];
      const left = margin + (panelW + gap) * i;
      labels += label(left, 127, caption, 21);
      let input = sharp(path.join(base, filename));
      if (crop) {
        const metadata = await sharp(path.join(base, filename)).metadata();
        input = input.extract({ ...crop, width: Math.min(crop.width, metadata.width), height: Math.min(crop.height, metadata.height - crop.top) });
      }
      const image = await input.resize(panelW, panelH, { fit: 'contain', background: '#ffffff' }).png().toBuffer();
      layers.push({ input: image, left, top: 157 });
      used.push(filename);
    }
    layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${labels}</svg>`), left: 0, top: 0 });
    await sharp({ create: { width, height, channels: 3, background: '#f3f6f1' } }).composite(layers).jpeg({ quality: 94, chromaSubsampling: '4:4:4' }).toFile(path.join(base, `${group.name}.jpg`));
  }
  fs.writeFileSync(path.join(base, 'collages.json'), JSON.stringify(groups, null, 2) + '\n');
  console.log(`完成 ${groups.length} 组横向拼图，${used.length} 个页面视图。`);
})();
