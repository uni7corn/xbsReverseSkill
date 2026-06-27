#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = { caseDir: '', fixture: '', envFile: '', require: '', json: false, markdown: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--case-dir' || a === '--dir' || a === '-d') args.caseDir = argv[++i] || '';
    else if (a === '--fixture') args.fixture = argv[++i] || '';
    else if (a === '--env-file') args.envFile = argv[++i] || '';
    else if (a === '--require') args.require = argv[++i] || '';
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
  node scripts/check_fingerprint_fixture.js --case-dir case --require canvas,webgl --markdown
  node scripts/check_fingerprint_fixture.js --fixture case/fixtures/fingerprint.fixture.json --env-file case/result/src/env/fingerprint-env.js --json

说明：检查浏览器指纹 fixture 是否覆盖 Canvas / WebGL / WebGPU / Audio / DOM 几何等终端 API，是否绑定同一 fingerprint baseline，并检查最终 env 是否避免 node-canvas / headless-gl / 自动化浏览器等错误方向。`;
}

function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }
function stat(p) { try { return fs.statSync(p); } catch { return null; } }
function readText(p) { return fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''); }
function readJson(p) { return JSON.parse(readText(p)); }
function rel(root, p) { return (path.relative(root, p) || '.').replace(/\\/g, '/'); }
function ext(p) { return path.extname(p).toLowerCase(); }

function walk(p, out = []) {
  if (!exists(p)) return out;
  const st = stat(p);
  if (!st) return out;
  if (st.isDirectory()) {
    let names = [];
    try { names = fs.readdirSync(p); } catch { names = []; }
    for (const name of names) walk(path.join(p, name), out);
  } else if (st.isFile()) out.push(p);
  return out;
}

function countArray(v) { return Array.isArray(v) ? v.length : 0; }
function hasResultObject(v) { return !!v && typeof v === 'object' && Object.prototype.hasOwnProperty.call(v, 'result'); }
function pickBaselineId(obj) {
  if (!obj || typeof obj !== 'object') return '';
  return String(obj.baselineId || (obj.source && obj.source.baselineId) || '');
}

function inspectFixture(file) {
  const problems = [];
  const warnings = [];
  const counts = {
    canvasToDataURL: 0,
    canvasToBlob: 0,
    canvasMeasureText: 0,
    canvasGetImageData: 0,
    webglGetParameter: 0,
    webglGetSupportedExtensions: 0,
    webglGetExtension: 0,
    webglGetShaderPrecisionFormat: 0,
    webglReadPixels: 0,
    webgpuRequestAdapter: 0,
    audioStartRendering: 0,
    audioGetChannelData: 0,
    domGetBoundingClientRect: 0,
    domOffset: 0,
  };
  let fixture = null;
  if (!file || !exists(file)) {
    problems.push(`未找到指纹 fixture：${file || '未指定'}`);
    return { fixture, counts, problems, warnings };
  }
  try { fixture = readJson(file); } catch (err) {
    problems.push(`指纹 fixture JSON 解析失败：${err.message}`);
    return { fixture, counts, problems, warnings };
  }
  const fp = fixture.fingerprint && typeof fixture.fingerprint === 'object' ? fixture.fingerprint : fixture;
  counts.canvasToDataURL = countArray(fp.canvas && fp.canvas.toDataURL);
  counts.canvasToBlob = countArray(fp.canvas && fp.canvas.toBlob);
  counts.canvasMeasureText = countArray(fp.canvas && fp.canvas.measureText);
  counts.canvasGetImageData = countArray(fp.canvas && fp.canvas.getImageData);
  counts.webglGetParameter = countArray(fp.webgl && fp.webgl.getParameter);
  counts.webglGetSupportedExtensions = hasResultObject(fp.webgl && fp.webgl.getSupportedExtensions) ? 1 : countArray(fp.webgl && fp.webgl.getSupportedExtensions);
  counts.webglGetExtension = countArray(fp.webgl && fp.webgl.getExtension);
  counts.webglGetShaderPrecisionFormat = countArray(fp.webgl && fp.webgl.getShaderPrecisionFormat);
  counts.webglReadPixels = countArray(fp.webgl && fp.webgl.readPixels);
  counts.webgpuRequestAdapter = countArray(fp.webgpu && fp.webgpu.requestAdapter);
  counts.audioStartRendering = countArray(fp.audio && fp.audio.startRendering);
  counts.audioGetChannelData = countArray(fp.audio && fp.audio.getChannelData);
  counts.domGetBoundingClientRect = countArray(fp.domGeometry && fp.domGeometry.getBoundingClientRect);
  counts.domOffset = countArray(fp.domGeometry && fp.domGeometry.offset);

  const baselineId = pickBaselineId(fp);
  if (!baselineId) problems.push('指纹 fixture 缺少 baselineId；必须先创建 case/notes/fingerprint-baseline.json，并让 fixture 绑定同一 baselineId。');
  if (!fp.source) warnings.push('指纹 fixture 缺少 source 字段，建议记录取证模式、pageUrl、userAgent、timezone、locale、baselineId 和采样时间。');
  return { fixture: fp, baselineId, counts, problems, warnings };
}

function inspectBaseline(caseDir, fixtureResult) {
  const problems = [];
  const warnings = [];
  const baselineFile = path.join(caseDir, 'notes', 'fingerprint-baseline.json');
  const result = { file: baselineFile, present: exists(baselineFile), baselineId: '', conflicts: [] };
  if (!result.present) {
    problems.push('缺少指纹基线文件 case/notes/fingerprint-baseline.json；涉及指纹采样时必须先固定同一 case 的 fingerprint baseline。');
    return { result, problems, warnings };
  }
  let baseline;
  try { baseline = readJson(baselineFile); } catch (err) {
    problems.push(`指纹基线 JSON 解析失败：${err.message}`);
    return { result, problems, warnings };
  }
  result.baselineId = String(baseline.baselineId || '');
  if (!result.baselineId) problems.push('fingerprint-baseline.json 缺少 baselineId。');
  if (fixtureResult.baselineId && result.baselineId && fixtureResult.baselineId !== result.baselineId) {
    problems.push(`指纹 fixture baselineId 与基线不一致：fixture=${fixtureResult.baselineId}，baseline=${result.baselineId}。不得混用不同随机指纹样本。`);
  }
  const fp = fixtureResult.fixture || {};
  const source = fp.source || {};
  const checks = [
    ['userAgent', source.userAgent, baseline.navigator && baseline.navigator.userAgent],
    ['timezone', source.timezone, baseline.network && baseline.network.timezone],
    ['locale', source.locale, baseline.network && baseline.network.locale],
  ];
  for (const [name, a, b] of checks) {
    if (a && b && String(a) !== String(b)) result.conflicts.push({ field: name, fixture: String(a), baseline: String(b) });
  }
  if (result.conflicts.length) {
    problems.push(`指纹 fixture 与 baseline 核心字段冲突：${result.conflicts.map(x => `${x.field}: fixture=${x.fixture}, baseline=${x.baseline}`).join('；')}。请重新采样或生成新 baseline。`);
  }
  return { result, problems, warnings };
}

const REQUIRE_RULES = {
  canvas: ['canvasToDataURL', 'canvasMeasureText', 'canvasGetImageData'],
  webgl: ['webglGetParameter', 'webglGetSupportedExtensions', 'webglGetShaderPrecisionFormat', 'webglReadPixels'],
  webgpu: ['webgpuRequestAdapter'],
  audio: ['audioStartRendering', 'audioGetChannelData'],
  'dom-geometry': ['domGetBoundingClientRect', 'domOffset'],
  dom: ['domGetBoundingClientRect', 'domOffset'],
  font: ['canvasMeasureText', 'domOffset'],
  fonts: ['canvasMeasureText', 'domOffset'],
};

const BAD_RENDER_PATTERNS = [
  { name: 'node-canvas/canvas', pattern: /\b(require|import)\s*\(?\s*['"](?:canvas|node-canvas)['"]|from\s+['"](?:canvas|node-canvas)['"]/i },
  { name: 'headless-gl/gl', pattern: /\b(require|import)\s*\(?\s*['"](?:gl|headless-gl)['"]|from\s+['"](?:gl|headless-gl)['"]/i },
  { name: '浏览器自动化', pattern: /\b(playwright|puppeteer|selenium|cloakbrowser|ruyipage|page\.goto|browser\.launch|chromium\.launch)\b/i },
];

function inspectEnvCode(files, root) {
  const problems = [];
  const warnings = [];
  const hits = [];
  for (const file of files) {
    if (!exists(file)) continue;
    const text = readText(file);
    for (const item of BAD_RENDER_PATTERNS) {
      if (item.pattern.test(text)) hits.push({ file: rel(root, file), type: item.name });
    }
    if (/toDataURL|getImageData|measureText|getParameter|getBoundingClientRect/.test(text) && !/fingerprint|回放|replay|fixture/i.test(text)) {
      warnings.push(`${rel(root, file)} 涉及指纹终端 API，但未明显体现 fixture / replay；请确认不是在 Node.js 中伪造渲染过程。`);
    }
  }
  if (hits.length) {
    problems.push(`发现不推荐的指纹实现方向：${hits.map(h => `${h.file}(${h.type})`).join('、')}。应使用真实浏览器采样值回放，不要在最终项目中依赖渲染库或自动化浏览器计算指纹。`);
  }
  return { problems, warnings, hits };
}

function defaultFixture(caseDir) {
  const candidates = [
    path.join(caseDir, 'fixtures', 'fingerprint.fixture.json'),
    path.join(caseDir, 'fixtures', 'sample.fixture.json'),
  ];
  return candidates.find(exists) || candidates[0];
}

function defaultEnvFiles(caseDir) {
  const result = path.join(caseDir, 'result');
  return walk(result).filter(p => ['.js', '.mjs', '.cjs'].includes(ext(p)));
}

function check(args) {
  const caseDir = args.caseDir ? path.resolve(args.caseDir) : (args.fixture ? path.resolve(path.dirname(args.fixture), '..') : process.cwd());
  const fixtureFile = args.fixture ? path.resolve(args.fixture) : defaultFixture(caseDir);
  const envFiles = args.envFile ? [path.resolve(args.envFile)] : defaultEnvFiles(caseDir);
  const required = String(args.require || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const problems = [];
  const warnings = [];

  const fixtureResult = inspectFixture(fixtureFile);
  problems.push(...fixtureResult.problems);
  warnings.push(...fixtureResult.warnings);

  for (const item of required) {
    const rules = REQUIRE_RULES[item] || [];
    if (!rules.length) warnings.push(`未知 require 类型：${item}`);
    const ok = rules.some(k => fixtureResult.counts[k] > 0);
    if (!ok) problems.push(`要求 ${item} 指纹样本，但 fixture 中未发现对应终端 API 返回值。`);
  }

  const baselineResult = inspectBaseline(caseDir, fixtureResult);
  problems.push(...baselineResult.problems);
  warnings.push(...baselineResult.warnings);

  const envResult = inspectEnvCode(envFiles, caseDir);
  problems.push(...envResult.problems);
  warnings.push(...envResult.warnings);

  return {
    caseDir,
    fixtureFile,
    envFiles: envFiles.map(p => rel(caseDir, p)),
    required,
    clean: problems.length === 0,
    baseline: baselineResult.result,
    fixtureBaselineId: fixtureResult.baselineId || '',
    counts: fixtureResult.counts,
    badImplementationHits: envResult.hits,
    problems,
    warnings,
  };
}

function renderMarkdown(result) {
  const lines = [
    '# 指纹 fixture 与回放实现检查',
    '',
    `case 目录：${result.caseDir}`,
    `fixture：${result.fixtureFile}`,
    `是否通过：${result.clean ? '是' : '否'}`,
    '',
    '## 指纹基线',
    `- baseline 文件：${result.baseline.file}`,
    `- baseline 是否存在：${result.baseline.present ? '是' : '否'}`,
    `- baselineId：${result.baseline.baselineId || '未发现'}`,
    `- fixture baselineId：${result.fixtureBaselineId || '未发现'}`,
    `- 核心字段冲突：${result.baseline.conflicts.length ? '是' : '否'}`,
    '',
    '## 样本覆盖统计',
  ];
  for (const [k, v] of Object.entries(result.counts)) lines.push(`- ${k}：${v}`);
  lines.push('', '## 检查的 env 文件');
  if (result.envFiles.length) for (const f of result.envFiles) lines.push(`- ${f}`);
  else lines.push('- 未发现 result 下的 JS env 文件');
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
} catch (err) {
  console.error(err.message || String(err));
  console.error(usage());
  process.exit(1);
}
