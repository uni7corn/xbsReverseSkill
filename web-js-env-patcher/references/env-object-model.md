# 浏览器环境对象模型补齐指南

当需要从 trace 结果编写 `env.js` 或 `runner.js` 时读取本文件。

## 总体原则

不要一开始伪造完整浏览器。优先根据目标 JS 的实际访问路径补齐最小对象模型。

推荐顺序：

```text
全局对象 → location / navigator / document → storage / cookie → crypto / performance → network → DOM 原型链
```

## 全局对象

基础关系：

```js
globalThis.window = globalThis;
globalThis.self = globalThis;
globalThis.top = globalThis;
globalThis.parent = globalThis;
```

注意：真实浏览器里 `window` 不是普通对象。若目标 JS 检查 `instanceof Window`、`Object.prototype.toString.call(window)`、原型链或描述符，需要切换到更真实的对象模型或使用可选 native addon。

## 属性定义工具与模板模块


本 Skill 随包提供可复制模板：

- `assets/env-modules/native-protect.js`：`NativeProtect` 与 `defineNativeGetter` / `defineNativeValue` / `markObjectToString` 辅助函数。
- `assets/env-modules/base-env.js`：`Window` / `Location` / `Navigator` 最小原型链、描述符和 getter toString 保护。
- `assets/env-modules/storage-env.js`：`Storage` 构造函数、`localStorage` / `sessionStorage` 实例、方法和 length getter 的 native-like 保护。
- `assets/env-modules/document-env.js`：`EventTarget → Node → Document → HTMLDocument` 基础链路、document cookie accessor、DOM 方法、`document.all` addon 优先处理。

复制模板后必须按当前目标的 RuyiTrace / fixtures 修改字段值，不要把模板默认值当成真实采集值。
补环境时不要随意赋值：

```js
navigator.userAgent = 'xxx';
```

推荐统一使用描述符：

```js
function defineValue(obj, key, value, options = {}) {
  Object.defineProperty(obj, key, {
    value,
    writable: options.writable ?? false,
    enumerable: options.enumerable ?? true,
    configurable: options.configurable ?? true,
  });
}

function defineGetter(obj, key, getter, options = {}) {
  Object.defineProperty(obj, key, {
    get: getter,
    enumerable: options.enumerable ?? true,
    configurable: options.configurable ?? true,
  });
}
```

描述符来源优先级：

1. 用户真实浏览器控制台采集。
2. CloakBrowser / 真实 Chrome 中执行采集脚本。
3. 常见浏览器行为模板。
4. 目标 JS 实际检测结果。

## navigator

常见字段：

| 字段 | 来源 |
|---|---|
| `userAgent` | 必须尽量来自真实请求 UA |
| `language` / `languages` | 来自浏览器样本 |
| `platform` | 来自浏览器样本 |
| `hardwareConcurrency` | 来自浏览器样本或用户确认 |
| `deviceMemory` | 来自浏览器样本或用户确认 |
| `webdriver` | 普通浏览器通常应为 `false` 或不存在，取决于目标环境 |
| `plugins` / `mimeTypes` | 若被检查，优先真实采集或用可选 addon |

示例：

```js
function Navigator() {}
const navigator = Object.create(Navigator.prototype);

Object.defineProperty(Navigator.prototype, Symbol.toStringTag, {
  value: 'Navigator',
  configurable: true,
});

defineValue(Navigator.prototype, 'constructor', Navigator, {
  writable: true,
  enumerable: false,
  configurable: true,
});

defineGetter(Navigator.prototype, 'userAgent', function getUserAgent() {
  return fixture.browser.userAgent;
});
```

如果目标 JS 检测 getter 的 `toString()`，必须先尝试 addon `createGetter`；只有 addon 不可用或调用失败时，才在目标 JS 运行上下文中使用 `NativeProtect.setNativeFunc(getter, "get userAgent")` fallback；不能只补返回值。

## location

`location` 经常参与签名。不要用空字符串猜测。

应从目标页面 URL 解析：

```js
const u = new URL(fixture.pageUrl);
const location = {
  href: u.href,
  origin: u.origin,
  protocol: u.protocol,
  host: u.host,
  hostname: u.hostname,
  port: u.port,
  pathname: u.pathname,
  search: u.search,
  hash: u.hash,
};
```

如果目标 JS 检查 `Location` 原型链，再补构造函数、`Symbol.toStringTag` 和描述符。

## document 与 cookie

常见访问：

- `document.cookie`
- `document.referrer`
- `document.URL`
- `document.documentElement`
- `document.createElement`
- `document.querySelector`
- `document.all`

`document.cookie` 建议用 getter / setter。若目标 JS 只读取 cookie，可以先实现 getter；如果会写 cookie，必须实现 setter 和过期策略的最小行为。

