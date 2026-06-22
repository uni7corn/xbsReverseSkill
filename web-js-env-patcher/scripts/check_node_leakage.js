#!/usr/bin/env node
'use strict';

function parseArgs(argv) {
  const args = { json: false, markdown: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--markdown') args.markdown = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`未知参数：${a}`);
  }
  if (!args.json && !args.markdown) args.markdown = true;
  return args;
}

function usage() {
  return `用法：
  node scripts/check_node_leakage.js --markdown
  node scripts/check_node_leakage.js --json

说明：检查当前 Node 宿主中常见泄露变量，并给出目标 JS 运行上下文的阻断清单。该上下文可为 vm、独立 Node 进程或显式隔离的 global。`;
}

function collect() {
  const globalNames = ['process', 'Buffer', 'global', 'setImmediate', 'clearImmediate', 'queueMicrotask', 'WebAssembly'];
  const moduleScope = {
    require: typeof require !== 'undefined',
    module: typeof module !== 'undefined',
    exports: typeof exports !== 'undefined',
    __dirname: typeof __dirname !== 'undefined',
    __filename: typeof __filename !== 'undefined',
  };
  const globals = globalNames.map(name => ({ name, visibleOnGlobalThis: typeof globalThis[name] !== 'undefined', type: typeof globalThis[name] }));
  const denyList = ['process', 'Buffer', 'require', 'module', 'exports', 'global', '__dirname', '__filename', 'setImmediate', 'clearImmediate', 'Error.prepareStackTrace'];
  return {
    note: '当前脚本运行在 Node 宿主中，存在这些变量是正常现象；目标网页 JS 所在运行上下文中不应暴露它们。',
    host: { node: process.version, platform: process.platform, arch: process.arch, v8: process.versions.v8 },
    globals,
    moduleScope,
    denyList,
    contextExpectations: {
      process: 'undefined',
      Buffer: 'undefined',
      require: 'undefined',
      module: 'undefined',
      global: 'undefined',
      functionProcess: 'Function("return typeof process")() 应为 "undefined"',
    },
    recommendations: [
      '不要把宿主函数、宿主数组、宿主 URL/TextEncoder 构造器直接塞进目标 JS 运行上下文。',
      '在目标 JS 运行上下文内部定义 fetch、XHR、atob、console 等函数，避免 constructor.constructor 泄露。',
      '目标 JS 运行前检查 Function("return typeof process")()。',
      '最终 runner 中不要为了调试暴露 require、process、Buffer。',
    ],
  };
}

function renderMarkdown(result) {
  const lines = ['# Node 泄露阻断检查', '', `- Node.js：${result.host.node}`, `- 平台：${result.host.platform}-${result.host.arch}`, '', `说明：${result.note}`];
  lines.push('', '## 宿主全局变量状态');
  for (const g of result.globals) lines.push(`- ${g.name}：${g.visibleOnGlobalThis ? '宿主可见' : '宿主不可见'}（${g.type}）`);
  lines.push('', '## 模块作用域变量');
  for (const [k, v] of Object.entries(result.moduleScope)) lines.push(`- ${k}：${v ? '存在' : '不存在'}`);
  lines.push('', '## 目标运行上下文阻断清单');
  for (const name of result.denyList) lines.push(`- ${name}`);
  lines.push('', '## 建议');
  for (const item of result.recommendations) lines.push(`- ${item}`);
  return lines.join('\n') + '\n';
}

try {
  const args = parseArgs(process.argv);
  if (args.help) { console.log(usage()); process.exit(0); }
  const result = collect();
  if (args.json) console.log(JSON.stringify(result, null, 2));
  if (args.markdown) process.stdout.write(renderMarkdown(result));
} catch (err) {
  console.error(err.message || String(err));
  console.error(usage());
  process.exit(1);
}
