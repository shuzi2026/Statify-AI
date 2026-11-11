# App source-message localization

locale.ts selects the region. runtime.ts exports the same locale and source-message translator.

scripts/i18n-plugin.mjs translates approved source literals, JSX labels, and template fragments using en.json. User names, notes, and save fields retain their original text.

Run npm run test:compat after changes and restart Vite after editing the catalog. Use http://127.0.0.1:15286/ for the English development preview.
