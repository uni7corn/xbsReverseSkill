#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {
    types: 'canvas,webgl,dom-geometry',
    out: '',
    apiPattern: '',
    maxDataUrlLength: 200000,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--types') args.types = argv[++i] || args.types;
    else if (a === '--out') args.out = argv[++i] || '';
    else if (a === '--api-pattern') args.apiPattern = argv[++i] || '';
    else if (a === '--max-data-url-length') args.maxDataUrlLength = Number(argv[++i] || args.maxDataUrlLength);
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`未知参数：${a}`);
  }
  return args;
}

function usage() {
  return `用法：
  node scripts/generate_fingerprint_hook.js --types canvas,webgl,dom-geometry --out case/hooks/fingerprint-hook.js
  node scripts/generate_fingerprint_hook.js --types canvas,webgl,webgpu,audio,dom-geometry --max-data-url-length 100000

说明：生成浏览器侧指纹终端 API 采样 Hook。该脚本只用于前置取证，不得进入最终 result/ 交付目录。`;
}

function q(v) { return JSON.stringify(String(v)); }

function header(args) {
  return `// 指纹终端 API 采样 Hook，仅用于授权前置取证。
// 使用方式：在用户已确认的取证工具中注入，触发最少量业务动作后执行：
// copy(JSON.stringify(window.__WEB_JS_ENV_PATCHER_FINGERPRINT__, null, 2))
// 不要把本 Hook 放入最终 result/ 交付目录。
(function installFingerprintSampler() {
  if (window.__WEB_JS_ENV_PATCHER_FINGERPRINT_HOOKED__) return;
  Object.defineProperty(window, "__WEB_JS_ENV_PATCHER_FINGERPRINT_HOOKED__", { value: true, configurable: true });
  const maxDataUrlLength = ${Number(args.maxDataUrlLength) || 200000};
  const apiPattern = ${q(args.apiPattern)};
  const store = window.__WEB_JS_ENV_PATCHER_FINGERPRINT__ = window.__WEB_JS_ENV_PATCHER_FINGERPRINT__ || {
    version: 1,
    source: {
      pageUrl: location.href,
      userAgent: navigator.userAgent,
      language: navigator.language,
      languages: Array.from(navigator.languages || []),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      capturedAt: new Date().toISOString(),
      apiPattern
    },
    canvas: { toDataURL: [], toBlob: [], measureText: [], getImageData: [] },
    webgl: { getParameter: [], getSupportedExtensions: null, getExtension: [], getShaderPrecisionFormat: [], readPixels: [] },
    webgpu: { requestAdapter: [] },
    audio: { startRendering: [], getChannelData: [] },
    domGeometry: { getBoundingClientRect: [], getClientRects: [], offset: [] }
  };
  function stack() { try { return new Error().stack || ""; } catch(e) { return ""; } }
  function clip(v, n) { v = String(v); return v.length > n ? v.slice(0, n) + "...<clipped>" : v; }
  function b64FromArrayLike(arr) {
    try {
      const bytes = new Uint8Array(arr.buffer || arr, arr.byteOffset || 0, arr.byteLength || arr.length || 0);
      let s = "";
      for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
      return btoa(s);
    } catch(e) { return ""; }
  }
  function selectorOf(el) {
    try {
      if (!el) return "";
      if (el.id) return "#" + el.id;
      if (el.className && typeof el.className === "string") return "." + el.className.trim().split(/\\s+/)[0];
      return String(el.tagName || "").toLowerCase();
    } catch(e) { return ""; }
  }
`;
}

function footer() {
  return `  console.info("[web-js-env-patcher] 指纹采样 Hook 已安装，可在触发目标动作后复制 window.__WEB_JS_ENV_PATCHER_FINGERPRINT__。");
})();`;
}

