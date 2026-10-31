import { expect, it } from 'vitest';
import { formatMessage, resolveTranslations, searchResultCount, textDirection } from '../src/i18n.js';

it('uses locale dictionaries, English fallback and partial overrides without dropping plural categories', () => {
  const french = resolveTranslations('fr-CA', { search: 'Trouver' }, { codeCopy: 'Copier ce code', searchResults: { one: '{count} élément' } });
  expect(french.search).toBe('Trouver'); expect(french.codeCopy).toBe('Copier ce code');
  expect(french.skipToContent).toBe('Aller au contenu');
  expect(searchResultCount(french, 1, 'fr-CA')).toBe('1 élément');
  expect(searchResultCount(french, 3, 'fr-CA')).toBe('3 résultats');
  expect(resolveTranslations('ja').search).toBe('Search');
  expect(formatMessage('{query}: {count} / {query}', { query: 'a{b}', count: 2 })).toBe('a{b}: 2 / a{b}');
});

it('uses native Arabic plural categories and text direction, and validates dictionary fields', () => {
  const arabic = resolveTranslations('ar');
  expect(searchResultCount(arabic, 2, 'ar')).toBe('نتيجتان');
  expect(searchResultCount(arabic, 3, 'ar-EG')).toBe('٣ نتائج');
  expect(textDirection('ar')).toBe('rtl'); expect(textDirection('fr')).toBe('ltr');
  expect(() => resolveTranslations('en', { search: 3 } as never)).toThrow('translations.search must be a string');
  expect(() => resolveTranslations('en', { extra: 'Unknown' } as never)).toThrow('Unknown translation extra');
});
