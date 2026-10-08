# 校园失物招领原型

- [Figma设计文件](https://www.figma.com/design/xwC2YwDURRDcY7ZBZLgFMi?node-id=1-183)
- [点击预览](https://www.figma.com/proto/xwC2YwDURRDcY7ZBZLgFMi?node-id=1-183&starting-point-node-id=1%3A183&scaling=scale-down)

原型包含42个手机页面与状态，画板为390×844。页面使用可编辑文字、SVG图形和组件实例；基础组件放在单独页面。字体为思源黑体（Noto Sans SC），与网页的系统字体存在差异。

| 区域 | 覆盖内容 |
| --- | --- |
| 首页 | 寻物招领卡片、三条公告切换、搜索记录、结果、无结果、收藏 |
| 筛选 | 漏斗展开、地点分类多选、日期范围、已选与应用状态、滚动区域 |
| 发布 | 寻物、招领、填写、字段错误、成功、编辑、图片查看 |
| 详情 | 发布者、时间地点、联系方式、收藏、不同公告的详情 |
| 我的 | 发布统计、本人发布、收藏、已完成、完成与取消完成确认、删除确认 |
| 设置与账号 | 个人资料、校区选择、登录、注册、恢复码、修改与找回密码 |
| 其他 | 团队联系弹窗、清空收藏确认、公告与内容管理 |

首页、发布、我的分别设为预览起点。表单填写和部分选项以预设状态演示，不执行真实账号或数据库操作。42个页面的524条跳转反应已经检查目标有效；未将这一检查当作完整的人工点击验收。

`prototype-builder.js`与`connect-prototype.js`是Figma Plugin API构建脚本，记录基础页面及跳转的生成方式，不能作为普通Node.js程序执行。部分页面、布局和文案在生成后通过Figma编辑接口补充，以在线文件为准。

## 页面参考

![首页](home-preview.png)

![筛选展开](filters-preview.png)

![我的](my-preview.png)

![发布](publish-preview.png)

![确认弹窗](dialog-preview.png)
