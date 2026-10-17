import { readFileSync } from 'node:fs';
const css = readFileSync('src/styles/tokens.css', 'utf8');
const block = (re) => Object.fromEntries([...re.exec(css)[1].matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
const light = block(/:root \{([\s\S]*?)\n\}/);
const dark = block(/:root\[data-theme='dark'\] \{([\s\S]*?)\n\}/);
const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const pairs = [['ink','bg'],['ink-2','bg'],['ink-3','bg'],['ink-3','surface-2'],['ink-2','surface-2'],['on-accent','accent'],['accent-ink','bg'],['accent-ink','accent-soft'],['ink','accent-soft'],['ink-2','accent-soft'],['ok','bg'],['warn','bg'],['missed','bg'],['muted-status','bg'],['danger','bg'],['danger','surface'],['ink-3','surface'],['bg','ink'],['focus','bg']];
const vars = (body) => Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
// Accent presets: each overrides the accent tokens on top of the base theme.
const themes = [['light', light], ['dark', dark]];
for (const [, k, body] of css.matchAll(/\n\[data-accent='(\w+)'\] \{([\s\S]*?)\n\}/g)) themes.push([`light/${k}`, { ...light, ...vars(body) }]);
for (const [, k, body] of css.matchAll(/\n:root\[data-theme='dark'\]\[data-accent='(\w+)'\],\n[^{]*\{([\s\S]*?)\n\}/g)) themes.push([`dark/${k}`, { ...dark, ...vars(body) }]);
let fail = 0;
for (const [name, t] of themes) for (const [f, b] of pairs) { if (name.includes('/') && !f.includes('accent') && !b.includes('accent')) continue; const r = ratio(t[f], t[b]); const ok = r >= 4.5; if (!ok) fail++; console.log(`${name.padEnd(12)} ${f.padEnd(13)} on ${b.padEnd(11)} ${r.toFixed(2)} ${ok ? 'AA' : 'FAIL'}`); }
process.exit(fail ? 1 : 0);