function canvasSnippet() {
  return `
  // ===== Canvas 终端 API 采样 =====
  if (window.HTMLCanvasElement) {
    const rawToDataURL = HTMLCanvasElement.prototype.toDataURL;
    if (rawToDataURL && !rawToDataURL.__wjep_hooked__) {
      HTMLCanvasElement.prototype.toDataURL = function patchedToDataURL(type, quality) {
        const result = rawToDataURL.apply(this, arguments);
        store.canvas.toDataURL.push({
          match: { width: this.width, height: this.height, type: type || "image/png" },
          result: clip(result, maxDataUrlLength),
          stack: stack()
        });
        return result;
      };
      HTMLCanvasElement.prototype.toDataURL.__wjep_hooked__ = true;
    }
    const rawToBlob = HTMLCanvasElement.prototype.toBlob;
    if (rawToBlob && !rawToBlob.__wjep_hooked__) {
      HTMLCanvasElement.prototype.toBlob = function patchedToBlob(callback, type, quality) {
        const width = this.width, height = this.height, callStack = stack();
        return rawToBlob.call(this, function(blob) {
          store.canvas.toBlob.push({
            match: { width, height, type: type || (blob && blob.type) || "image/png" },
            result: { type: blob && blob.type || type || "", size: blob && blob.size || 0 },
            stack: callStack
          });
          return callback && callback.apply(this, arguments);
        }, type, quality);
      };
      HTMLCanvasElement.prototype.toBlob.__wjep_hooked__ = true;
    }
  }
  if (window.CanvasRenderingContext2D) {
    const p = CanvasRenderingContext2D.prototype;
    const rawMeasureText = p.measureText;
    if (rawMeasureText && !rawMeasureText.__wjep_hooked__) {
      p.measureText = function patchedMeasureText(text) {
        const ret = rawMeasureText.apply(this, arguments);
        store.canvas.measureText.push({
          match: { text: String(text), font: this.font },
          result: {
            width: ret.width,
            actualBoundingBoxLeft: ret.actualBoundingBoxLeft,
            actualBoundingBoxRight: ret.actualBoundingBoxRight,
            actualBoundingBoxAscent: ret.actualBoundingBoxAscent,
            actualBoundingBoxDescent: ret.actualBoundingBoxDescent,
            fontBoundingBoxAscent: ret.fontBoundingBoxAscent,
            fontBoundingBoxDescent: ret.fontBoundingBoxDescent
          },
          stack: stack()
        });
        return ret;
      };
      p.measureText.__wjep_hooked__ = true;
    }
    const rawGetImageData = p.getImageData;
    if (rawGetImageData && !rawGetImageData.__wjep_hooked__) {
      p.getImageData = function patchedGetImageData(sx, sy, sw, sh) {
        const ret = rawGetImageData.apply(this, arguments);
        store.canvas.getImageData.push({
          match: { sx, sy, sw, sh },
          result: { width: ret.width, height: ret.height, dataBase64: b64FromArrayLike(ret.data) },
          stack: stack()
        });
        return ret;
      };
      p.getImageData.__wjep_hooked__ = true;
    }
  }
`;
}

function webglSnippet() {
  return `
  // ===== WebGL 终端 API 采样 =====
  for (const Ctor of [window.WebGLRenderingContext, window.WebGL2RenderingContext].filter(Boolean)) {
    const p = Ctor.prototype;
    if (p.getParameter && !p.getParameter.__wjep_hooked__) {
      const raw = p.getParameter;
      p.getParameter = function patchedGetParameter(pname) {
        const ret = raw.apply(this, arguments);
        store.webgl.getParameter.push({ match: { pname }, result: ret, stack: stack() });
        return ret;
      };
      p.getParameter.__wjep_hooked__ = true;
    }
    if (p.getSupportedExtensions && !p.getSupportedExtensions.__wjep_hooked__) {
      const raw = p.getSupportedExtensions;
      p.getSupportedExtensions = function patchedGetSupportedExtensions() {
        const ret = raw.apply(this, arguments);
        store.webgl.getSupportedExtensions = { result: Array.from(ret || []), stack: stack() };
        return ret;
      };
      p.getSupportedExtensions.__wjep_hooked__ = true;
    }
    if (p.getExtension && !p.getExtension.__wjep_hooked__) {
      const raw = p.getExtension;
      p.getExtension = function patchedGetExtension(name) {
        const ret = raw.apply(this, arguments);
        store.webgl.getExtension.push({ match: { name: String(name) }, result: ret ? { exists: true } : null, stack: stack() });
        return ret;
      };
      p.getExtension.__wjep_hooked__ = true;
    }
    if (p.getShaderPrecisionFormat && !p.getShaderPrecisionFormat.__wjep_hooked__) {
      const raw = p.getShaderPrecisionFormat;
      p.getShaderPrecisionFormat = function patchedGetShaderPrecisionFormat(shaderType, precisionType) {
        const ret = raw.apply(this, arguments);
        store.webgl.getShaderPrecisionFormat.push({
          match: { shaderType, precisionType },
          result: ret ? { rangeMin: ret.rangeMin, rangeMax: ret.rangeMax, precision: ret.precision } : null,
          stack: stack()
        });
        return ret;
      };
      p.getShaderPrecisionFormat.__wjep_hooked__ = true;
    }
    if (p.readPixels && !p.readPixels.__wjep_hooked__) {
      const raw = p.readPixels;
      p.readPixels = function patchedReadPixels(x, y, width, height, format, type, pixels) {
        const ret = raw.apply(this, arguments);
        store.webgl.readPixels.push({
          match: { x, y, width, height, format, type },
          result: { dataBase64: pixels ? b64FromArrayLike(pixels) : "" },
          stack: stack()
        });
        return ret;
      };
      p.readPixels.__wjep_hooked__ = true;
    }
  }
`;
}

