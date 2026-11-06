import {describe,expect,it} from 'vitest';
import {isLocale,localeMeta,locales,normalizeLocale,translations,t} from '@/lib/i18n';

describe('locale system',()=>{
  it('accepts every configured locale',()=>{for(const locale of locales)expect(isLocale(locale)).toBe(true)});
  it('does not expose Nigerian language options and falls back for stored removed locales',()=>{
    expect(locales).not.toEqual(expect.arrayContaining(['ha','yo','ig']));
    expect(normalizeLocale('ha','en')).toBe('en');
    expect(normalizeLocale('yo','en')).toBe('en');
    expect(normalizeLocale('ig','en')).toBe('en');
  });
  it('keeps every locale key set aligned',()=>{
    const keys=Object.keys(translations.en);
    for(const locale of locales){
      const localeKeys=Object.keys(translations[locale]);
      expect(localeKeys).toEqual(expect.arrayContaining(keys));
      expect(localeKeys).toHaveLength(keys.length);
    }
  });
  it('provides complete locale metadata and visible flags',()=>{
    for(const locale of locales){
      const meta=localeMeta[locale];
      expect(meta.name.length).toBeGreaterThan(0);
      expect(meta.nativeName.length).toBeGreaterThan(0);
      expect(meta.flag).toMatch(/^\p{Regional_Indicator}{2}$/u);
      expect(meta.direction).toMatch(/^(ltr|rtl)$/);
    }
  });
  it('falls back to English for missing keys',()=>{expect(t('en','missingKey' as never)).toBe('missingKey')});
  it('normalizes unsupported locales',()=>{expect(normalizeLocale('xx','ar')).toBe('ar')});
});
