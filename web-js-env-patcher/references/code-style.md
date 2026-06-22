# 补环境代码可读性与中文注释规范

每次生成、重构或交付 `case/result/` 中的补环境代码前读取本文件。目标是让最终代码 **简洁、可读、可维护、中文注释正常显示**，并避免生成压缩、堆叠、无注释或乱码代码。

## 硬性原则

1. **先规划目录，再写代码**  
   写代码前先列出最终目录、每个文件职责和调用关系。不要边写边临时堆文件。

2. **按职责拆模块**  
   不要把所有补环境逻辑塞进一个 `env.js`。推荐结构：

   ```text
   case/result/
   ├── final.js
   ├── 最终项目总结.md
   └── src/
       ├── env/
       │   ├── install-env.js
       │   ├── native-api.js
       │   ├── browser-objects/
       │   │   ├── navigator.js
       │   │   ├── document.js
       │   │   ├── location.js
       │   │   └── storage.js
       │   └── fingerprint/
       │       ├── canvas.js
       │       ├── webgl.js
       │       └── dom-geometry.js
       ├── target/
       │   └── entry.js
       ├── request/
       │   └── client.js
       └── utils/
           └── normalize.js
   ```

3. **补环境代码必须可读**  
   禁止压缩代码、单行堆叠多个语句、过度匿名函数、无意义变量名、超长函数和超深嵌套。原始目标 bundle 如必须保留，应放到 `src/target/original/` 或等价目录，并与手写补环境代码分离。

4. **中文注释必须正常显示**  
   所有交付源码使用 UTF-8 无 BOM。不要使用未指定编码的 PowerShell / cmd 重定向写中文源码。中文注释中不得出现问号、连续问号或替换字符。

5. **注释说明“为什么”和“来源”**  
   注释不是逐行翻译代码，而是说明模块职责、浏览器样本来源、RuyiTrace 证据、fixture 匹配规则、addon-first 决策和 fallback 原因。

## 中文注释要求

必须写中文注释的位置：

- 文件顶部：说明模块职责、输入来源和边界。
- 每个环境对象模块：说明模拟哪个浏览器对象。
- 关键 getter / setter：说明真实值来自 fixture、RuyiTrace、请求样本还是用户配置。
- native-like 函数和构造函数：说明挂载位置、浏览器行为和 addon-first 处理。
- fallback 分支：说明 addon 不可用、ABI 不兼容、API 调用失败或用户明确豁免的原因。
- 指纹值回放函数：说明匹配 key、采样来源和缺失样本时的处理。
- 加密参数生成入口：说明输入、输出和 fixtures 验证方式。

禁止：

```js
// 不合格：用问句解释实现
// 不合格：连续问号乱码示例
// 临时先这样
```

推荐：

```js
// 安装 Navigator 相关环境对象，字段值来自浏览器 fixture
function installNavigatorEnv(globalObject, fixture, nativeApi) {
  // Navigator 构造函数保持浏览器不可直接构造的行为
  const Navigator = nativeApi.createNativeConstructor('Navigator', 0, function Navigator() {
    throw new TypeError('Illegal constructor');
  });

  // userAgent 使用真实浏览器采样值，不在 Node.js 中伪造默认值
  nativeApi.defineNativeGetter(Navigator.prototype, 'userAgent', function getUserAgent() {
    return fixture.browser.userAgent;
  });
}
```

## 命名与函数拆分

- 函数名使用业务含义，例如 `installNavigatorEnv`、`createStorageArea`、`replayCanvasToDataURL`。
- 避免 `a`、`b`、`fn1`、`tmp`、`xxx` 作为长期变量名。
- 单函数建议不超过 90 行。
- 单文件建议不超过 500 行。
- 单行建议不超过 180 字符。
- 嵌套层级尽量不超过 6 层；复杂逻辑用提前返回或拆函数。

## 最终交付前检查

交付前必须运行：

```bash
node scripts/check_code_quality.js --case-dir case --markdown
node scripts/check_env_realism.js --case-dir case --markdown
node scripts/check_final_artifact.js --case-dir case --markdown
```

如果 `check_code_quality.js` 失败，先重构代码、修复中文注释和编码问题，再交付。

## 常见修复方式

| 问题 | 修复方式 |
|---|---|
| 单个 `env.js` 太大 | 按 navigator、document、storage、fingerprint 拆模块 |
| 没有中文注释 | 增加文件头、对象说明、来源说明和 fallback 原因 |
| 中文注释有问号或乱码 | 用 UTF-8 重新写入，避免默认 shell 重定向 |
| 函数过长 | 拆成解析 fixture、创建构造函数、安装属性、安装实例四步 |
| 普通赋值太多 | 改为统一 helper，例如 `defineValue`、`defineNativeGetter` |
| target bundle 混入手写代码 | 原始 bundle 放 `src/target/original/`，入口包装放 `src/target/entry.js` |
