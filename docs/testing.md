# Mocha 测试说明

项目使用 Mocha 12.0.3 组织和执行测试，使用 Node.js 内置 `node:assert/strict` 进行断言。Mocha 是开发依赖；网页仍可直接用 Chrome 打开 `index.html`。

## 安装与运行

本项目需要 Node.js 24.19+（24.x），后端使用 Node 内置 SQLite。

在项目根目录打开 PowerShell，执行：

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run check

# 另行运行真实 Chrome 网页流程（需已安装 Chrome）
npm.cmd run test:browser
```

`npm ci` 根据 `package-lock.json` 安装固定依赖；`npm test` 运行六个测试文件，当前成功时显示 `84 passing`。断言失败会显示用例名称、预期和实际值，并返回非零退出码。`check` 检查页面及后端脚本语法。

```powershell
# 开发时监视文件变化并自动重跑
npm.cmd run test:watch

# 只运行名称包含 favorite 的用例
npm.cmd test -- --grep "favorite"

# 只运行表单合法输入用例
npm.cmd test -- --grep "valid form has no field errors"
```

## 测试组织

| 文件 | 用例数 | 内容 |
| --- | ---: | --- |
| `tests/data.test.cjs` | 44 | 表单校验、查询筛选、状态管理、收藏和浏览器存储 |
| `tests/interactions.test.cjs` | 4 | 在模拟 DOM 中执行真实控制器的筛选、设置和发布事件 |
| `tests/security.test.cjs` | 12 | 输出转义、公告详情、旧数据补齐和页面信息展示 |
| `tests/backend.test.cjs` | 14 | 真实 API、双账号权限、Cookie/CSRF、会话撤销、恢复码、图片归属、数据库重启与备份恢复、公告审核 |
| `tests/profiles.test.cjs` | 5 | 资料编辑、公开主页、账号表单与图片 URL |
| `tests/demo-seed.test.cjs` | 5 | 演示数据初始化、重启不还原、原有账号及数据保留 |

用 `describe` 分组，用 `it` 定义一个测试。下面的例子使用现有查询函数验证搜索会忽略两端空白和英文大小写：

```javascript
const { describe, it } = require('mocha');
const assert = require('node:assert/strict');
const D = require('../js/data.js');

describe('物品搜索', () => {
  it('忽略两端空白与大小写', () => {
    const posts = [{ id: 'earphones', name: 'AirPods 耳机' }];
    const result = D.queryItems(posts, { keyword: ' airpods ' }, []);
    assert.deepEqual(result.map(post => post.id), ['earphones']);
  });
});
```

## 用例设计

下面列出已有用例的输入、预期与设计方法。白盒设计依据函数内部的条件分支，验证成功与失败路径；这些用例不等同于已统计的代码覆盖率报告。

| 测试内容 | 输入或操作 | 预期 | 方法 |
| --- | --- | --- | --- |
| 必填字段 | 名称、联系、地点仅包含空白 | 对应字段报错 | 等价类、校验失败分支 |
| 名称长度 | 名称 61 个字符 | 拒绝超长名称 | 边界值 |
| 日期合法性 | `2026-02-30T10:00` | 报日期错误，不自动归一为三月 | 无效等价类 |
| 组合筛选 | 多个地点与类别 | 同组满足其一，不同组同时满足 | 白盒 OR/AND 分支 |
| 自定义日期 | 开始日期晚于结束日期 | 显示错误，已应用筛选保持不变 | 白盒错误路径 |
| 收藏切换 | 对同一物品先收藏再取消 | 添加一次，再移除该 ID | 状态迁移 |
| 发布者权限 | 非发布者编辑、完成或删除 | 拒绝操作 | 白盒权限失败分支 |
| 重新打开 | 发布者恢复已完成记录 | 恢复进行中，保留发布时间 | 状态迁移 |
| 存储损坏 | 保存内容无法解析或格式错误 | 报错，原内容保留 | 异常路径 |
| 存储写入失败 | 模拟容量不足 | 保存失败，旧数据不变 | 异常路径 |
| 多页面保存 | 两个存储实例先后修改 | 旧实例不能覆盖新版本 | 白盒版本检查分支 |
| 输出转义 | 名称包含 HTML 标签或属性引号 | 显示文本，不产生注入元素 | 安全测试 |
| 公告补齐 | 旧数据缺少第三条公告记录 | 补齐一次，不丢失收藏 | 幂等性、旧数据兼容 |

## 浏览器交互检查

Mocha 用例覆盖业务逻辑、控制器事件和 HTML 输出。真实布局、动画、剪贴板及浏览器焦点还需要浏览器检查。已有 Chrome 检查记录见 [MVP 验证记录](mvp-verification.md)；临时浏览器检查脚本不属于这 60 项 Mocha 用例。

## 官方资料

- [Mocha 入门](https://mochajs.org/getting-started/)
- [Mocha 断言说明](https://mochajs.org/features/assertions/)
- [Node.js assert](https://nodejs.org/api/assert.html)


## 本地完整应用的浏览器验收

`e2e/fullstack.test.cjs` 使用两个隔离的 Chrome 会话及临时真实服务器／数据库，覆盖注册恢复码、带图多区域发布、收藏持久化、昵称头像同步、公开主页统计、完成及取消确认、筛选保持展开、个人设置、管理员公告及急寻申请、恢复密码、编辑和删除、窄屏布局，以及直接打开静态 HTML。现有 16 项浏览器用例，并覆盖统一点击反馈、取消按压时不触发操作及减少动态效果设置，并检查发布页底部导航在滚动、可视区域缩小和恢复时持续可见。它独立于 `npm test` 的 84 项测试，测试数据库不写入项目 var 目录。
