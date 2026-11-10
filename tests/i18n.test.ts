import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DICTS, detectLang, LANGS, langOf, setLang, t } from '../src/game/i18n';

const en = DICTS.en as Record<string, string>;
const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

describe('languages', () => {
  it('ten languages, one JSON file each', () => {
    expect([...LANGS].sort()).toEqual(['de', 'en', 'es', 'fr', 'it', 'nl', 'pl', 'pt', 'ru', 'tr']);
    expect(readdirSync('src/i18n').filter((f) => f.endsWith('.json')).sort()).toEqual(LANGS.map((l) => `${l}.json`).sort());
  });

  it.each(LANGS)('%s has every English key, nothing empty, the same placeholders', (l) => {
    const d = JSON.parse(readFileSync(`src/i18n/${l}.json`, 'utf8')) as Record<string, string>;
    expect(Object.keys(d).sort()).toEqual(Object.keys(en).sort());
    for (const k of Object.keys(en)) {
      expect(d[k].trim().length, `${l}.${k}`).toBeGreaterThan(0);
      expect(ph(d[k]), `${l}.${k}`).toEqual(ph(en[k]));
    }
  });

  it('language: saved choice, else platform locale, else English', () => {
    expect(detectLang('de', 'fr-FR')).toBe('de');
    expect(detectLang('', 'pt-BR')).toBe('pt');
    expect(detectLang('', 'ru')).toBe('ru');
    expect(detectLang('xx', 'ja-JP')).toBe(langOf(globalThis.navigator?.language) ?? 'en');
    expect(langOf('TR_tr')).toBe('tr');
    expect(langOf('zh')).toBeNull();
  });

  it('translates with placeholders and falls back to English', () => {
    setLang('de');
    expect(t('level', { n: 4 })).toBe('Level 4');
    expect(t('item_crown')).toBe('Krone');
    setLang('ru');
    expect(t('coins', { n: 12 })).toBe('+12 монет');
    setLang('en');
    expect(t('noAd')).toBe('No ad available right now, try later');
  });
});
