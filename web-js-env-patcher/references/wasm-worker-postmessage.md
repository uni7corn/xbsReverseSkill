# WASM / Worker / postMessage 处理

本文件用于网页端 JS 补环境中遇到 Worker、WASM、iframe 或 postMessage 的情况。范围仍然限定在网页端 JS 运行链路，不扩展到 Native 逆向。

## 判断信号

- 目标 JS 调用 `new Worker()`、`SharedWorker()`。
- 入口函数返回 Promise，实际签名在异步消息中完成。
- trace 出现 `postMessage`、`onmessage`、`MessageChannel`。
- Network 中额外加载 `.wasm` 或 worker chunk。
- 加密入口只负责封装消息，真正结果从回调返回。

## 处理顺序

1. 记录主线程调用 `postMessage` 的消息体。
2. 收集 Worker JS、动态 chunk、WASM 文件和初始化参数。
3. 确认 Worker 返回消息格式：成功、失败、初始化完成、签名结果。
4. 如果只是消息转发，优先在 Node 中模拟消息通道，不要直接改算法。
5. 如果 WASM 参与网页签名，只记录 JS 调用边界和导出函数名；不要扩大到 Native 工具链。
6. 用 fixtures 验证异步结果，不以 Promise resolved 为完成。

## 记录模板

```markdown
## Worker/WASM 消息链

- 主线程文件：
- Worker 文件：
- WASM 文件：
- 初始化消息：
- 签名请求消息：
- 签名响应消息：
- 依赖的浏览器环境：
- Node 模拟策略：真实 Worker / vm 模拟 / 手动封装消息通道
- 阻塞点：
```