function webgpuSnippet() {
  return `
  // ===== WebGPU 终端 API 采样 =====
  if (navigator.gpu && navigator.gpu.requestAdapter && !navigator.gpu.requestAdapter.__wjep_hooked__) {
    const rawRequestAdapter = navigator.gpu.requestAdapter.bind(navigator.gpu);
    navigator.gpu.requestAdapter = async function patchedRequestAdapter(options) {
      const adapter = await rawRequestAdapter(options);
      const info = adapter && adapter.info ? adapter.info : null;
      store.webgpu.requestAdapter.push({
        match: { options: JSON.stringify(options || {}) },
        result: {
          info,
          features: adapter && adapter.features ? Array.from(adapter.features) : [],
          limits: adapter && adapter.limits ? Object.assign({}, adapter.limits) : {}
        },
        stack: stack()
      });
      return adapter;
    };
    navigator.gpu.requestAdapter.__wjep_hooked__ = true;
  }
`;
}

function audioSnippet() {
  return `
  // ===== Audio 指纹终端 API 采样 =====
  if (window.OfflineAudioContext && OfflineAudioContext.prototype.startRendering && !OfflineAudioContext.prototype.startRendering.__wjep_hooked__) {
    const rawStartRendering = OfflineAudioContext.prototype.startRendering;
    OfflineAudioContext.prototype.startRendering = function patchedStartRendering() {
      const callStack = stack();
      const ret = rawStartRendering.apply(this, arguments);
      if (ret && typeof ret.then === "function") {
        return ret.then(buffer => {
          try {
            const data = buffer.getChannelData(0);
            store.audio.startRendering.push({
              match: { length: buffer.length, sampleRate: buffer.sampleRate, numberOfChannels: buffer.numberOfChannels },
              result: { channel0Base64: b64FromArrayLike(data.slice ? data.slice(0, Math.min(data.length, 4096)) : data) },
              stack: callStack
            });
          } catch(e) {}
          return buffer;
        });
      }
      return ret;
    };
    OfflineAudioContext.prototype.startRendering.__wjep_hooked__ = true;
  }
`;
}

function domSnippet() {
  return `
  // ===== DOM 几何 / 字体探测终端 API 采样 =====
  if (window.Element) {
    const p = Element.prototype;
    const rawRect = p.getBoundingClientRect;
    if (rawRect && !rawRect.__wjep_hooked__) {
      p.getBoundingClientRect = function patchedGetBoundingClientRect() {
        const ret = rawRect.apply(this, arguments);
        store.domGeometry.getBoundingClientRect.push({
          match: { selector: selectorOf(this) },
          result: { x: ret.x, y: ret.y, width: ret.width, height: ret.height, top: ret.top, left: ret.left, right: ret.right, bottom: ret.bottom },
          stack: stack()
        });
        return ret;
      };
      p.getBoundingClientRect.__wjep_hooked__ = true;
    }
    for (const key of ["offsetWidth", "offsetHeight", "scrollWidth", "scrollHeight", "clientWidth", "clientHeight"]) {
      const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, key) || Object.getOwnPropertyDescriptor(Element.prototype, key);
      if (!desc || !desc.get || desc.get.__wjep_hooked__) continue;
      Object.defineProperty(HTMLElement.prototype, key, {
        get: function patchedGeometryGetter() {
          const value = desc.get.call(this);
          store.domGeometry.offset.push({ match: { selector: selectorOf(this) }, result: { [key]: value }, stack: stack() });
          return value;
        },
        enumerable: desc.enumerable,
        configurable: true
      });
      try { Object.getOwnPropertyDescriptor(HTMLElement.prototype, key).get.__wjep_hooked__ = true; } catch(e) {}
    }
  }
`;
}

function build(args) {
  const types = new Set(String(args.types || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
  const parts = [header(args)];
  if (types.has('canvas')) parts.push(canvasSnippet());
  if (types.has('webgl')) parts.push(webglSnippet());
  if (types.has('webgpu')) parts.push(webgpuSnippet());
  if (types.has('audio')) parts.push(audioSnippet());
  if (types.has('dom') || types.has('dom-geometry') || types.has('font') || types.has('fonts')) parts.push(domSnippet());
  parts.push(footer());
  return parts.join('\n');
}

try {
  const args = parseArgs(process.argv);
  if (args.help) { console.log(usage()); process.exit(0); }
  const code = build(args);
  if (args.out) {
    const out = path.resolve(args.out);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, code, 'utf8');
    console.log(`# 指纹采样 Hook 已生成\n- 输出文件：${out}\n- 类型：${args.types}\n- 提醒：该 Hook 只用于前置取证，不得放入最终 result/ 目录。`);
  } else {
    process.stdout.write(code + '\n');
  }
} catch (err) {
  console.error(err.message || String(err));
  console.error(usage());
  process.exit(1);
}
