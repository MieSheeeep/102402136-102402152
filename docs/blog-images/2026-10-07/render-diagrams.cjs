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
const data = svg(1060, 580,
  text(530, 52, '应用结构', 30) +
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
const store = (x, y, lines) => `<path d="M${x + 235},${y} H${x} V${y + 110} H${x + 235}" fill="#f0f3f7" stroke="#9facbb" stroke-width="2"/>${lines.map((line, i) => text(x + 117, y + 62 - (lines.length - 1) * 16 + i * 32, line, 21)).join('')}`;
const requestRow = (y, actor, process, database, input, output, write, result) =>
  `<rect x="28" y="${y}" width="180" height="110" fill="#f8eee3" stroke="#c9d7ce"/>${actor.map((line, i) => text(118, y + 62 - (actor.length - 1) * 16 + i * 32, line)).join('')}` +
  box(432, y, 298, 110, process) + store(954, y, database) +
  arrow(208, y + 34, 432, y + 34) + text(320, y + 22, input, 19) +
  arrow(432, y + 83, 208, y + 83) + text(320, y + 108, output, 19) +
  arrow(730, y + 34, 954, y + 34) + text(842, y + 22, write, 19) +
  arrow(954, y + 83, 730, y + 83) + text(842, y + 108, result, 19);
const requests = svg(1220, 940,
  text(610, 52, '主要请求的数据流 · 完整本地应用', 30) +
  text(610, 94, '方框：使用者　圆角框：处理过程　开口框：数据存储', 21) +
  requestRow(145, ['发布者'], ['P1 提交发布', '登录、表单、图片归属校验'], ['D1 物品表', '编号／发布者／内容'], '名称、时间、地点等', '新记录或字段错误', '合法发布记录', '保存后的记录') +
  requestRow(320, ['查找的同学'], ['P2 加载与筛选', '读取接口后按条件筛选'], ['D1 物品表', '同一个物品表'], '名称、分类、区域等', '匹配列表或空结果', '请求已有物品数据', '已有物品记录') +
  requestRow(495, ['发布者'], ['P3 更新状态', '本人权限与版本检查'], ['D1 物品表', '状态／修改时间／版本'], '编号、状态、版本', '新状态或拒绝原因', '有版本条件的更新', '更新记录或未匹配') +
  requestRow(670, ['收藏的同学'], ['P4 保存收藏', '登录与物品存在检查'], ['D2 收藏关系表', '用户编号＋物品编号'], '物品编号、收藏状态', '保存结果', '当前用户的收藏关系', '关系保存结果') +
  `<line x1="28" y1="827" x2="1189" y2="827" stroke="#d5dfd6"/>` +
  text(610, 865, '当前网页从 /api/state 读取物品，在 data.js 中完成搜索与筛选；接口也提供查询入口。', 20) +
  text(610, 902, '同名D1代表同一个物品表。收藏只保存关联编号，显示时读取物品内容。', 20));
const support = svg(1220, 960,
  text(610, 52, '配套功能的数据流 · 完整本地应用', 30) +
  text(610, 94, '使用与业务图相同的符号；P8包含保留的急寻申请接口', 21) +
  requestRow(145, ['注册或登录者'], ['P5 账号与会话', '输入校验、密码验证'], ['D3 用户与会话表', '密码哈希／会话摘要'], '账号、密码等', '当前用户、会话结果', '账号及会话记录', '用户、有效会话') +
  requestRow(320, ['本人或', '查看主页的同学'], ['P6 资料与公开主页', '归属校验、统计发布'], ['D3 用户表', 'D1 物品表'], '资料或用户编号', '本人资料／公开主页', '资料、发布者编号', '资料、发布记录') +
  requestRow(495, ['上传图片的用户'], ['P7 图片上传', '内容校验、WebP转换'], ['D4 图片归属表', '与上传文件目录'], '图片文件', '图片地址或错误', '转换后的图片、归属', '文件及归属记录') +
  requestRow(670, ['接口调用者、', '管理员、浏览者'], ['P8 公告与申请接口', '本人申请、审核及展示'], ['D5 申请与公告表', '读取D1物品状态'], '申请、审核或查询', '提交结果／有效公告', '申请、公告、物品编号', '申请、公告及状态') +
  `<line x1="28" y1="827" x2="1189" y2="827" stroke="#d5dfd6"/>` +
  text(610, 865, '图片上传返回地址后，发布或头像请求再引用；两个请求目前不属于同一事务。', 20) +
  text(610, 902, '批准公告时，写入公告与移除申请在同一事务中完成；展示还检查到期时间和物品状态。', 20) +
  text(610, 938, 'D3、D4、D5按用途合并相关表或文件；具体表名及关联关系见正文。', 19));
(async () => {
  for (const [name, content] of [['core-flow', flow], ['data-flow', data], ['request-data-flow', requests], ['support-data-flow', support]]) {
    fs.writeFileSync(path.join(__dirname, `${name}.svg`), content);
    await sharp(Buffer.from(content)).png().toFile(path.join(__dirname, `${name}.png`));
  }
})();
