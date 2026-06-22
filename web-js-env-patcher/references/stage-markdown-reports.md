# 分阶段中文 Markdown 报告规则

本文件用于约束一个高难度 Web JS Node.js 补环境 case 在多轮对话中的阶段性总结产物。阶段报告不是最终总结的替代品，而是在每个关键阶段结束时沉淀用户已确认的信息、证据来源、阻塞点和下一步计划，方便跨轮对话继续工作。

## 硬性规则

- 所有由 Skill 生成的 Markdown 报告文件名必须包含中文，不能只使用 `final-summary.md`、`stage-1.md`、`report.md` 这类英文文件名。
- 阶段报告统一写入 `case/阶段报告/`，最终总结统一写入 `case/result/最终项目总结.md`。
- Markdown 内容必须 UTF-8 写入；不要使用未指定编码的 shell 重定向写中文。
- 每个阶段结束后立即写入或更新对应阶段报告，不要等项目完成后一次性补写。
- 阶段报告只写阶段结论、用户确认信息、证据摘要和下一步计划；不要写入明文 Cookie、Authorization、账号、手机号、完整 token、完整 localStorage 等敏感内容。
- 阶段报告可以记录临时证据路径，但必须标注“临时证据 / 已清理 / 需用户确认保留”，不要把临时 hook、trace、HAR、截图、Profile 当成最终交付物。
- 如果用户明确要求不生成阶段报告，必须在对话和最终总结中记录该豁免；否则默认生成。

## 推荐阶段与中文文件名

| 阶段 | 文件名 | 触发时机 |
|---|---|---|
| 需求信息确认 | `01-需求信息确认.md` | 用户提供 URL、API、参数、样本、取证模式等初始材料后，或发现信息不完整并列出缺失项时 |
| 取证方案确认 | `02-取证方案确认.md` | 用户确认 ruyiPage / RuyiTrace / Camoufox / CloakBrowser / 手动取证 / AI 自行决定后 |
| 请求样本与可疑参数确认 | `03-请求样本与可疑参数确认.md` | 解析 cURL / HAR / 请求样本并列出所有可疑加密参数后 |
| JS文件与入口定位 | `04-JS文件与入口定位.md` | 收集 JS 文件、定位 source / entry / builder / writer 后 |
| 补环境前置分析 | `05-补环境前置分析.md` | 进入 Node.js 补环境前，完成日志、trace、依赖和风险优先级整理后 |
| 补环境实现记录 | `06-补环境实现记录.md` | env / signer / request 模块形成并通过主要 fixture 后 |
| 验证与清理记录 | `07-验证与清理记录.md` | 最终请求验证、代码质量检查、最终产物检查、清理检查完成后 |
| 最终项目总结 | `最终项目总结.md` | 项目完成后，写入 `case/result/最终项目总结.md` |

可以根据实际 case 增加中文命名阶段报告，例如 `08-二次补样复盘.md`、`09-线上复测记录.md`，但文件名仍必须包含中文。

## 阶段报告写入命令

优先使用脚本生成或写入，避免编码问题：

```bash
node scripts/write_stage_report.js --case-dir case --stage 需求信息确认 --data case/notes/需求信息.json --markdown
node scripts/write_stage_report.js --case-dir case --stage 请求样本与可疑参数确认 --input case/tmp/可疑参数草稿.md --markdown
node scripts/write_stage_report.js --case-dir case --stage 验证与清理记录 --append --input case/tmp/清理结果.md --markdown
```

写入任意中文命名 Markdown 时使用：

```bash
node scripts/write_markdown_utf8.js --input case/tmp/总结草稿.md --out case/result/最终项目总结.md --require-chinese-name --markdown
```

检查阶段报告：

```bash
node scripts/check_stage_reports.js --case-dir case --require-stage 需求信息确认 --markdown
node scripts/check_stage_reports.js --case-dir case --require-stage 需求信息确认 --require-stage 请求样本与可疑参数确认 --json
```

## 阶段 1：需求信息确认报告内容

当用户刚提供需求信息时，优先生成 `case/阶段报告/01-需求信息确认.md`。内容至少包含：

- 目标网站 URL。
- 目标页面 URL。
- 目标 API。
- 请求方法。
- 用户声明的加密参数。
- 请求样本中发现的可疑加密参数。
- 参数位置：Query / Header / Body / Cookie。
- 取证模式选择：ruyiPage + RuyiTrace / 仅 ruyiPage / Camoufox + camoufox-reverse-mcp / 仅 Camoufox / CloakBrowser / 用户手动取证 / AI 自行决定。
- 最终请求 TLS 指纹兼容客户端选择。
- 已提供的 JS 文件 / 加密文件 / bundle / chunk / sourcemap。
- 是否需要登录，以及是否等待用户手动登录。
- 已提供材料列表与缺失材料列表。
- 下一步需要用户确认的问题。

如果信息不完整，也要生成该阶段报告，明确“当前不能进入正式分析”的原因和待补充项。

## 阶段报告模板

```markdown
# 阶段报告：需求信息确认

生成时间：
阶段状态：信息完整 / 信息不完整 / 等待用户确认

## 1. 用户已提供信息

- 目标网站 URL：
- 目标页面 URL：
- 目标 API：
- 请求方法：
- 加密参数：
- 参数位置：
- 取证模式：
- 最终请求 TLS 指纹兼容客户端：
- 已知 JS 文件 / 加密文件：
- 是否需要登录：

## 2. 已提供样本与证据

- cURL / HAR：
- 响应样本：
- 浏览器 fixture：
- RuyiTrace NDJSON：
- Camoufox / CloakBrowser / ruyiPage 取证记录：

## 3. 缺失信息与阻塞点

- 缺失项：
- 阻塞原因：
- 需要用户确认：

## 4. 下一步计划

1. 
2. 
3. 
```

## 最终总结与阶段报告关系

- 阶段报告记录“当时的状态”和“阶段性结论”，允许出现待确认项。
- `result/最终项目总结.md` 记录最终结论，必须引用阶段报告中的关键决策，但不要重复粘贴所有中间日志。
- 最终交付检查时，应确认 `case/阶段报告/` 中至少存在 `01-需求信息确认.md`，并确认文件名和内容均为 UTF-8 中文正常显示。
