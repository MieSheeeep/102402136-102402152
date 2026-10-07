const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const font = 'Microsoft YaHei, sans-serif';
const text = (x, y, words, size = 22, color = '#293c34', anchor = 'middle') => `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" fill="${color}" text-anchor="${anchor}">${words}</text>`;
const box = (x, y, w, h, lines, fill = '#edf3ee') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${fill}" stroke="#c9d7ce"/>${lines.map((line, i) => text(x + w / 2, y + h / 2 - (lines.length - 1) * 16 + i * 32 + 7, line)).join('')}`;
const arrow = (x1, y1, x2, y2) => `<path d="M${x1},${y1} L${x2},${y2}" fill="none" stroke="#678577" stroke-width="3" marker-end="url(#arrow)"/>`;
const svg = (w, h, content) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="#678577"/></marker></defs><rect width="100%" height="100%" fill="#fafbf8"/>${content}</svg>`;
const flow = svg(1000, 1050,
  text(500, 52, '校园失物招领 · 核心流程', 30) +
  box(260, 88, 480, 84, ['发布者填写寻物／招领信息']) +
  arrow(500, 172, 500, 220) +
  box(260, 220, 480, 92, ['检查名称、地点、时间、联系方式']) +
  arrow(740, 266, 790, 266) + box(790, 220, 180, 92, ['信息不完整', '提示后修改'], '#f7ece1') +
  `<path d="M880,220 L880,130 L740,130" fill="none" stroke="#678577" stroke-width="3" marker-end="url(#arrow)"/>` +
  arrow(500, 312, 500, 360) +
  box(260, 360, 480, 84, ['保存信息，初始为“进行中”']) +
  arrow(500, 444, 500, 492) +
  box(260, 492, 480, 84, ['其他同学浏览／搜索／筛选']) +
  arrow(500, 576, 500, 624) +
  box(260, 624, 480, 84, ['打开详情，按联系方式在应用外沟通']) +
  arrow(500, 708, 500, 756) +
  box(260, 756, 480, 92, ['确认找回／归还后', '发布者在“我的发布”确认完成']) +
  arrow(500, 848, 500, 896) +
  box(260, 896, 480, 92, ['保存为“已找到”／“已归还”', '重新加载列表或详情可见新状态']) +
  `<path d="M260,942 L80,942 L80,402 L260,402" fill="none" stroke="#678577" stroke-width="3" marker-end="url(#arrow)"/>` +
  text(145, 715, '误操作时', 20) + text(145, 746, '本人确认取消完成', 20));
const data = svg(1060, 780,
  text(530, 52, '两种运行方式 · 数据分别保存', 30) +
  text(530, 108, 'Chrome直接打开 index.html', 25) +
  box(40, 143, 270, 110, ['网页界面', 'views.js／app.js']) + arrow(310, 198, 390, 198) +
  box(390, 143, 270, 110, ['业务规则 data.js', '校验／筛选／状态']) + arrow(660, 198, 740, 198) +
  box(740, 143, 280, 110, ['localStorage', '当前浏览器信息与收藏']) +
  text(530, 292, 'seed.js提供初始数据；固定本地用户，无账号登录', 20) +
  `<line x1="40" y1="330" x2="1020" y2="330" stroke="#d5dfd6"/>` +
  text(530, 386, 'npm start 启动完整本地应用', 25) +
  box(40, 430, 270, 110, ['网页界面', 'api.js 发出HTTP请求']) + arrow(310, 485, 390, 485) +
  box(390, 430, 270, 110, ['Fastify后端接口', '登录／权限／业务校验']) + arrow(660, 466, 740, 466) +
  box(740, 420, 280, 100, ['SQLite数据库', '用户／发布／收藏／会话']) +
  `<path d="M660,505 L700,505 L700,610 L740,610" fill="none" stroke="#678577" stroke-width="3" marker-end="url(#arrow)"/>` +
  box(740, 560, 280, 100, ['本地图片文件', '校验后转为WebP保存']) +
  `<path d="M525,540 L525,610 L175,610 L175,540" fill="none" stroke="#678577" stroke-width="3" marker-end="url(#arrow)"/>` +
  text(350, 650, '接口返回记录，页面更新展示', 20) +
  text(530, 730, '两种数据不自动互通；演示内容仅在需要初始化时写入', 20));
(async () => {
  for (const [name, content] of [['core-flow', flow], ['data-flow', data]]) {
    fs.writeFileSync(path.join(__dirname, `${name}.svg`), content);
    await sharp(Buffer.from(content)).png().toFile(path.join(__dirname, `${name}.png`));
  }
})();
