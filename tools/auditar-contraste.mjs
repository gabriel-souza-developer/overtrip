// Mede o contraste real (WCAG AA) de todo texto laranja, ou sobre fundo laranja, nas páginas do site.
// Uso: python3 -m http.server 8768 --bind 127.0.0.1  e, em outro terminal,  node tools/auditar-contraste.mjs http://127.0.0.1:8768
// Ignora textos sobre foto, que precisam de revisão visual.
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/');
const { chromium } = require('playwright');
const base = process.argv[2];
const pages = ['/', '/blog/', '/blog/agente-overtrip/', '/blog/overtrip-riders/', '/blog/primeira-expedicao/', '/riders/'];
const b = await chromium.launch(); const out = {};
for (const path of pages) for (const width of [360, 1280]) {
  const p = await b.newPage({ viewport: { width, height: 900 } });
  await p.route(u => u.pathname.startsWith('/api/'), r => r.fulfill({ json: [] }));
  await p.goto(base + path, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.querySelectorAll('[hidden]').forEach(() => {}));
  const res = await p.evaluate(() => {
    const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r, g, b, a }; };
    const toRgb = (c) => { const x = document.createElement('div'); x.style.color = c; document.body.append(x); const v = getComputedStyle(x).color; x.remove(); const ctx = document.createElement('canvas').getContext('2d'); ctx.fillStyle = v; ctx.fillRect(0, 0, 1, 1); const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data; return { r, g, b, a: a / 255 }; };
    const norm = (c) => { const ctx = document.createElement('canvas').getContext('2d'); ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data; return { r, g, b, a: a / 255 }; };
    const L = ({ r, g, b }) => [r, g, b].map(v => v / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
    const cr = (a, b) => { const [x, y] = [L(a), L(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
    const css = getComputedStyle(document.documentElement);
    const oranges = ['--rust', '--rust-strong', '--rust-light'].map(v => css.getPropertyValue(v)).filter(Boolean).map(toRgb);
    const near1 = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) < 30;
    const near = (a) => oranges.some(o => near1(a, o));
    const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e); if (s.backgroundImage !== 'none' && !s.backgroundImage.startsWith('linear-gradient(rgba(0, 0, 0, 0)')) return 'imagem'; const c = norm(s.backgroundColor); if (c.a > 0.5) return c; } return { r: 255, g: 255, b: 255, a: 1 }; };
    const fails = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') continue;
      const text = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim();
      if (!text) continue;
      const s = getComputedStyle(el); if (s.visibility === 'hidden' || +s.opacity === 0) continue;
      const fg = norm(s.color); const bg = bgOf(el); if (bg === 'imagem') continue;
      if (!near(fg) && !near(bg)) continue;
      const size = parseFloat(s.fontSize), bold = +s.fontWeight >= 700;
      const min = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
      const ratio = cr(fg, bg);
      if (ratio < min) {
        const sel = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + [...el.classList].map(c => '.' + c).join('');
        fails.push(`${sel} | "${text.slice(0, 30)}" | ${ratio.toFixed(2)} < ${min} | ${near(fg) ? 'texto laranja' : 'fundo laranja'} | bg rgb(${bg.r},${bg.g},${bg.b}) fg rgb(${fg.r},${fg.g},${fg.b})`);
      }
    }
    return [...new Set(fails)];
  });
  for (const f of res) (out[f] ||= []).push(`${path}@${width}`);
  await p.close();
}
await b.close();
const entries = Object.entries(out);
console.log(entries.length ? entries.map(([f, w]) => `${f}\n    em: ${w.join(', ')}`).join('\n') : 'nenhuma falha');
