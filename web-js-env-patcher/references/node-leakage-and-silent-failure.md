# Node 泄露阻断与静默失败排查

本文件用于进入 Node.js 补环境前后，防止目标 JS 误读 Node 环境，并排查“不报错但结果不一致”的问题。

## Node 泄露阻断原则

目标网页 JS 应看到浏览器环境，而不是 Node.js 环境。探测脚本和最终 runner 都必须避免暴露：

```text
process, Buffer, require, module, exports, global, __dirname, __filename,
setImmediate, clearImmediate, Error.prepareStackTrace, Node 专属堆栈路径
```

### 运行上下文隔离要求

- 使用 `vm.createContext` 时，不要把宿主函数、宿主数组、宿主类直接塞进目标运行上下文。
- `URL`、`TextEncoder`、`fetch`、`atob`、`console` 等应在目标运行上下文内定义，或确认不会通过 `constructor.constructor` 拿到宿主 `process`。
- 禁止把 `require`、`process`、`Buffer` 作为调试便利变量暴露给目标 JS。
- 目标 JS 需要的环境对象要通过 `env.js` 明确安装，不要把 Node 全局对象透传。
- 最终交付前运行 `scripts/check_node_leakage.js`，并在 notes 中记录阻断结论。

### 快速自检表达式

在目标 JS 所在运行上下文中执行以下表达式，期望均不暴露 Node 能力：

```javascript
typeof process === "undefined"
typeof Buffer === "undefined"
typeof require === "undefined"
typeof module === "undefined"
typeof global === "undefined"
Function("return typeof process")() === "undefined"
```

如果任一表达式暴露 Node 能力，先修运行上下文隔离，不要继续补环境。

## 静默失败排查清单

当目标 JS 能跑完但 sign/token 不一致，按以下顺序排查：

1. **请求样本一致性**：URL、Query 排序、Body 字符串、Header 大小写、Content-Type、Referer、Origin 是否一致。
2. **SDK 初始化参数**：appId、版本号、平台、渠道、页面路径、nonce、server seed、初始化时机是否一致。
3. **登录态和存储**：Cookie、localStorage、sessionStorage、IndexedDB 摘要是否一致；敏感值不要写入最终报告。
4. **时间和随机数**：`Date.now`、`new Date()`、`performance.now`、`Math.random`、`crypto.getRandomValues` 是否可复现。
5. **浏览器指纹**：UA、language、timezone、screen、devicePixelRatio、plugins、mimeTypes、canvas、WebGL。
6. **加载顺序**：目标 JS 是否在 env 安装前读取环境；入口模块是否需要先执行 runtime chunk。
7. **toString/native-like**：函数、getter、setter、构造函数是否返回浏览器风格字符串。
8. **属性描述符**：enumerable、configurable、writable、getter/setter 是否与浏览器接近。
9. **原型链**：实例 `constructor`、`instanceof`、`Object.prototype.toString` 是否合理。
10. **特殊对象**：`document.all`、`HTMLAllCollection`、`navigator.plugins`、`mimeTypes` 是否被检测。
11. **动态代码**：eval、new Function、setTimeout 字符串、混淆解包结果是否漏执行。
12. **Worker/WASM**：是否实际在 Worker、iframe、WASM 中生成参数，需要单独搬运消息链。

## Cookie 过期的静默失败排查

Cookie 相关失败先分类，再决定是否让用户补样本：

1. **登录态 / 授权 Cookie**：如果 Cookie 与账号、会话、SSO、Authorization 或权限绑定，不要尝试绕过；让用户在所选取证工具中手动登录，或提供授权样本。
2. **非登录 Cookie**：如果目标不需要登录，或 Cookie 是设备标识、首访标识、风控标识、JS 生成值、challenge 派生值，不要默认要求用户重新提供新 Cookie；应分析生成链路。
3. **来源定位**：
   - 服务端 `Set-Cookie`：检查是否需要先发起首访 / challenge 请求，并在最终 Node.js / Python 请求客户端中维护 Cookie jar。
   - 前端 `document.cookie = ...`：用 Hook / RuyiTrace 查 writer 和调用栈。
   - JS 计算：按 `source → entry → builder → writer` 纳入补环境。
   - Storage 派生：检查 localStorage / sessionStorage / IndexedDB 摘要是否与浏览器样本一致。
4. **最终交付**：非登录 Cookie 的生成或刷新应进入最终入口脚本；入口运行后先生成 / 刷新 Cookie，再生成加密参数并发送 Node.js / Python 模拟请求。

不要把“重新拿一份新 Cookie”作为默认答案；它只能用于登录态 / 授权态、不可复现的一次性服务端状态，或用户明确只做离线样本复现的场景。

## 六项纯计算预检

补环境前先证明 Node 与浏览器的基础纯计算差异不会影响结果。若差异明显，先记录，不要直接归咎于环境对象。

| 项目 | 检查内容 | 目的 |
|---|---|---|
| Math | `Math.imul`、浮点精度、三角函数边界 | 排除 JS 引擎数学差异 |
| String/Unicode | UTF-8、emoji、中文、surrogate pair | 排除编码差异 |
| Array/Object | sort、JSON.stringify、属性枚举顺序 | 排除序列化差异 |
| Date/Timezone | 时区、ISO 字符串、时间戳 | 排除时间格式差异 |
| Encoding | atob/btoa、TextEncoder、URLSearchParams | 排除编码和 Query 序列化差异 |
| Random | Math.random、crypto.getRandomValues 是否被依赖 | 判断是否要固定随机源 |

使用：

```bash
node scripts/precheck_runtime.js --markdown
node scripts/precheck_runtime.js --json
```

浏览器侧也运行同类片段，把结果放入 `notes/runtime-precheck-browser.json`，再与 Node 结果比对。

## init 参数检查

很多 SDK 签名失败不是缺环境，而是初始化参数不完整。补环境前必须确认：

- SDK 初始化函数是否已执行。
- appId / tenantId / clientId / channel / version 是否来自页面配置。
- 初始化是否读取 meta 标签、script 标签、window 全局配置或 localStorage。
- 是否需要先加载 runtime chunk、vendor chunk、polyfill chunk。
- 初始化是否异步等待网络、Worker、WASM 或事件。
- 入口函数调用前是否需要触发页面事件或队列 flush。

输出模板：

```markdown
## SDK / 入口初始化检查

- 初始化函数：
- 初始化参数来源：
- 必需全局配置：
- 必需存储值：
- 必需 Cookie：
- 必需加载顺序：
- 当前缺失：
- 是否可以调用入口：是 / 否
```
