const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const font = 'FangSong, 仿宋, STFangsong, serif';
const text = (x, y, words, size = 26, color = '#293c34', anchor = 'middle') => `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" fill="${color}" text-anchor="${anchor}">${words}</text>`;
const fittedSize = (words, width, size = 26) => Math.min(size, (width - 32) / Math.max(...words.map(line => [...line].reduce((sum, char) => sum + (char.charCodeAt(0) < 128 ? 0.6 : 1), 0))));
const box = (x, y, w, h, lines, fill = '#f1f5ef') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${fill}" stroke="#a9b9ad" stroke-width="2"/>${lines.map((line, i) => text(x + w / 2, y + h / 2 - (lines.length - 1) * 18 + i * 36 + 8, line, fittedSize(lines, w))).join('')}`;
const arrow = (x1, y1, x2, y2) => `<path d="M${x1},${y1} L${x2},${y2}" fill="none" stroke="#678577" stroke-width="3" marker-end="url(#arrow)"/>`;
const svg = (w, h, content) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="#678577"/></marker></defs><rect width="100%" height="100%" fill="#fff"/>${content}</svg>`;
const flow = svg(1000, 1050,
  text(500, 52, '发布代码调用', 36) +
  box(260, 88, 480, 84, ['app.js 读取表单 → draft']) +
  arrow(500, 172, 500, 220) +
  `<path d="M500,220 L740,266 L500,312 L260,266 Z" fill="#f7ece1" stroke="#a9b9ad" stroke-width="2"/>` + text(500, 276, 'validateItem() 通过？', 24) +
  arrow(740, 266, 790, 266) + text(765, 248, '否', 20) + box(790, 220, 180, 92, ['显示字段错误', '保留输入'], '#f7ece1') +
  `<path d="M880,220 L880,130 L740,130" fill="none" stroke="#678577" stroke-width="3" marker-end="url(#arrow)"/>` +
  arrow(500, 312, 500, 360) + text(530, 344, '是', 20) +
  box(260, 360, 480, 84, ['有图片先调用 API.upload()', 'API.request() 提交 POST /api/items']) +
  arrow(500, 444, 500, 492) +
  box(260, 492, 480, 84, ['server/app.cjs 接收请求', 'auth() 识别用户，validateItem() 校验']) +
  arrow(740, 534, 790, 534) + box(790, 492, 180, 84, ['请求出错', 'catch 提示'], '#f7ece1') +
  `<path d="M880,492 L880,430 L980,430 L980,130 L740,130" fill="none" stroke="#678577" stroke-width="3" marker-end="url(#arrow)"/>` +
  arrow(500, 576, 500, 624) +
  box(260, 624, 480, 84, ['createItem() 生成记录', 'ownedImage() 检查图片归属']) +
  arrow(500, 708, 500, 756) +
  box(260, 756, 480, 92, ['db.prepare().run() 执行 INSERT', '返回保存后的记录']) +
  arrow(500, 848, 500, 896) +
  box(260, 896, 480, 92, ['refreshRemote() 获取新 state', 'views.js 生成页面内容']));
const data = svg(1060, 580,
  text(530, 52, '应用结构', 36) +
  box(40, 170, 270, 130, ['网页界面', 'app.js／views.js', 'data.js 校验与筛选']) +
  arrow(310, 205, 390, 205) + text(350, 185, '请求', 19) +
  arrow(390, 265, 310, 265) + text(350, 290, '响应', 19) +
  box(390, 170, 270, 130, ['Fastify后端接口', '登录／权限／业务校验']) +
  arrow(660, 205, 740, 205) +
  box(740, 150, 280, 110, ['SQLite数据库', '用户／发布／收藏／会话']) +
  `<path d="M660,265 L700,265 L700,370 L740,370" fill="none" stroke="#678577" stroke-width="3" marker-end="url(#arrow)"/>` +
  box(740, 315, 280, 110, ['图片文件', '校验后转为WebP保存']) +
  text(530, 485, 'npm start → http://127.0.0.1:3000', 23) +
  text(530, 535, 'var/campus.sqlite 保存数据，var/uploads/ 保存图片', 21));
const store = (x, y, lines) => `<path d="M${x + 235},${y} H${x} V${y + 110} H${x + 235}" fill="#f0f3f7" stroke="#9facbb" stroke-width="2"/>${lines.map((line, i) => text(x + 117, y + 63 - (lines.length - 1) * 18 + i * 36, line, fittedSize(lines, 235, 24))).join('')}`;
const requestRow = (y, actor, process, database, input, output, write, result) =>
  `<rect x="28" y="${y}" width="180" height="110" fill="#f8eee3" stroke="#a9b9ad" stroke-width="2"/>${actor.map((line, i) => text(118, y + 63 - (actor.length - 1) * 18 + i * 36, line, fittedSize(actor, 180))).join('')}` +
  box(432, y, 298, 110, process) + store(954, y, database) +
  arrow(208, y + 34, 432, y + 34) + text(320, y + 19, input, fittedSize([input], 224, 22)) +
  arrow(432, y + 83, 208, y + 83) + text(320, y + 110, output, fittedSize([output], 224, 22)) +
  arrow(730, y + 34, 954, y + 34) + text(842, y + 19, write, fittedSize([write], 224, 22)) +
  arrow(954, y + 83, 730, y + 83) + text(842, y + 110, result, fittedSize([result], 224, 22));
const requests = svg(1220, 940,
  text(610, 52, '发布、查询与收藏数据流', 36) +
  text(610, 94, '方框：使用者　圆角框：处理过程　开口框：数据存储', 21) +
  requestRow(145, ['发布者'], ['P1 提交发布', '校验内容与图片归属'], ['D1 物品表', '编号／发布者／内容'], '表单与图片地址', '记录或字段错误', '写入物品记录', '保存后的记录') +
  requestRow(320, ['查找者'], ['P2 加载与筛选', '接口读取→页面筛选'], ['D1 物品表', '物品集合'], '关键词与筛选条件', '匹配列表或空结果', '读取物品集合', '物品记录') +
  requestRow(495, ['发布者'], ['P3 更新状态', '本人权限与版本检查'], ['D1 物品表', '状态／修改时间／版本'], '编号、状态、版本', '新状态或拒绝原因', '有版本条件的更新', '更新记录或未匹配') +
  requestRow(670, ['收藏的同学'], ['P4 保存收藏', '登录与物品存在检查'], ['D2 收藏关系表', '用户编号＋物品编号'], '物品编号、收藏状态', '保存结果', '当前用户的收藏关系', '关系保存结果') +
  `<line x1="28" y1="827" x2="1189" y2="827" stroke="#d5dfd6"/>` +
  text(610, 865, '/api/state 读取物品集合，data.js 计算搜索和筛选结果。', 24) +
  text(610, 910, 'D1为同一张物品表；收藏仅存编号，展示时读取物品内容。', 24));
const support = svg(1220, 960,
  text(610, 52, '账号、图片与公告数据流', 36) +
  text(610, 94, '方框：使用者　圆角框：处理过程　开口框：数据存储', 21) +
  requestRow(145, ['注册或登录者'], ['P5 账号与会话', '输入校验、密码验证'], ['D3 用户与会话表', '密码哈希／会话摘要'], '账号、密码等', '当前用户、会话结果', '账号及会话记录', '用户、有效会话') +
  requestRow(320, ['本人／', '主页访客'], ['P6 资料与公开主页', '归属校验、统计发布'], ['D3 用户表', 'D1 物品表'], '资料或用户编号', '本人资料／公开主页', '资料、发布者编号', '资料、发布记录') +
  requestRow(495, ['上传者'], ['P7 图片上传', '内容校验、WebP转换'], ['D4 图片归属表', '与上传文件目录'], '图片文件', '图片地址或错误', '转换后的图片、归属', '文件及归属记录') +
  requestRow(670, ['申请者／', '管理员／', '浏览者'], ['P8 申请与公告', '申请、审核与展示'], ['D5 申请与公告', '关联D1物品'], '申请、审核或查询', '结果或有效公告', '申请与公告记录', '公告与物品状态') +
  `<line x1="28" y1="827" x2="1189" y2="827" stroke="#d5dfd6"/>` +
  text(610, 865, '图片上传返回地址，再由发布或头像请求引用。', 24) +
  text(610, 910, '公告展示检查到期时间及物品状态；审核通过后移除申请。', 24));
(async () => {
  for (const [name, content] of [['core-flow', flow], ['data-flow', data], ['request-data-flow', requests], ['support-data-flow', support]]) {
    fs.writeFileSync(path.join(__dirname, `${name}.svg`), content);
    await sharp(Buffer.from(content), { density: 144 }).png().toFile(path.join(__dirname, `${name}.png`));
  }
})();
