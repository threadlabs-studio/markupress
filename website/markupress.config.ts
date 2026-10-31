import { defineConfig } from 'markupress';

export default defineConfig({
  title: 'Markupress',
  locales: { en: { label: 'English' }, fr: { label: 'Français' }, ar: { label: 'العربية' } },
  defaultLocale: 'en',
  base: '/markupress/',
  origin: 'https://threadlabs-studio.github.io',
  robots: true,
  editLink: 'https://github.com/threadlabs-studio/markupress/edit/main/website/',
  nav: [
    { label: 'npm', href: 'https://www.npmjs.com/package/markupress' },
    { label: 'GitHub', href: 'https://github.com/threadlabs-studio/markupress' },
  ],
});
