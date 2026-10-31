export interface Translations {
  readonly skipToContent: string;
  readonly mainNavigation: string;
  readonly navigation: string;
  readonly documentation: string;
  readonly sections: string;
  readonly versions: string;
  readonly documentationVersions: string;
  readonly languages: string;
  readonly appearance: string;
  readonly appearanceHint: string;
  readonly noAppearanceChoices: string;
  readonly automatic: string;
  readonly light: string;
  readonly dark: string;
  /** {notice} is the removable header notice. */
  readonly removeNotice: string;
  /** {label} is the section's authored title. */
  readonly overview: string;
  readonly search: string;
  readonly searchLabel: string;
  readonly searching: string;
  /** {query} is the reader's original search. */
  readonly noResults: string;
  readonly searchUnavailable: string;
  /** Native plural categories; {count} is formatted in the interface locale. */
  readonly searchResults: Readonly<Record<Intl.LDMLPluralRule, string>>;
  readonly previous: string;
  readonly next: string;
  readonly pages: string;
  readonly breadcrumb: string;
  readonly onThisPage: string;
  readonly editThisPage: string;
  readonly lastUpdated: string;
  readonly currentVersion: string;
  /** {version} is the version's display label. */
  readonly versionUnavailable: string;
  /** {locale} is the language's display label. */
  readonly translationUnavailable: string;
  readonly codeWrap: string;
  readonly codeCopy: string;
  readonly codeCopied: string;
  readonly codeCopyFailed: string;
  readonly details: string;
}
export type TranslationOverrides = Partial<Omit<Translations, 'searchResults'>> & {
  readonly searchResults?: Partial<Translations['searchResults']>;
};
const plural = (one: string, other: string): Translations['searchResults'] => ({ zero: other, one, two: other, few: other, many: other, other });
export const english: Translations = {
  skipToContent: 'Skip to content', mainNavigation: 'Main', navigation: 'Navigation', documentation: 'Documentation', sections: 'Sections',
  versions: 'Versions', documentationVersions: 'Documentation versions', languages: 'Languages', appearance: 'Appearance', appearanceHint: 'Activate to choose the next appearance.', noAppearanceChoices: 'No choices',
  automatic: 'Automatic', light: 'Light', dark: 'Dark', removeNotice: 'Remove {notice}', overview: '{label} overview',
  search: 'Search', searchLabel: 'Search the documentation', searching: 'Searching…', noResults: 'No results for "{query}"', searchUnavailable: 'Search is unavailable.',
  searchResults: plural('{count} result', '{count} results'), previous: 'Previous', next: 'Next', pages: 'Pages', breadcrumb: 'Breadcrumb',
  onThisPage: 'On this page', editThisPage: 'Edit this page', lastUpdated: 'Last updated', currentVersion: 'Current',
  versionUnavailable: 'This document is unavailable in {version}; open its documentation home.',
  translationUnavailable: 'This document is unavailable in {locale}; open its documentation home.',
  codeWrap: 'Wrap', codeCopy: 'Copy', codeCopied: 'Copied', codeCopyFailed: 'Copy failed', details: 'Details',
};
const french: Translations = {
  skipToContent: 'Aller au contenu', mainNavigation: 'Principale', navigation: 'Navigation', documentation: 'Documentation', sections: 'Sections',
  versions: 'Versions', documentationVersions: 'Versions de la documentation', languages: 'Langues', appearance: 'Apparence', appearanceHint: 'Activer pour choisir l’apparence suivante.', noAppearanceChoices: 'Aucun choix',
  automatic: 'Automatique', light: 'Clair', dark: 'Sombre', removeNotice: 'Retirer {notice}', overview: 'Vue d’ensemble de {label}',
  search: 'Rechercher', searchLabel: 'Rechercher dans la documentation', searching: 'Recherche…', noResults: 'Aucun résultat pour « {query} »', searchUnavailable: 'La recherche est indisponible.',
  searchResults: plural('{count} résultat', '{count} résultats'), previous: 'Précédent', next: 'Suivant', pages: 'Pages', breadcrumb: 'Fil d’Ariane',
  onThisPage: 'Sur cette page', editThisPage: 'Modifier cette page', lastUpdated: 'Dernière mise à jour', currentVersion: 'Actuelle',
  versionUnavailable: 'Ce document est indisponible dans {version} ; ouvrir l’accueil de cette version.',
  translationUnavailable: 'Ce document est indisponible en {locale} ; ouvrir l’accueil de cette langue.',
  codeWrap: 'Retour à la ligne', codeCopy: 'Copier', codeCopied: 'Copié', codeCopyFailed: 'Échec de la copie', details: 'Détails',
};
const arabic: Translations = {
  skipToContent: 'انتقل إلى المحتوى', mainNavigation: 'الرئيسية', navigation: 'التنقل', documentation: 'التوثيق', sections: 'الأقسام',
  versions: 'الإصدارات', documentationVersions: 'إصدارات التوثيق', languages: 'اللغات', appearance: 'المظهر', appearanceHint: 'فعّل لاختيار المظهر التالي.', noAppearanceChoices: 'لا خيارات',
  automatic: 'تلقائي', light: 'فاتح', dark: 'داكن', removeNotice: 'إزالة {notice}', overview: 'نظرة عامة على {label}',
  search: 'بحث', searchLabel: 'البحث في التوثيق', searching: 'جارٍ البحث…', noResults: 'لا توجد نتائج عن «{query}»', searchUnavailable: 'البحث غير متاح.',
  searchResults: { zero: 'لا نتائج', one: 'نتيجة واحدة', two: 'نتيجتان', few: '{count} نتائج', many: '{count} نتيجة', other: '{count} نتيجة' },
  previous: 'السابق', next: 'التالي', pages: 'الصفحات', breadcrumb: 'مسار التنقل', onThisPage: 'في هذه الصفحة',
  editThisPage: 'تحرير هذه الصفحة', lastUpdated: 'آخر تحديث', currentVersion: 'الحالية',
  versionUnavailable: 'هذا المستند غير متاح في {version}؛ افتح الصفحة الرئيسية لهذا الإصدار.',
  translationUnavailable: 'هذا المستند غير متاح باللغة {locale}؛ افتح الصفحة الرئيسية لهذه اللغة.',
  codeWrap: 'التفاف السطور', codeCopy: 'نسخ', codeCopied: 'تم النسخ', codeCopyFailed: 'تعذر النسخ', details: 'التفاصيل',
};

