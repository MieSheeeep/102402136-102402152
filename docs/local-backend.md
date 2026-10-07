# 本地完整应用与接口

更新：2026-10-07。按已确认方案实现：网页／未来的小程序 → 真实后端接口 → SQLite 和图片目录。不进行公网部署。

## 启动与数据

安装 Node.js 24.19+（24.x），执行 `npm.cmd ci`、`npm.cmd start`，在 Chrome 打开 `http://127.0.0.1:3000`。默认仅监听本机。无需 Docker、域名、邮件服务。

首次启动自动创建数据库表，网页初始为空，不把静态样例或以前的 localStorage 记录当作真实账号的数据导入。直接打开 `index.html` 仍运行原静态体验；HTTP 模式仅接入后端，连接失败不会回退成虚假的保存成功。

| 路径 | 内容 |
| --- | --- |
| `var/campus.sqlite` | 用户、会话、发布、收藏、个人偏好、图片归属和公告 |
| `var/campus.sqlite-wal` / `-shm` | SQLite 运行期间的事务辅助文件 |
| `var/uploads/` | 重新编码为 WebP 的头像和物品图片 |

配置可复制 `.env.example` 为 `.env`。`DATA_DIR` 指定持久化数据目录，`HOST` 默认 `127.0.0.1`，`PORT` 默认 `3000`。不要提交数据目录、恢复码或 `.env`。

## 账号与公开资料

- 账号 4–64 位字母、数字或 `_ @ . -`，不区分大小写；密码 10–128 个字符；昵称 1–24 个字。
- 密码使用独立随机盐及 scrypt（N=32768,r=8,p=1）；数据库不保存原密码。
- 注册提供随机账号恢复码，只在注册或恢复成功时返回；服务端只保存其 SHA-256 摘要。恢复时生成新码、废止旧码并撤销全部旧会话。请下载保存；邮箱找回和学校身份认证不在此版范围内。
- 浏览器会话通过 HttpOnly、SameSite=Lax Cookie 保存，服务端保存会话令牌摘要，有效期七天；Cookie 写接口必须携带会话 CSRF 校验值。注销立即废止当前会话，修改密码撤销其他会话。
- 公开用户主页只有昵称、头像、加入时间、公开发布列表及发布／进行中／已完成数量，不包含账号、恢复码和收藏。联系方式登录后可见。
- 发布者由会话确定；修改资料后历史帖子关联最新昵称头像；普通用户不能修改其他人的帖子，图片也只能引用自己上传的文件。
- 更新帖子需要 `version`，旧版本返回 409，避免旧页面覆盖已保存的修改。

## API 概览

所有业务路径前缀为 `/api`，JSON 响应。错误返回 `{ "message": "…", "fields": { … } }`（字段错误时才包含 fields）。状态码包括 400、401、403、404、409、413 和 429。

| 方法与路径 | 内容 |
| --- | --- |
| `GET /health` | 服务及数据库检查 |
| `POST /auth/register` | account、password、nickname；返回 user、csrf、一次性 recoveryCode |
| `POST /auth/login` | account、password；返回 user、csrf |
| `GET /auth/me` | 当前 user 与 csrf；游客 user 为 null |
| `POST /auth/logout` | 注销 |
| `POST /auth/password` | currentPassword、password；修改密码 |
| `POST /auth/recover` | account、recoveryCode、password；重设并返回新恢复码 |
| `GET /state` | 网页初始化：公开发布、当前账号收藏及偏好、有效公告 |
| `GET /items` | 查询列表，返回 items、total；支持 keyword、type、ownerId、status、locations、categories、timeRange、dateStart、dateEnd、sort、limit、offset |
| `GET /items/:id` | 单条详情，游客不返回联系方式 |
| `POST /items` | 创建发布；ownerId 等身份字段由服务端生成 |
| `PATCH /items/:id` | 编辑字段及 version，或 status＋version 更新完成状态 |
| `DELETE /items/:id` | 删除自己的发布；数据库级联删除相关收藏和公告 |
| `PUT /favorites/:id` | `{ "active": true/false }`，幂等收藏操作 |
| `DELETE /favorites` | 清空本人收藏 |
| `PATCH /me` | nickname、avatar（上传 URL；空串移除头像） |
| `PATCH /me/preferences` | sort、saveSearchHistory、recentSearches |
| `GET /users/:id` | 公开 user、stats、items |
| `POST /uploads` | multipart/form-data，一个 file；返回 `{ "url": "/uploads/….webp" }` |
| `PUT /admin/notices/:id` | 管理员设置寻物公告：整数 reward、ISO 格式 expiresAt |
| `DELETE /admin/notices/:id` | 管理员撤下公告 |
| `DELETE /admin/items/:id` | 管理员删除违规内容 |
| `POST /urgent-requests/:id` | 为本人进行中的寻物帖子申请紧急公告，传整数 reward |
| `DELETE /admin/urgent-requests/:id` | 管理员驳回急寻申请 |

