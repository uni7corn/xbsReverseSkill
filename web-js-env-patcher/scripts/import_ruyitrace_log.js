#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

function parseArgs(argv) {
  const args = { input: '', caseDir: '', name: '', maxExamples: 10, json: false, markdown: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--input') args.input = argv[++i] || '';
    else if (a === '--case-dir' || a === '--dir') args.caseDir = argv[++i] || '';
    else if (a === '--name') args.name = argv[++i] || '';
    else if (a === '--max-examples') args.maxExamples = Number(argv[++i] || '10');
    else if (a === '--json') args.json = true;
    else if (a === '--markdown') args.markdown = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`未知参数：${a}`);
  }
  if (!args.json && !args.markdown) args.markdown = true;
  return args;
}

function usage() {
  return `用法：
  node scripts/import_ruyitrace_log.js --input <trace.ndjson> --case-dir case --markdown

说明：复制 RuyiTrace NDJSON 日志到 case/ruyi-trace/logs/，并生成 notes/ruyitrace-summary.md。`;
}

function exists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

function safeName(name) {
  return String(name || '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 180);
}

function inc(map, key) {
  key = key || '(空)';
  map.set(key, (map.get(key) || 0) + 1);
}

function top(map, n) {
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, n).map(([key, count]) => ({ key, count }));
}

function classifyApi(api) {
  api = String(api || '');
  if (/Canvas|CanvasRenderingContext2D|OffscreenCanvas/.test(api)) return 'canvas';
  if (/WebGL|GLRenderingContext/.test(api)) return 'webgl';
  if (/Audio|Oscillator|Analyser|OfflineAudioContext/.test(api)) return 'audio';
  if (/Navigator|navigator/.test(api)) return 'navigator';
  if (/Screen|screen/.test(api)) return 'screen';
  if (/Crypto|getRandomValues|randomUUID/.test(api)) return 'crypto';
  if (/Performance|performance/.test(api)) return 'performance';
  if (/Storage|localStorage|sessionStorage|IndexedDB|IDB/.test(api)) return 'storage';
  if (/WebRTC|RTCPeerConnection|MediaDevices/.test(api)) return 'webrtc';
  if (/Worker|ServiceWorker|postMessage|MessageChannel/.test(api)) return 'worker-message';
  if (/Document|Element|Node|CSS|Style|Layout|DOMRect/.test(api)) return 'dom-layout';
  return 'other';
}

async function summarizeNdjson(file, maxExamples) {
  const apiCounts = new Map();
  const typeCounts = new Map();
  const categoryCounts = new Map();
  const fileCounts = new Map();
  const examples = [];
  let lines = 0, parsed = 0, invalid = 0;

  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const raw of rl) {
    const line = raw.replace(/^\uFEFF/, '').trim();
    if (!line) continue;
    lines++;
    let evt;
    try { evt = JSON.parse(line); parsed++; } catch { invalid++; continue; }
    const api = evt.api || evt.name || evt.path || '';
    inc(apiCounts, api);
    inc(typeCounts, evt.t || evt.type || '');
    inc(categoryCounts, classifyApi(api));
    const stack = Array.isArray(evt.stack) ? evt.stack : [];
    for (const s of stack) if (s && s.file) inc(fileCounts, s.file);
    if (examples.length < maxExamples) examples.push(evt);
  }
  return {
    lines,
    parsed,
    invalid,
    topApis: top(apiCounts, 30),
    topTypes: top(typeCounts, 20),
    topCategories: top(categoryCounts, 20),
    topStackFiles: top(fileCounts, 30),
    examples,
  };
}

function renderMarkdown(result) {
  const lines = ['# RuyiTrace 日志导入摘要', '', `- 原始日志：${result.input}`, `- 复制后日志：${result.copiedTo}`, `- 行数：${result.summary.lines}`, `- 成功解析：${result.summary.parsed}`, `- 解析失败：${result.summary.invalid}`];
  lines.push('', '## API 类别统计');
  for (const item of result.summary.topCategories) lines.push(`- ${item.key}：${item.count}`);
  lines.push('', '## 高频 API');
  for (const item of result.summary.topApis.slice(0, 20)) lines.push(`- ${item.key}：${item.count}`);
  lines.push('', '## 高频调用栈文件');
  if (!result.summary.topStackFiles.length) lines.push('- 未发现 stack.file');
  for (const item of result.summary.topStackFiles.slice(0, 20)) lines.push(`- ${item.key}：${item.count}`);
  lines.push('', '## 建议下一步');
  lines.push('- 将高频 API 映射到 `env-module-levels.md` 的 Level 1/2/3 环境模块。');
  lines.push('- 结合 stack.file / line / col 更新 `notes/entry-chain.md` 和 `notes/missing-env-priority.md`。');
  lines.push('- 仅把摘要写入最终报告，原始 NDJSON 作为本地证据文件保存或由用户确认删除。');
  return lines.join('\n') + '\n';
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) { console.log(usage()); return; }
  if (!args.input) throw new Error('必须提供 --input');
  if (!args.caseDir) throw new Error('必须提供 --case-dir');
  const input = path.resolve(args.input);
  const caseDir = path.resolve(args.caseDir);
  if (!exists(input)) throw new Error(`日志文件不存在：${input}`);
  if (!exists(caseDir)) fs.mkdirSync(caseDir, { recursive: true });
  const logDir = path.join(caseDir, 'ruyi-trace', 'logs');
  const notesDir = path.join(caseDir, 'notes');
  fs.mkdirSync(logDir, { recursive: true });
  fs.mkdirSync(notesDir, { recursive: true });
  const dstName = safeName(args.name || path.basename(input) || `trace-${Date.now()}.ndjson`);
  const copiedTo = path.join(logDir, dstName.endsWith('.ndjson') ? dstName : `${dstName}.ndjson`);
  fs.copyFileSync(input, copiedTo);
  const summary = await summarizeNdjson(copiedTo, args.maxExamples);
  const result = { input, copiedTo, summary };
  const md = renderMarkdown(result);
  fs.writeFileSync(path.join(notesDir, 'ruyitrace-summary.md'), md, 'utf8');
  if (args.json) console.log(JSON.stringify(result, null, 2));
  if (args.markdown) process.stdout.write(md);
}

main().catch(err => {
  console.error(err.message || String(err));
  console.error(usage());
  process.exit(1);
});
