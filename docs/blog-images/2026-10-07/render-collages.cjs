// 按功能横排3—4页，等高排列，仅缩小原图，输出PNG。
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const base = __dirname;
const groups = [
  { name: '01-overview', title: '主要页面', subtitle: '首页、发布和我的', shots: [['home.jpg', '① 首页：公告与物品列表'], ['publish.jpg', '② 发布：选择类型与填写信息'], ['my.jpg', '③ 我的：统计与管理入口']] },
  { name: '02-search', title: '名称搜索', subtitle: '从首页搜索，到匹配结果与无结果提示', shots: [['home.jpg', '① 首页搜索入口'], ['search-result.jpg', '② 搜索雨伞'], ['search-empty.jpg', '③ 搜索无结果']] },
  { name: '03-publish', title: '发布信息', subtitle: '分段展示长表单，按填写顺序查看', shots: [['publish.jpg', '① 类型、名称和分类'], ['publish-time.jpg', '② 可能区域、地点和事件时间'], ['publish-full.jpg', '③ 联系方式、图片和描述', { left: 0, top: 900, width: 466, height: 847 }]] },
  { name: '04-status', title: '本人管理与完成状态', subtitle: '已归还用文字和配色区分，取消前再次确认', shots: [['my.jpg', '① 我的发布与管理入口'], ['completed-list.jpg', '② 已完成筛选：只显示已归还'], ['reopen-confirm.jpg', '③ 取消已归还：确认弹窗']] },
  { name: '05-filter', title: '更多筛选', subtitle: '展开选项、限定日期，再查看列表结果', shots: [['filter-expanded.jpg', '① 地点与分类'], ['filter-dates.jpg', '② 自定义日期范围'], ['search-result.jpg', '③ 结合名称查看结果']] },
  { name: '06-contact-favorite', title: '查看、联系与收藏', subtitle: '打开详情查看时间地点，复制联系方式，收藏后再查看', shots: [['detail.jpg', '① 详情：发布者、时间与地点'], ['detail-contact.jpg', '② 联系发布者与复制入口'], ['favorite-list.jpg', '③ 我的收藏：保留物品信息']] },
  { name: '07-profile-settings', title: '个人主页与设置', subtitle: '个人概况、公开主页、资料编辑和浏览偏好', shots: [['my.jpg', '① 个人概况'], ['public-profile.jpg', '② 公开主页'], ['settings.jpg', '③ 资料编辑'], ['settings-preferences.jpg', '④ 浏览偏好']] },
  { name: '08-notices', title: '紧急寻物公告', subtitle: '三条公告依次展示，核心信息为物品、时间、地点和酬谢', short: true, shots: [['home.jpg', '① 黑色长柄雨伞', { left: 0, top: 70, width: 480, height: 190 }], ['notice-2.jpg', '② 高等数学课本', { left: 0, top: 65, width: 467, height: 185 }], ['notice-3.jpg', '③ 黑色U盘', { left: 0, top: 65, width: 467, height: 185 }]] },
  { name: '09-color-hints', title: '颜色提示', subtitle: '寻物、招领和已完成分别用不同配色，同时保留文字状态', shots: [['home.jpg', '① 寻物：暖棕色'], ['my.jpg', '② 招领：浅绿色'], ['completed-list.jpg', '③ 已完成：灰蓝色']] },
  { name: '10-favorite-focus', title: '收藏', subtitle: '同一条U盘信息：空心爱心与收藏后的粉色标记', shots: [['home.jpg', '① 未收藏', { left: 20, top: 425, width: 442, height: 163 }], ['favorite-list.jpg', '② 我的收藏', { left: 20, top: 395, width: 425, height: 305 }]] },
  { name: '11-notice-focus', title: '紧急公告栏', subtitle: '切换三条急寻信息，查看物品、丢失时间、地点和酬谢', shots: [['home.jpg', '① 雨伞 · 酬谢30元', { left: 20, top: 90, width: 442, height: 160 }], ['notice-2.jpg', '② 课本 · 酬谢20元', { left: 18, top: 85, width: 420, height: 160 }], ['notice-3.jpg', '③ U盘 · 酬谢50元', { left: 18, top: 85, width: 420, height: 160 }]] },
  { name: '12-color-focus', title: '卡片配色', subtitle: '直接对照三种卡片的底色和状态文字', shots: [['home.jpg', '① 寻物 · 寻找中', { left: 20, top: 425, width: 442, height: 163 }], ['my.jpg', '② 招领 · 待认领', { left: 32, top: 510, width: 420, height: 285 }], ['completed-list.jpg', '③ 招领 · 已归还', { left: 30, top: 500, width: 390, height: 270 }]] },
];
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
const label = (x, y, value, size = 14, color = '#294237') => `<text x="${x}" y="${y}" fill="${color}" font-family="Microsoft YaHei, sans-serif" font-size="${size}">${escape(value)}</text>`;
(async () => {
  const outputs = [];
  for (const group of groups) {
    const parts = [];
    for (let offset = 0; offset < group.shots.length; offset += 4) parts.push(group.shots.slice(offset, offset + 4));
    for (let part = 0; part < parts.length; part++) {
      const shots = parts[part];
      const margin = 16, gap = 16;
      const images = [];
      for (const [filename, caption, crop] of shots) {
        const metadata = await sharp(path.join(base, filename)).metadata();
        let input = sharp(path.join(base, filename));
        let width = metadata.width, height = metadata.height;
        if (crop) {
          width = Math.min(crop.width, metadata.width - crop.left);
          height = Math.min(crop.height, metadata.height - crop.top);
          input = input.extract({ ...crop, width, height });
        }
        const scale = Math.min(1, (group.short ? 160 : 600) / height);
        const displayW = Math.round(width * scale), displayH = Math.round(height * scale);
        if (scale < 1) input = input.resize(displayW, displayH, { kernel: 'lanczos3' });
        images.push({ filename, caption, width: displayW, height: displayH, input: await input.png().toBuffer() });
      }
      const panelW = Math.max(...images.map(i => i.width));
      const width = margin * 2 + panelW * shots.length + gap * (shots.length - 1);
      const textLimit = Math.floor((width - margin * 2) / 13);
      const subtitleLines = group.subtitle.match(new RegExp(`.{1,${textLimit}}`, 'gu')) || [];
      const imageTop = 79 + subtitleLines.length * 18;
      const height = imageTop + Math.max(...images.map(i => i.height)) + margin;
      const title = group.title + (parts.length > 1 ? `（${part + 1}/${parts.length}）` : '');
      let labels = label(margin, 32, title, 22);
      subtitleLines.forEach((line, index) => { labels += label(margin, 56 + index * 18, line, 13, '#61766a'); });
      const layers = images.map((image, i) => {
        const left = margin + (panelW + gap) * i;
        const conciseCaption = image.caption.replace(/：.*$/, '').replace('发布：选择类型与填写信息', '发布页').replace('首页：公告与物品列表', '首页');
        labels += label(left, imageTop - 12, conciseCaption, 14);
        return { input: image.input, left: left + Math.floor((panelW - image.width) / 2), top: imageTop };
      });
      layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${labels}</svg>`), left: 0, top: 0 });
      const filename = `${group.name}${parts.length > 1 ? '-' + String.fromCharCode(97 + part) : ''}.png`;
      await sharp({ create: { width, height, channels: 3, background: '#f3f6f1' } }).composite(layers).png({ compressionLevel: 9 }).toFile(path.join(base, filename));
      outputs.push({ filename, width, height, displayWidth: Math.min(width, 760), title, shots: images.map(({ filename, caption }) => ({ filename, caption })) });
    }
  }
  fs.writeFileSync(path.join(base, 'collages.json'), JSON.stringify({ series: groups, outputs }, null, 2) + '\n');
  console.log(`完成 ${groups.length} 张紧凑横向拼图，共${groups.reduce((sum, g) => sum + g.shots.length, 0)}个页面视图。`);
})();
