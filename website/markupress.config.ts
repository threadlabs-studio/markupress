import { defineConfig } from 'markupress';

export default defineConfig({
  title: 'Markupress',
  base: '/markupress/',
  origin: 'https://threadlabs-studio.github.io',
  robots: true,
  editLink: 'https://github.com/threadlabs-studio/markupress/edit/main/website/',
  nav: [
    { label: 'npm', href: 'https://www.npmjs.com/package/markupress' },
    { label: 'GitHub', href: 'https://github.com/threadlabs-studio/markupress' },
  ],
});
