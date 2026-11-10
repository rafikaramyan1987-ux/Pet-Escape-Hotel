// CI: every language file in src/i18n has exactly the English keys, no empty string and the same {placeholders}.
import { readdirSync, readFileSync } from 'node:fs';

const dir = 'src/i18n';
const load = (f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
const en = load('en.json');
const ph = (s) => (s.match(/\{\w+\}/g) ?? []).sort().join();
const errors = [];
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
for (const f of files) {
  const d = load(f);
  for (const k of Object.keys(en)) {
    if (!(k in d)) errors.push(`${f}: missing "${k}"`);
    else if (typeof d[k] !== 'string' || !d[k].trim()) errors.push(`${f}: empty "${k}"`);
    else if (ph(d[k]) !== ph(en[k])) errors.push(`${f}: "${k}" placeholders ${ph(d[k]) || '–'} ≠ ${ph(en[k]) || '–'}`);
  }
  for (const k of Object.keys(d)) if (!(k in en)) errors.push(`${f}: extra key "${k}"`);
}
if (files.length < 10) errors.push(`only ${files.length} language files (10 expected)`);
console.log(errors.join('\n') || `${files.length} languages, ${Object.keys(en).length} keys each: ok (${files.join(', ')})`);
process.exit(errors.length ? 1 : 0);
