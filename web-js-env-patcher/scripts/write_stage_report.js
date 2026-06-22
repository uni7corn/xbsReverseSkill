#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const STAGES = {
  '需求信息确认': { index: '01', title: '需求信息确认' },
  'intake': { index: '01', title: '需求信息确认' },
  '取证方案确认': { index: '02', title: '取证方案确认' },
  'forensics': { index: '02', title: '取证方案确认' },
  '请求样本与可疑参数确认': { index: '03', title: '请求样本与可疑参数确认' },
  'params': { index: '03', title: '请求样本与可疑参数确认' },
  'JS文件与入口定位': { index: '04', title: 'JS文件与入口定位' },
  'entry': { index: '04', title: 'JS文件与入口定位' },
  '补环境前置分析': { index: '05', title: '补环境前置分析' },
  'pre-env': { index: '05', title: '补环境前置分析' },
  '补环境实现记录': { index: '06', title: '补环境实现记录' },
  'env': { index: '06', title: '补环境实现记录' },
  '验证与清理记录': { index: '07', title: '验证与清理记录' },
  'validation': { index: '07', title: '验证与清理记录' },
};

function parseArgs(argv) {
  const args = { caseDir: '', stage: '', input: '', data: '', out: '', append: false, json: false, markdown: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--case-dir' || a === '--dir' || a === '-d') args.caseDir = argv[++i] || '';
    else if (a === '--stage' || a === '-s') args.stage = argv[++i] || '';
    else if (a === '--input' || a === '-i') args.input = argv[++i] || '';
    else if (a === '--data') args.data = argv[++i] || '';
    else if (a === '--out' || a === '-o') args.out = argv[++i] || '';
    else if (a === '--append') args.append = true;
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
  node scripts/write_stage_report.js --case-dir case --stage 需求信息确认 --data case/notes/需求信息.json --markdown
  node scripts/write_stage_report.js --case-dir case --stage 请求样本与可疑参数确认 --input case/tmp/可疑参数草稿.md --markdown
  node scripts/write_stage_report.js --case-dir case --stage 验证与清理记录 --append --input case/tmp/清理结果.md --json

说明：以 UTF-8 写入中文命名阶段报告，默认输出到 case/阶段报告/<编号-阶段名>.md。`;
}

function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }
function readText(file) { return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''); }
function readStdin() { try { return fs.readFileSync(0, 'utf8').replace(/^\uFEFF/, ''); } catch { return ''; } }
function hasChinese(s) { return /[\u4e00-\u9fff]/.test(String(s || '')); }
function hasBadQuestionMarks(text) {
  const runs = text.match(/\?{3,}/g) || [];
  const count = runs.reduce((n, x) => n + x.length, 0);
  return count >= 8 && !hasChinese(text);
}
function ensureParent(file) { fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true }); }
function safeString(value) {
  if (value === undefined || value === null || value === '') return '未提供';
  if (Array.isArray(value)) return value.length ? value.map(safeString).join('、') : '未提供';
  if (typeof value === 'object') return Object.keys(value).length ? JSON.stringify(value, null, 2) : '未提供';
  const s = String(value);
  if (/^(authorization|cookie|token)$/i.test(s)) return '已脱敏';
  return s.replace(/(authorization\s*[:=]\s*)([^\s;]+)/ig, '$1已脱敏')
    .replace(/(cookie\s*[:=]\s*)([^\n]+)/ig, '$1已脱敏')
    .replace(/([A-Za-z0-9_\-]{4})[A-Za-z0-9_\-.=]{16,}([A-Za-z0-9_\-]{4})/g, '$1...$2(已脱敏)');
}
function loadJson(file) {
  if (!file) return {};
  return JSON.parse(readText(file));
}
function normalizeStage(stage) {
  const s = String(stage || '').trim();
  const ret = STAGES[s];
  if (ret) return ret;
  if (!s) throw new Error('必须提供 --stage');
  if (!hasChinese(s)) throw new Error(`未知阶段：${s}。自定义阶段名称必须包含中文。`);
  return { index: '自定义', title: s };
}
function defaultOut(caseDir, stage) {
  const file = stage.index === '自定义' ? `${stage.title}.md` : `${stage.index}-${stage.title}.md`;
  return path.join(caseDir, '阶段报告', file);
}
function renderDataReport(stage, data) {
  const title = stage.title;
  const lines = [
    `# 阶段报告：${title}`,
    '',
    `生成时间：${new Date().toISOString()}`,
    `阶段状态：${safeString(data.status || data.stageStatus || '待确认')}`,
    '',
  ];
  if (title === '需求信息确认') {
    lines.push('## 1. 用户已提供信息', '');
    const fields = [
      ['目标网站 URL', data.targetUrl || data.siteUrl || data.url],
      ['目标页面 URL', data.pageUrl || data.page],
      ['目标 API', data.apiUrl || data.api],
      ['请求方法', data.method],
      ['加密参数', data.cryptoParams || data.params || data.param],
      ['参数位置', data.paramLocation || data.position],
      ['取证模式', data.acquisitionMode || data.forensicsMode],
      ['最终请求 TLS 指纹兼容客户端', data.tlsClient],
      ['已知 JS 文件 / 加密文件', data.jsFiles || data.cryptoFiles],
      ['是否需要登录', data.loginRequired],
    ];
    for (const [k, v] of fields) lines.push(`- ${k}：${safeString(v)}`);
    lines.push('', '## 2. 已提供样本与证据', '');
    for (const [k, v] of [
      ['cURL / HAR', data.requestSample || data.curl || data.har],
      ['响应样本', data.responseSample],
      ['浏览器 fixture', data.fixture],
      ['RuyiTrace NDJSON', data.ruyiTrace],
      ['Camoufox / CloakBrowser / ruyiPage 取证记录', data.browserEvidence],
    ]) lines.push(`- ${k}：${safeString(v)}`);
    lines.push('', '## 3. 缺失信息与阻塞点', '');
    lines.push(`- 缺失项：${safeString(data.missingItems || data.missing)}`);
    lines.push(`- 阻塞原因：${safeString(data.blockers)}`);
    lines.push(`- 需要用户确认：${safeString(data.needUserConfirm || data.confirmation)}`);
    lines.push('', '## 4. 下一步计划', '');
    const next = data.nextSteps || ['校验请求样本完整性', '列出所有可疑加密参数并等待用户确认', '确认取证工具和 TLS 请求客户端可用性'];
    for (const [i, item] of [].concat(next).entries()) lines.push(`${i + 1}. ${safeString(item)}`);
  } else {
    lines.push('## 阶段结论', '', safeString(data.summary || data.conclusion || '待补充'), '');
    lines.push('## 关键证据', '', safeString(data.evidence || '待补充'), '');
    lines.push('## 阻塞点与下一步', '', safeString(data.nextSteps || data.blockers || '待补充'), '');
  }
  return lines.join('\n') + '\n';
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.caseDir || !args.stage) {
    console.log(usage());
    process.exit(args.help ? 0 : 1);
  }
  const caseDir = path.resolve(args.caseDir);
  const stage = normalizeStage(args.stage);
  const out = path.resolve(args.out || defaultOut(caseDir, stage));
  if (!hasChinese(path.basename(out))) throw new Error(`阶段报告文件名必须包含中文：${out}`);
  let content = '';
  if (args.input) content = readText(args.input);
  else if (args.data) content = renderDataReport(stage, loadJson(args.data));
  else content = readStdin();
  if (!content.trim()) content = renderDataReport(stage, {});
  if (hasBadQuestionMarks(content) || content.includes('\uFFFD')) throw new Error('阶段报告内容疑似存在中文编码损坏，请重新生成草稿。');
  ensureParent(out);
  if (args.append && exists(out)) fs.appendFileSync(out, '\n' + content, 'utf8');
  else fs.writeFileSync(out, content, 'utf8');
  const result = { ok: true, stage: stage.title, out, bytes: Buffer.byteLength(content, 'utf8'), encoding: 'utf8', chineseFileName: hasChinese(path.basename(out)) };
  if (args.json) console.log(JSON.stringify(result, null, 2));
  if (args.markdown) {
    console.log('# 阶段报告写入结果');
    console.log('');
    console.log(`- 阶段：${result.stage}`);
    console.log(`- 输出文件：${result.out}`);
    console.log(`- 中文文件名：${result.chineseFileName ? '是' : '否'}`);
    console.log(`- 编码：${result.encoding}`);
    console.log('- 状态：写入完成');
  }
}

try { main(); } catch (err) { console.error(err.message || String(err)); console.error(usage()); process.exit(1); }
