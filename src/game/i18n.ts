/**
 * Strings: one JSON file per language in src/i18n (English is the reference, every file has all its keys — checked
 * by tests/i18n.test.ts and `npm run check:i18n` in CI). The language comes from the player's saved choice, else
 * the platform locale (GamePix.lang(), the CrazyGames SDK) or the browser language, else English.
 */
import de from '../i18n/de.json';
import en from '../i18n/en.json';
import es from '../i18n/es.json';
import fr from '../i18n/fr.json';
import it from '../i18n/it.json';
import nl from '../i18n/nl.json';
import pl from '../i18n/pl.json';
import pt from '../i18n/pt.json';
import ru from '../i18n/ru.json';
import tr from '../i18n/tr.json';

export const LANGS = ['en', 'fr', 'de', 'it', 'es', 'pt', 'nl', 'pl', 'tr', 'ru'] as const;
export type Lang = (typeof LANGS)[number];

type Dict = typeof en;
export type Key = keyof Dict;

const dicts: Record<Lang, Dict> = { en, fr, de, it, es, pt, nl, pl, tr, ru };
let lang: Lang = 'en';

const isLang = (l: string): l is Lang => (LANGS as readonly string[]).includes(l);

/** "pt-BR" → "pt"; unknown → null. */
export function langOf(code: string | null | undefined): Lang | null {
  if (!code) return null;
  const l = code.toLowerCase().split(/[-_]/)[0];
  return isLang(l) ? l : null;
}

/** Saved choice, else the platform locale, else the browser language, else English. */
export function detectLang(saved: string, platformLocale: string | null = null): Lang {
  if (isLang(saved)) return saved;
  const nav = typeof navigator !== 'undefined' ? navigator.language : null;
  return langOf(platformLocale) ?? langOf(nav) ?? 'en';
}

export function setLang(l: Lang): void {
  lang = l;
  if (typeof document !== 'undefined') document.documentElement.lang = l;
}

export function getLang(): Lang {
  return lang;
}

export function t(key: Key, vars: Record<string, string | number> = {}): string {
  let s: string = dicts[lang][key] ?? en[key];
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

/** The name of a language in that language ("Deutsch"). */
export function langName(l: Lang): string {
  return dicts[l].langName;
}

export const DICTS = dicts;
