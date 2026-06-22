#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const STAGE_FILES = {
  '需求信息确认': '01-需求信息确认.md',
  'intake': '01-需求信息确认.md',
  '取证方案确认': '02-取证方案确认.md',
  'forensics': '02-取证方案确认.md',
  '请求样本与可疑参数确认': '03-请求样本与可疑参数确认.md',
  'params': '03-请求样本与可疑参数确认.md',
  'JS文件与入口定位': '04-JS文件与入口定位.md',
  'entry': '04-JS文件与入口定位.md',
  '补环境前置分析': '05-补环境前置分析.md',
  'pre-env': '05-补环境前置分析.md',
  '补环境实现记录': '06-补环境实现记录.md',
  'env': '06-补环境实现记录.md',
  '验证与清理记录': '07-验证与清理记录.md',
  'validation': '07-验证与清理记录.md',
};

function parseArgs(argv) {
  const args = { caseDir: '', requiredStages: [], json: false, markdown: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--case-dir' || a === '--dir' || a === '-d') args.caseDir = argv[++i] || '';
    else if (a === '--require-stage') args.requiredStages.push(argv[++i] || '');
    else if (a === '--require-initial') args.requiredStages.push('需求信息确认');
    else if (a === '--json') args.json = true;
    else if (a === '--markdown') args.markdown = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`未知参数：${a}`);
  }
  if (!args.requiredStages.length) args.requiredStages.push('需求信息确认');
  if (!args.json && !args.markdown) args.markdown = true;
  return args;
}
function usage() {
  return `用法：
  node scripts/check_stage_reports.js --case-dir case --require-stage 需求信息确认 --markdown
  node scripts/check_stage_reports.js --case-dir case --require-stage 需求信息确认 --require-stage 请求样本与可疑参数确认 --json

说明：检查阶段报告是否使用中文文件名、UTF-8 编码，并确认必要阶段报告存在。`;
}
function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }
function stat(p) { try { return fs.statSync(p); } catch { return null; } }
function readText(p) { return fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''); }
function hasChinese(s) { return /[\u4e00-\u9fff]/.test(String(s || '')); }
function rel(root, p) { return (path.relative(root, p) || '.').replace(/\\/g, '/'); }
function listMarkdown(dir) {
  if (!exists(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = stat(p);
    if (st && st.isFile() && path.extname(name).toLowerCase() === '.md') out.push(p);
  }
  return out.sort();
}
function stageFileName(stage) {
  const s = String(stage || '').trim();
  return STAGE_FILES[s] || (hasChinese(s) ? `${s}.md` : '');
}
function hasMojibake(text) {
  const questionRuns = text.match(/\?{3,}/g) || [];
  return text.includes('\uFFFD') || (questionRuns.reduce((n, x) => n + x.length, 0) >= 8 && !hasChinese(text));
}
function check(args) {
  if (!args.caseDir) throw new Error('必须提供 --case-dir');
  const caseDir = path.resolve(args.caseDir);
  const stageDir = path.join(caseDir, '阶段报告');
  const reports = listMarkdown(stageDir);
  const problems = [];
  const warnings = [];
  if (!exists(stageDir)) problems.push('缺少阶段报告目录：case/阶段报告');
  if (!reports.length) problems.push('缺少阶段报告 Markdown 文件，至少应生成 01-需求信息确认.md');
  const reportResults = [];
  for (const file of reports) {
    const name = path.basename(file);
    const item = { file: rel(caseDir, file), chineseFileName: hasChinese(name), utf8Readable: false, mojibakeSuspected: false, initialRequiredFieldsMissing: [] };
    if (!item.chineseFileName) problems.push(`阶段报告文件名必须包含中文：${item.file}`);
    let text = '';
    try { text = readText(file); item.utf8Readable = true; } catch (err) { problems.push(`阶段报告无法按 UTF-8 读取：${item.file}：${err.message}`); }
    if (text) {
      item.mojibakeSuspected = hasMojibake(text);
      if (item.mojibakeSuspected) problems.push(`阶段报告疑似乱码：${item.file}`);
      if (name === '01-需求信息确认.md') {
        for (const key of ['目标网站 URL', '目标 API', '取证模式', '加密参数', '已知 JS 文件']) {
          if (!text.includes(key)) item.initialRequiredFieldsMissing.push(key);
        }
        if (item.initialRequiredFieldsMissing.length) problems.push(`需求信息确认报告缺少字段：${item.initialRequiredFieldsMissing.join('、')}`);
      }
    }
    reportResults.push(item);
  }
  for (const stage of args.requiredStages) {
    const fileName = stageFileName(stage);
    if (!fileName) problems.push(`未知必需阶段：${stage}`);
    else if (!exists(path.join(stageDir, fileName))) problems.push(`缺少必需阶段报告：${fileName}`);
  }
  return { caseDir, stageDir, clean: problems.length === 0, problems, warnings, reports: reportResults };
}
function renderMarkdown(result) {
  const lines = ['# 阶段报告检查结果', '', `case 目录：${result.caseDir}`, `阶段报告目录：${result.stageDir}`, `是否通过：${result.clean ? '是' : '否'}`, ''];
  lines.push('## 报告列表');
  if (result.reports.length) {
    for (const r of result.reports) lines.push(`- ${r.file}：中文文件名=${r.chineseFileName ? '是' : '否'}，UTF-8=${r.utf8Readable ? '是' : '否'}，疑似乱码=${r.mojibakeSuspected ? '是' : '否'}`);
  } else lines.push('- 无');
  if (result.problems.length) {
    lines.push('', '## 问题');
    for (const p of result.problems) lines.push(`- ${p}`);
  }
  if (result.warnings.length) {
    lines.push('', '## 提醒');
    for (const w of result.warnings) lines.push(`- ${w}`);
  }
  return lines.join('\n') + '\n';
}
try {
  const args = parseArgs(process.argv);
  if (args.help) { console.log(usage()); process.exit(0); }
  const result = check(args);
  if (args.json) console.log(JSON.stringify(result, null, 2));
  if (args.markdown) process.stdout.write(renderMarkdown(result));
  process.exit(result.clean ? 0 : 1);
} catch (err) { console.error(err.message || String(err)); console.error(usage()); process.exit(1); }