/** Missing dictionary entries inherit the built-in language, then English. Overrides apply from left to right. */
export function resolveTranslations(lang: string, ...overrides: readonly (TranslationOverrides | undefined)[]): Translations {
  const language = new Intl.Locale(lang).language;
  const builtin = language === 'fr' ? french : language === 'ar' ? arabic : english;
  const result = { ...builtin, searchResults: { ...builtin.searchResults } };
  for (const override of overrides) {
    if (override === undefined) continue;
    if (override === null || typeof override !== 'object' || Array.isArray(override)) throw new Error('translations must be an object of reader strings.');
    for (const [key, value] of Object.entries(override)) {
      if (!Object.hasOwn(english, key)) throw new Error(`Unknown translation ${key}.`);
      if (value === undefined) continue;
      if (key === 'searchResults') {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('translations.searchResults must map plural categories to strings.');
        for (const [category, pattern] of Object.entries(value)) {
          if (!Object.hasOwn(english.searchResults, category)) throw new Error(`Unknown searchResults plural category ${category}.`);
          if (typeof pattern !== 'string') throw new Error(`translations.searchResults.${category} must be a string.`);
          result.searchResults[category as Intl.LDMLPluralRule] = pattern;
        }
      } else {
        if (typeof value !== 'string') throw new Error(`translations.${key} must be a string.`);
        result[key as keyof Omit<Translations, 'searchResults'>] = value;
      }
    }
  }
  return result;
}

/** Replacement values are inserted literally; their braces never become another placeholder. */
export function formatMessage(pattern: string, values: Readonly<Record<string, string | number>>): string {
  return pattern.replace(/\{(\w+)\}/g, (placeholder, key: string) => Object.hasOwn(values, key) ? String(values[key]) : placeholder);
}
export function searchResultCount(messages: Translations, count: number, lang: string): string {
  return formatMessage(messages.searchResults[new Intl.PluralRules(lang).select(count)], { count: new Intl.NumberFormat(lang).format(count) });
}
export function textDirection(lang: string): 'ltr' | 'rtl' {
  // The maintained Node lines expose the same native locale data under the old and new API names.
  const locale = new Intl.Locale(lang) as Intl.Locale & { getTextInfo?: () => { direction: 'ltr' | 'rtl' }; textInfo?: { direction: 'ltr' | 'rtl' } };
  return locale.getTextInfo?.().direction ?? locale.textInfo?.direction ?? 'ltr';
}
