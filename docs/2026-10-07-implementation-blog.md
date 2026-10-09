# 2026秋软件工程结对作业（第二次）：校园失物招领程序实现

## 一、作业链接与结对信息（2分）

| 项目 | 内容 |
| --- | --- |
| 课程 | [H202601软件工程与软件工程实践](https://edu.cnblogs.com/campus/fzu/2026-01SoftwareEngineeringandSoftwareEngineeringPractice) |
| 作业要求 | [2026秋软件工程结对作业（第二次）](https://edu.cnblogs.com/campus/fzu/2026-01SoftwareEngineeringandSoftwareEngineeringPractice/homework/16745) |
| 作业目标 | 根据上次的需求和原型，做出可以实际操作的校园失物招领程序，并完成测试 |
| 结对成员 | 王智洋（102402136）、庄剑钇（102402152） |
| 队友博客 | [庄剑钇的博客](https://www.cnblogs.com/always111/) |
| 本篇文档 | [程序实现博客正文](https://github.com/MieSheeeep/102402136-102402152/blob/main/docs/2026-10-07-implementation-blog.md) |
| GitHub项目 | [102402136-102402152](https://github.com/MieSheeeep/102402136-102402152) |
| 上次需求与原型 | [校园失物招领：需求分析与原型设计](https://www.cnblogs.com/MieSheeeep/p/23138166) |

## 二、具体分工（1分）

| 成员 | 负责的模块与工作 |
| --- | --- |
| 王智洋（102402136） | 发布、浏览、详情和状态管理的主体功能；收藏、筛选、公告和个人资料；本地后端、数据库与图片存储；界面调整、测试和文档整理 |
| 庄剑钇（102402152） | 描述、地点与多关键词搜索；关键词高亮；首页加载更多和空结果区分；静态模式图片压缩与保存，以及相关测试 |

双方共用数据结构和业务模块，通过PR合并改动，再统一运行测试。开发中使用AI辅助编写代码和排查问题。

## 三、PSP表格与耗时分析（5分）

耗时为两人合计人分钟，取大致值；两人同时工作一小时计为120人分钟。

| PSP2.1 | 任务 | 预估耗时（约） | 实际耗时（约） |
| --- | --- | ---: | ---: |
| Planning | 计划 | — | — |
| Estimate | 确认交付范围与任务分工 | 20 | 30 |
| Development | 开发 | — | — |
| Analysis | 梳理需求，学习Mocha、接口、SQLite和图片处理 | 90 | 130 |
| Design Spec | 整理字段、状态、权限和运行方式 | 60 | 80 |
| Design Review | 检查筛选、卡片、公告和导航设计 | 30 | 70 |
| Coding Standard | 确定模块划分、转义和校验规则 | 20 | 20 |
| Design | 设计页面交互与数据关联 | 100 | 150 |
| Coding | 实现网页、本地后端及配套功能 | 420 | 620 |
| Code Review | 阅读代码，核对接口、权限与队友改动 | 60 | 80 |
| Test | 验证业务、接口和页面，修改问题 | 150 | 240 |
| Reporting | 报告 | — | — |
| Test Report | 整理测试输入、预期和结果 | 30 | 50 |
| Size Measurement | 核对模块、功能与测试工作量 | 20 | 30 |
| Postmortem & Process Improvement Plan | 整理博客、配图与改进建议 | 50 | 80 |
| 合计 | 以上具体任务之和 | **1050** | **1580** |

编码多约200分钟，主要用于账号、数据库和图片保存；测试多约90分钟，用于多账号、重启保存和手机布局检查。设计与复审多约90分钟，主要是调整筛选面板和图片控件。合计比预估多约530人分钟。

## 四、解题思路描述与设计实现说明（20分）

### 4.1 解题思路

寻物和招领的名称、图片、地点等字段相同，因此共用物品表，用`type`区分类型。首页、详情和“我的发布”按同一个编号读取记录，编辑后重新获取数据，各页面显示的就是同一次修改。

`data.js`的校验和筛选函数接收普通对象、返回结果，不读取DOM；页面、后端和Mocha都能直接调用，改一条规则不用在三个地方各写一遍。

<img src="blog-images/2026-10-07/core-flow.png" alt="发布、查找、联系与完成状态的流程" width="680">

### 4.2 整体结构

页面通过`api.js`提交数据，后端处理账号和写入，筛选等计算放在`data.js`；界面改动不需要跟着改数据库读写。

项目最初用静态页面和浏览器存储验证功能，后来接入Fastify与SQLite，增加账号登录、共享数据和图片文件保存。

<img src="blog-images/2026-10-07/data-flow.png" alt="前端、后端接口、数据库与图片存储结构" width="680">

`app.js`按`#home`、`#publish`、`#detail/编号`选择页面，`views.js`生成HTML。重绘会替换按钮，所以把点击监听放在不会被替换的主容器上，用`event.target.closest('[data-action]')`找到按钮并分发操作；底部导航也放在重绘区域外。

| 文件 | 具体职责 |
| --- | --- |
| `js/app.js` | 路由、事件监听、表单草稿、弹窗、页面状态与刷新 |
| `js/views.js` | 卡片、详情、表单等页面模板，用户文字转义和关键词高亮 |
| `js/data.js` | 输入校验、创建与更新记录、搜索筛选、收藏和状态规则 |
| `js/api.js` | 请求接口、处理响应错误、上传图片和携带登录凭据 |
| `server/app.cjs` | 登录会话、接口校验、权限判断、数据库与图片读写 |

已有数据时，切换页面直接渲染当前`state`，不先清空为加载页；后台再请求更新。每次刷新递增请求序号，响应回来时只接收当前序号，因此晚到的旧请求不会把页面改回旧数据。

<img src="blog-images/2026-10-07/01-overview.png" alt="首页、发布与我的页面" width="760">

后端保存密码的加盐哈希，通过HttpOnly Cookie识别登录用户，写操作检查CSRF凭据。游客可浏览，发布、收藏和查看联系方式需要登录。

### 4.3 数据组织

`/api/state`返回的物品、收藏与偏好数据：

```json
{
  "items": [
    {
      "id": "post-demo-umbrella",
      "ownerId": "user-demo-student",
      "version": 1,
      "type": "lost",
      "name": "黑色长柄雨伞",
      "category": "生活用品",
      "locationGroups": ["教学楼", "图书馆"],
      "locationGroup": "教学楼",
      "locationDetail": "教学楼A区302附近",
      "occurredAt": "2026-10-08T08:20",
      "timePrecision": "datetime",
      "contact": "微信：campus_demo",
      "description": "伞柄有一圈银色金属环",
      "image": "assets/default-item.svg",
      "status": "open",
      "createdAt": "2026-10-08T01:00:00.000Z",
      "updatedAt": "2026-10-08T01:00:00.000Z"
    }
  ],
  "favorites": ["post-demo-umbrella"],
  "recentSearches": ["黑色 雨伞"],
  "preferences": { "sort": "newest", "saveSearchHistory": true }
}
```

寻物可能隔天才发布，所以筛选用`occurredAt`而非发布时间；只记得日期或几个可能地点时，用`timePrecision`和`locationGroups`保存这些信息，不要求用户编出准确时间地点；编辑时提交读到的`version`，由后端判断这条记录是否已被改过。

发布只关联用户编号，不复制昵称和头像，修改资料后读取用户表即可显示新资料；收藏同样只关联物品编号。图片单独存文件，列表请求只传地址，不用每次把图片内容装进JSON。

| 数据表 | 保存内容 | 与其他数据的联系 |
| --- | --- | --- |
| `users`、`sessions` | 账号资料、密码及恢复码摘要、偏好、会话 | 会话关联用户；发布、收藏、图片以用户编号确定归属 |
| `items` | 物品编号、发布者编号、内容、版本 | 发布者资料从用户表读取；完成数量从物品状态统计 |
| `favorites` | 用户编号、物品编号 | 两个编号组成唯一关系；删除物品后级联删除 |
| `uploads`与图片目录 | 图片编号、所属用户、大小和文件 | 物品及头像引用图片地址 |
| `urgent_requests`、`notices` | 申请或公告所关联物品、酬谢；公告另存到期时间 | 关联原发布；审核批准时写公告并删除申请 |
| `app_meta` | 演示初始化及资料迁移标记 | 启动时读取标记，已初始化就跳过导入 |

<img src="blog-images/2026-10-07/support-data-flow.png" alt="账号、个人资料、图片与公告的数据流" width="760">

首次启动写入演示账号、七条物品和三条公告，重启不覆盖修改。数据库和图片持久保存在本地，可用`server/backup.cjs`备份。

### 4.4 发布与保存

前端调用`validateItem()`，把错误显示在对应输入旁，用户不用提交后才知道漏填。后端再调用同一规则，因为请求也可以绕过表单直接发到接口；提交期间禁用按钮，出错后保留输入供修改。

图片通过`POST /api/uploads`返回地址，再随表单提交到`POST /api/items`。服务器再次校验，从登录会话取得发布者编号，保存后才返回成功。

`app.js`中的后端提交逻辑：

```javascript
requireLogin();
if (pendingItemFile) draft.image = await API.upload(pendingItemFile);
const edit = currentRoute.page === 'edit';
const record = await API.request(
  edit ? 'PATCH' : 'POST',
  edit ? `/items/${encodeURIComponent(currentRoute.id)}` : '/items',
  {
    ...draft,
    ...(edit ? {
      version: state.items.find(post => post.id === currentRoute.id)?.version
    } : {})
  }
);
await refreshRemote(false);
navigate(edit ? 'my' : `success/${encodeURIComponent(record.id)}`);
```

物品请求需要图片地址，所以先`await API.upload()`，再把返回地址写入`draft.image`；保存返回记录编号后，刷新列表并进入成功页。任一步失败会进入`catch`，不继续跳转，按钮在`finally`中恢复。

上传接口用Sharp读取实际图片格式，不按文件后缀判断；随后修正旋转方向、按比例缩到1600×1600以内，以质量82转为WebP，统一图片格式和尺寸。

<img src="blog-images/2026-10-07/03-publish.png" alt="发布表单的三个区域" width="760">

<img src="blog-images/2026-10-07/request-data-flow.png" alt="发布、查询、状态更新和收藏的业务数据流" width="760">

### 4.5 搜索与列表

首页读取`/api/state`，再用`queryItems()`筛选。关键词按空白拆分、忽略大小写，每个词都需命中名称、描述或具体地点：

```javascript
function splitKeywords(value) {
  return text(value).toLocaleLowerCase().split(/[\s\u3000]+/).filter(Boolean);
}

function matchesKeywords(item, words) {
  if (!words.length) return true;
  const haystack = [item.name, item.description, item.locationDetail]
    .map(text).join('\n').toLocaleLowerCase();
  return words.every(word => haystack.includes(word));
}
```

`every()`要求所有词都命中，可以分布在不同字段；例如名称含“雨伞”、描述含“金属环”，能匹配“雨伞 金属环”。

多选采用组内任选、组间同时满足：选“教学楼、食堂”加“生活用品”，表示这两个地点中任一处的生活用品。日期按丢失／拾取时间筛选，包含起止两天；排序按发布时间。

筛选面板编辑`filterDraft`，点击应用才复制到正式条件，用户可以一次选完地点和分类。列表先算匹配结果，再截取前12条；加载更多增加上限，换条件则恢复12条。高亮先转义原文再加入`mark`，输入中的HTML标签会显示为文字。

<img src="blog-images/2026-10-07/02-search.png" alt="搜索输入、匹配结果与无结果提示" width="760">

### 4.6 编辑与状态同步

编辑复用发布表单，通过`PATCH /api/items/:id`提交内容和版本号。服务器拒绝他人修改（403）和旧版本覆盖（409），保留编号、发布者、类型及发布时间。

完成与取消完成分别将`status`设为`completed`和`open`，卡片及个人统计都从这个字段读取。完成、取消完成和删除前需确认。

`server/app.cjs`中的更新接口：

```javascript
const user = auth(req);
const old = getItem(req.params.id, user);
const body = req.body || {};
if (old.ownerId !== user.id) fail(403, '只能管理本人发布的信息');
if (body.version !== old.version) fail(409, '信息已被修改，请刷新后重试');
let item;
if (body.status !== undefined) {
  if (!['open', 'completed'].includes(body.status)) fail(400, '状态不正确');
  item = (body.status === 'completed' ? D.completeItem : D.reopenItem)
    ([old], old.id, user.id)[0];
}
```

`auth(req)`从会话取得用户，`old.ownerId`与用户编号不相等就返回403；版本不同返回409。页面是否显示编辑按钮不参与权限判断。

写入数据库时，再把版本条件放进更新语句：

```javascript
const result = db.prepare(
  'UPDATE items SET data=?,version=version+1 WHERE id=? AND version=?'
).run(JSON.stringify(item), old.id, old.version);
if (!result.changes) fail(409, '信息已被修改，请刷新后重试');
return getItem(old.id, user);
```

SQL把编号和旧版本一起作为更新条件：两个页面都读到版本1时，第一个更新后变为2，第二个的`WHERE version=1`匹配不到记录，`result.changes`为0，返回409。这样版本比较与修改在一条SQL中完成。

## 五、附加特点设计与展示（10分）

### 5.1 收藏

“好像是我的，先记下来！”看到可能相关的物品，点个小爱心就能留下线索，之后从首页“收藏”或“我的收藏”找回来，不用再翻半天列表。

收藏只存物品编号，查看时再读取内容，所以发布者补充了线索，收藏里也能看到。

收藏表以“用户编号＋物品编号”为联合主键，接口使用`INSERT OR IGNORE`，重复收藏同一物品只留一条关系；外键的`ON DELETE CASCADE`在物品删除时清除关系。页面先计算目标状态，再通过`PUT`提交`active: true/false`，重发请求也不会把收藏反向切换。

页面中的编号数组用以下函数切换：

```javascript
function toggleFavorite(favorites, id) {
  return favorites.includes(id)
    ? favorites.filter(value => value !== id)
    : [...favorites, id];
}
```

收藏成功，小爱心变成粉色并轻轻跳一下，卡片也加上粉色边框，告诉你“记住啦”。取消时恢复空心，收藏列表里的卡片淡出移除。

<img src="blog-images/2026-10-07/06-contact-favorite.png" alt="物品详情、联系入口与个人收藏列表" width="760">

### 5.2 紧急公告栏

有些东西真的等不了，比如装着作业的U盘。我们在首页顶部留了一块紧急公告栏，让着急找东西的同学先被看见。

公告只突出图片、丢失时间、地点和酬谢，扫一眼就知道要找什么、去哪儿留意；左右滑动看下一条，想帮忙就点进去看详情。

我们也有点小心思：急寻成功后，说不定能从赏金里抽一点。公告栏还可以广告位招租，营收也不是没机会！

公告关联原发布，管理员设置酬谢和到期时间；到期或物品完成后不再展示。“联系我们发布紧急”打开团队联系弹窗，提供微信`campus_demo`和需提交的信息。

<img src="blog-images/2026-10-07/08-notices.png" alt="三条紧急寻物公告切换后的信息展示" width="760">

### 5.3 颜色提示

刷列表时，不用每张卡片都仔细读：暖棕色是“我丢东西啦”，浅绿色是“我捡到东西啦”，灰蓝色是“已经找到或归还啦”。收藏的小爱心和边框用粉色，自己的线索也容易认出来。

颜色调得柔和一些，长时间看也不会满屏抢眼；卡片上仍有类型和状态文字，看不清颜色也能读懂。

一条招领信息归还后，卡片就变成灰蓝色，写着“已归还”；如果你收藏过它，小爱心还会留着。

`statusLabel()`根据类型和完成状态生成文字，页面据此设置卡片样式。

```javascript
function statusLabel(item) {
  if (item.status === 'completed') {
    return item.type === 'lost' ? '已找到' : '已归还';
  }
  return item.type === 'lost' ? '寻找中' : '待认领';
}
```

`css/styles.css`中，已完成规则放在类型配色后面：

```css
.item-card.completed-card {
  background: #edf1f4;
  border-color: #d2dce3;
}
.item-card.has-favorite {
  border-color: #c8929c;
  box-shadow: inset 0 0 0 1px #b653621a;
}
```

状态控制卡片底色，收藏控制边框和爱心，两种提示可以同时出现。

<img src="blog-images/2026-10-07/09-color-hints.png" alt="寻物、招领与已完成卡片的颜色区别" width="760">

还有一些顺手的小设计：筛选可以多选，点应用后面板不收起，方便继续调整；最近搜索不用重复输入，匹配词会高亮。联系方式可以复制，照片能预览、更换和移除；漏填就直接在输入旁提醒，完成、取消完成和删除前再问一句，底部导航也一直留着。

## 六、目录说明和使用说明（5分）

### 6.1 目录组织

```text
index.html                 页面入口、主导航和弹窗容器
css/styles.css             页面样式、动效和适配
assets/                    默认配图和头像
js/seed.js                 静态体验的初始数据
js/data.js                 校验、筛选、收藏和状态规则
js/views.js                页面渲染与文字转义
js/app.js                  导航、表单和交互
js/api.js                  后端接口访问
js/feedback.js             点击反馈
server/                    API、数据库、图片与演示数据初始化
tests/                     单元测试和接口测试
e2e/                       Chrome页面流程测试
docs/                      原型记录、设计及测试说明
var/                       运行后生成的数据库与图片，不提交Git
package.json               依赖和运行命令
README.md                  使用说明
```

### 6.2 运行方式

下载并解压完整项目，安装Node.js 24.19及以上的24.x版本，在项目目录执行：

```powershell
npm.cmd ci
npm.cmd start
```

用Chrome访问终端打印的`http://127.0.0.1:3000`。可自行注册，也可使用账号`demo_student`、密码`CampusDemo123!`，体验三条已有发布和两条收藏。

数据库位于`var/campus.sqlite`，图片位于`var/uploads/`。结束程序后，下次运行同样的命令即可继续使用。

第一次运行可以按这个顺序体验：发布一条信息→首页按名称搜索→打开详情→查看联系方式→“我的发布”标记完成→回首页确认状态→取消完成。再试一次必填项为空和搜索无结果。

## 七、单元测试（10分）

### 7.1 Mocha简易教程

业务函数可以直接在Node.js运行，因此选择Mocha组织测试、`node:assert/strict`比较结果，也能用`async/await`测试接口。

学习参考[Mocha入门文档](https://mochajs.org/getting-started/)，从一个函数的输入和预期结果开始写用例。

#### 安装Mocha

在已有Node.js项目中安装：

```powershell
npm.cmd install --save-dev mocha
```

本项目已配置Mocha，下载后执行`npm.cmd ci`即可。

Mocha负责组织和运行测试，断言负责比较实际结果与预期：`describe()`分组，`it()`定义用例，`assert.equal()`比较单个值，`assert.deepEqual()`比较数组或对象。断言不相等时，用例失败并显示差异。

#### 例子一：收藏

将收藏测试保存为`docs/favorite-example.test.cjs`：

```javascript
const { describe, it } = require('mocha');
const assert = require('node:assert/strict');
const D = require('../js/data.js');

describe('收藏', () => {
  it('favorite toggle adds once then removes', () => {
    const before = [];
    const after = D.toggleFavorite(before, 'one');
    assert.deepEqual(after, ['one']);
    assert.deepEqual(D.toggleFavorite(after, 'one'), []);
  });
});
```

这个用例检查第一次点击加入编号、第二次点击移除。在项目根目录运行：

```powershell
npm.cmd exec -- mocha docs/favorite-example.test.cjs
```

通过时显示`1 passing`。把第一次的预期改为`[]`，可看到实际值与预期的差异；观察后恢复为`['one']`。

#### 例子二：日期筛选

日期范围包含起止两天，所以测试要覆盖两端、范围外和缺失时间。

将下面代码接在同一个练习文件后，复用前面的导入。`item(overrides)`只修改要测试的字段：

```javascript
const now = '2026-10-06T10:00:00.000Z';
const input = {
  type: 'lost', name: '黑色雨伞', category: '生活用品',
  locationGroup: '教学楼', locationDetail: 'A区302',
  occurredAt: '2026-10-06T09:20', contact: '微信：demo',
  description: '银色金属环'
};
function item(overrides = {}) {
  return {
    id: 'one', ownerId: 'me', ...input, status: 'open',
    createdAt: now, updatedAt: now, ...overrides
  };
}

it('event date range includes both ends and uses the event date', () => {
  const list = [
    item({ id: 'first', occurredAt: '2026-10-01', timePrecision: 'date' }),
    item({ id: 'last', occurredAt: '2026-10-06T23:59' }),
    item({ id: 'old', occurredAt: '2026-09-30T12:00' }),
    item({ id: 'unknown', occurredAt: '', timePrecision: 'unknown' })
  ];
  const ids = D.queryItems(list, {
    timeRange: 'custom', dateStart: '2026-10-01', dateEnd: '2026-10-06'
  }).map(x => x.id);
  assert.deepEqual(ids, ['first', 'last']);
  assert.equal(D.queryItems(list, { timeRange: 'all' }).length, 4);
});
```

四条记录的发布时间相同，丢失时间不同，预期只留下起点和终点两条，可同时发现边界遗漏和时间字段用错。固定日期让测试结果可重复，比较编号只检查筛选结果。

再次运行同一命令，两个用例通过时显示`2 passing`。

### 7.2 测试数据构造

按代码分支构造正常、错误和边界输入，每组只改变当前规则相关的字段，方便定位失败原因。

| 检查方向 | 为什么这样构造 | 数据与预期 |
| --- | --- | --- |
| 必填输入 | 看起来填了内容，去掉空白后却可能为空 | 名称全为空格、联系方式为换行，预期指出字段错误 |
| 搜索组合 | 单个词能命中，不代表多个词的关系正确 | 名称有“雨伞”、描述有“金属环”，两个词同时命中；不存在的词排除记录；兼容大小写和全角空格 |
| 多选条件 | 防止把组内任选写成全部满足，或忽略组间组合 | 四条不同地点、分类记录，地点组取并集，再与分类组取交集 |
| 展示数量 | 正常第一页之外还可能有空集合和异常限制 | 30条记录限制12／24条，检查剩余数量；空集合、负数和小数检查处理规则 |
| 文本显示 | 正常中文无法发现转义错误 | 输入带标签、引号、事件属性和正则字符的文字，预期显示文字并保留正确高亮 |
| 状态修改 | 同一完成状态在寻物和招领上有不同文案 | 分别构造两种类型，取消完成后状态恢复，内容与发布时间保留 |
| 图片 | 扩展名和真实内容可能不一致 | 文件名为PNG但内容是SVG，预期拒绝；有效PNG返回WebP；本地图片保存后仍可读取 |
| 账号权限 | 只用本人账号看不到越权问题 | A发布、B修改和删除，预期403；B收藏不改变A的收藏 |
| 旧数据覆盖 | 同一个账号也可能同时开两个页面 | 完成后拿旧版本取消完成，预期409；新版本可以成功 |
| 持久化与关联 | 页面上暂时显示成功，不等于重启后还在 | 重启后读取发布和收藏；删除物品后关联收藏清除 |

针对连续点击、空白输入和跨账号修改等操作，既检查成功结果，也检查应返回的400、403和409。

Chrome测试用两个隔离账号走完整操作流程，并在390px和1200px宽度下检查溢出及底栏。弹窗操作等待动画结束后再判断结果。

### 7.3 测试分组与运行结果

共29项测试：

| 测试组 | 数量 | 检查范围 |
| --- | ---: | --- |
| 业务规则 | 8 | 表单、关键词、图片保存、收藏、状态、多选、分批数据、日期 |
| 视图与文本安全 | 5 | 用户文字与表单属性转义、高亮、分批展示、图片展示 |
| 后端接口 | 8 | 登录、权限、资料、状态、持久化、Cookie／CSRF、图片、编辑 |
| 演示数据初始化 | 1 | 账号、七条物品、三条公告及初始化后的资料 |
| Chrome页面流程 | 7 | 注册、底栏、带图发布、资料主页、完成取消、编辑、删除 |
| 合计 | **29** | 业务结果、数据保存与页面操作 |

2026年10月9日运行结果：

```text
npm test              22 passing
npm run test:browser   7 passing
npm run check         语法检查通过
```

测试代码：[tests目录](https://github.com/MieSheeeep/102402136-102402152/tree/main/tests)、[e2e目录](https://github.com/MieSheeeep/102402136-102402152/tree/main/e2e)。

## 八、GitHub代码签入记录截图（1分）

[GitHub提交记录](https://github.com/MieSheeeep/102402136-102402152/commits/main/)

<a href="blog-images/2026-10-07/git-commits-2026-10-09.jpg"><img src="blog-images/2026-10-07/git-commits-2026-10-09.jpg" alt="GitHub近期签入与合并记录" width="900"></a>

<a href="blog-images/2026-10-07/git-features-2026-10-09.jpg"><img src="blog-images/2026-10-07/git-features-2026-10-09.jpg" alt="搜索高亮、加载更多、静态图片与两次PR合并记录" width="900"></a>

## 九、代码模块异常或结对困难及解决方法（4分）

图片上传区域调整后，进入发布页时底部导航看起来不见了。最开始从定位入手，试着根据可视区域调整底栏位置，但没有解决根因，反而出现底栏位置变化。

后来检查了页面实际宽度，发现一个隐藏的文件输入框被普通表单的`width: 100%`样式覆盖。控件虽然看不见，却把页面撑宽了。浏览器因此重新计算视口，底栏也跟着跑出可见范围。

最后保留底栏的固定定位，为上传区域增加相对定位，并限制隐藏控件的尺寸：

```css
.item-image-editor { position: relative; }
.form-field input.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  max-width: 1px;
  min-width: 0;
  padding: 0;
  overflow: hidden;
}
```

测试也跟着修改：横向溢出比较页面的`scrollWidth`和`documentElement.clientWidth`。原先比较`innerWidth`，它也可能随页面撑宽，导致测试漏报。随后把发布页纳入手机宽度检查。

390px和1200px宽度下均无横向溢出，底栏正常显示，7项Chrome测试通过。收获是先测量布局再改定位，并把漏测场景补入测试。

## 十、评价队友（2分）

队友补充了描述与地点搜索、关键词高亮、加载更多和静态图片保存。值得学习的是改动同时配上测试，并考虑高亮转义和筛选后数量重置等细节。

需要改进的是文档同步和协作记录。增加加载更多、静态图片保存等功能时，README和博客也应同步更新；双方在PR中留下复核意见，并及时记录PSP耗时，方便检查和回顾。