发布字段：type（lost/found）、name、category、locationGroups（寻物可多选，招领仅一个）、locationDetail、occurredAt、timePrecision（date/datetime）、contact、description、image（可选）。分类及区域与 `js/data.js` 一致。

列表数组参数可以重复传递，例如 `?locations=教学楼&locations=食堂`。自定义时间范围使用 `timeRange=custom&dateStart=2026-10-01&dateEnd=2026-10-07`，按丢失／拾取日期匹配。

图片只接受实际可解码的 JPG、PNG、WebP，输入不超过 5 MB、1600 万像素，自动旋转、缩放并重新编码，去除原文件元数据。单账号上传内容配额 100 MB；原文件名不用作存储路径。替换图片暂时保留旧文件，因此配额计算包含旧图片。

## 小程序接入边界

当前完成的是独立业务 API，尚未创建小程序页面，也没有接入真实微信登录。接口能通过标准 HTTP 客户端测试，不要求部署公网。

非浏览器客户端注册／登录传 `transport: "bearer"`，获得 token，后续携带 `Authorization: Bearer <token>`；图片通过 multipart 上传。不要使用随机浏览器信息作为身份，也不要让客户端自行指定 userId。

未来接微信登录时，新增服务器验证微信临时 code 的登录入口，把微信身份关联内部 users.id；物品、收藏、用户资料和统计接口可以继续使用。AppID、AppSecret 和原生页面需要另行提供与实现，不能把客户端传来的 OpenID 当作已认证身份。手机访问电脑时，localhost 指手机自身，实际联调需要手机可访问的电脑地址及相应开发工具配置。

## 管理员

先在网页注册账号，再在项目终端执行 `npm.cmd run admin -- 账号`。重新登录，设置中进入“公告与内容管理”。普通用户无法通过网页或 API 提升权限。公告只可关联进行中的寻物帖，有到期时间，完成的帖子自动停止展示公告。用户从“联系我们发布紧急”选择自己的寻物帖提交申请；管理员审核队列仅管理员可见，批准公告后申请移出队列，也可以驳回。

## 备份与恢复

建议先停止服务，执行 `npm.cmd run backup`，或者 `npm.cmd run backup -- E:\备份\新目录`。脚本使用 SQLite backup API 生成一致数据库快照并复制 uploads；输出目录必须不存在。停服可以保证数据库和图片复制期间没有新增上传。

恢复时保持服务关闭，将原数据目录妥善移到其他位置，把备份内 `campus.sqlite` 和 `uploads/` 复制到新的空数据目录，再将 `DATA_DIR` 指向它并启动。不要将运行中数据库的旧 WAL 文件混入恢复目录。备份包含私有账号和帖子联系方式，应妥善保管。

## 测试

`npm.cmd test` 运行原业务回归及真实 API／SQLite 测试；`npm.cmd run check` 检查语法；`npm.cmd run test:browser` 使用已安装的 Chrome 运行隔离账号端到端测试。测试数据全部写入系统临时目录，结束后删除，不污染 `var`。

## 技术与适用范围

使用 Fastify、Node.js 内置 SQLite、scrypt、Sharp 和 Mocha。本地课程应用可真实运行多账号数据流程；当前未执行公网部署，未实现微信登录、学校认证、邮件验证，也未承诺高并发容量。SQLite 接口采用 Node 24 的实验性模块，Node 版本按 package.json 固定；大规模运行时需另行评估数据库和部署配置。

参考：[Node SQLite](https://nodejs.org/docs/latest-v24.x/api/sqlite.html)、[Node Crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html)、[Fastify](https://fastify.dev/docs/latest/)。