## `document.all`

`document.all` 是特殊对象。优先使用可选 native addon 的 `createUndetectable`：

```js
Object.defineProperty(document, 'all', {
  value: addon.createUndetectable(function () {
    return undefined;
  }),
  enumerable: false,
  configurable: true,
});
```

期望关键行为：

```js
typeof document.all === 'undefined'
document.all == undefined
document.all !== undefined
Boolean(document.all) === false
```

如果 addon 不可用，只能用 `undefined` 近似，并在报告中标记真实性不足。

## Storage

实现 `localStorage` / `sessionStorage` 时优先建立 `Storage` 原型：

```js
function Storage() {}
const localMap = new Map();
const localStorage = Object.create(Storage.prototype);

defineValue(Storage.prototype, 'getItem', function getItem(key) {
  key = String(key);
  return localMap.has(key) ? localMap.get(key) : null;
}, { writable: true, enumerable: true, configurable: true });

defineValue(Storage.prototype, 'setItem', function setItem(key, value) {
  localMap.set(String(key), String(value));
}, { writable: true, enumerable: true, configurable: true });
```

若目标 JS 检查 `getItem.toString()` 或 `Object.getOwnPropertyDescriptor(Storage.prototype, "length").get.toString()`，必须先使用 addon `createNativeFunction` / `createGetter`，addon 不可用时再用 `NativeProtect` fallback 同时保护方法和访问器。

## crypto

`crypto.getRandomValues`、`crypto.subtle`、`crypto.randomUUID` 可能参与签名。

原则：

- 如果浏览器签名依赖随机数，fixtures 必须记录对应随机输入或控制随机源。
- 不能随意用真实随机数比较固定期望值。
- 对 `getRandomValues` 可在测试模式下使用 fixture 中的固定字节序列。

## performance 与时间

`Date.now()`、`new Date()`、`performance.now()` 经常影响签名。

验证时要固定：

```js
const fixedNow = fixture.runtime.now;
Date.now = () => fixedNow;
performance.now = () => fixture.runtime.performanceNow ?? 0;
```

如果目标 JS 使用 `new Date()`，需要进一步 patch `Date` 构造函数；仅 patch `Date.now` 不够。

## Canvas / WebGL / WebGPU / 字体 / DOM 几何指纹

这类指纹不要优先在 Node.js 中真实模拟渲染。真实浏览器的 Skia、GPU、字体、抗锯齿、颜色管理和布局细节很难由 `node-canvas` / `headless-gl` / `jsdom` 精确复现。

处理原则：

- 先读取 `fingerprint-value-replay.md`。
- 用用户确认的取证模式采集终端 API 返回值，例如 `toDataURL`、`getImageData`、`measureText`、`getParameter`、`readPixels`、`getBoundingClientRect`。
- 在 Node.js 中用 `assets/env-modules/fingerprint-env.js` 按调用特征回放采样值。
- 保留原型链、属性描述符、native-like `toString` 和实例对象 `Object.prototype.toString`。
- 缺少采样值时阻塞并提示补采样，不要静默返回空值或改用自动化浏览器作为最终方案。

示例接入：

```js
const { installFingerprintValueReplay } = require('./fingerprint-env');
const fingerprintFixture = require('../../fixtures/fingerprint.fixture.json');

installFingerprintValueReplay(globalThis, fingerprintFixture, {
  strict: true,
  addon,
});
```

最终项目中不得包含用于采样的 Hook、Playwright、Puppeteer、CloakBrowser、ruyiPage 或其他浏览器自动化代码。

## fetch 与 XMLHttpRequest

补环境阶段默认不应让目标 JS 真的发网络请求。

策略：

- 如果目标 JS 只构造请求或计算签名，`fetch` / `XMLHttpRequest` 可以记录调用并返回离线 fixture。
- 如果必须访问网络，先确认用户授权和访问范围。
- 不要把补环境 runner 变成批量请求工具。

## 原型链

当 RuyiTrace / Node trace / 目标 JS 检查以下内容时必须补原型链，不允许只用普通对象顶替：

```js
navigator instanceof Navigator
document instanceof Document
Object.getPrototypeOf(navigator)
navigator.constructor.name
Object.prototype.toString.call(navigator)
```

基础示例：

```js
function EventTarget() {}
function Node() {}
function Document() {}
function HTMLDocument() {}

Object.setPrototypeOf(Node.prototype, EventTarget.prototype);
Object.setPrototypeOf(Document.prototype, Node.prototype);
Object.setPrototypeOf(HTMLDocument.prototype, Document.prototype);

const document = Object.create(HTMLDocument.prototype);
```

不要为了“完整”一次性补所有 DOM。只补 trace 证明目标 JS 访问或检测的部分。
