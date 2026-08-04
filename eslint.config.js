/* =========================================================================
   ESLint flat config.

   The app has two very different JavaScript environments:

     • Node/CommonJS — the Electron main process, the preload bridge, the
       database layer, the detached local-server helper and the build tools.
     • Renderer classic scripts — loaded as plain <script> tags from
       index.html, with no bundler and no module system. All of their
       top-level `const`/`let`/`function` bindings share one global lexical
       scope, so cross-file references are normal and expected.

   Because ESLint analyses one file at a time it cannot see the renderer's
   shared scope, so `no-undef` is disabled there. The cross-file hazard that
   actually matters — two renderer files declaring the same top-level name,
   which is a hard SyntaxError that kills the whole app at load — is checked
   separately by `npm run check:globals` (tools/check-globals.js).
   ========================================================================= */
'use strict';

const NODE_GLOBALS = {
  require: 'readonly',
  module: 'writable',
  exports: 'writable',
  process: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
  URL: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
};

const BROWSER_GLOBALS = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  console: 'readonly',
  localStorage: 'readonly',
  fetch: 'readonly',
  URL: 'readonly',
  Blob: 'readonly',
  File: 'readonly',
  FileReader: 'readonly',
  FormData: 'readonly',
  Event: 'readonly',
  CustomEvent: 'readonly',
  AbortController: 'readonly',
  DOMParser: 'readonly',
  indexedDB: 'readonly',
  crypto: 'readonly',
  alert: 'readonly',
  confirm: 'readonly',
  prompt: 'readonly',
  requestAnimationFrame: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  queueMicrotask: 'readonly',
  structuredClone: 'readonly',
};

/** Rules applied everywhere. Kept deliberately small: this codebase had no
    linter at all, so the goal is catching real defects, not restyling it. */
const SHARED_RULES = {
  'no-redeclare': 'error',
  'no-dupe-keys': 'error',
  'no-dupe-args': 'error',
  'no-duplicate-case': 'error',
  'no-func-assign': 'error',
  'no-unreachable': 'error',
  'no-fallthrough': 'error',
  'no-self-compare': 'error',
  'no-unsafe-negation': 'error',
  'no-cond-assign': ['error', 'always'],
  'no-constant-condition': ['error', { checkLoops: false }],
  'valid-typeof': 'error',
  'use-isnan': 'error',
  'no-var': 'error',
  'prefer-const': ['warn', { destructuring: 'all' }],
  'no-unused-vars': ['warn', {
    args: 'after-used',
    argsIgnorePattern: '^_',
    caughtErrors: 'none',
    varsIgnorePattern: '^_',
  }],
  // Existing style uses `catch (e) { /* explanatory comment */ }` widely; the
  // comment is the documentation, so only truly empty blocks are flagged.
  'no-empty': ['error', { allowEmptyCatch: true }],
  eqeqeq: ['warn', 'smart'],
  'no-implicit-globals': 'off',
};

const NODE_FILES = ['main.js', 'preload.js', 'db.js', 'server-service.js', 'server-paths.js', 'tools/**/*.js', 'eslint.config.js'];
const RENDERER_FILES = [
  'app.js', 'auth.js', 'builders.js', 'data.js', 'deploy.js', 'icons.js',
  'legal.js', 'mods.js', 'mods-db.js', 'picker-db.js', 'server-setup.js',
  'ui-kit.js', 'wizard.js',
];

module.exports = [
  {
    ignores: ['node_modules/**', 'dist/**', 'build/**'],
  },
  {
    files: NODE_FILES,
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: NODE_GLOBALS,
    },
    rules: SHARED_RULES,
  },
  {
    files: RENDERER_FILES,
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: { ...BROWSER_GLOBALS, module: 'writable' },
    },
    rules: {
      ...SHARED_RULES,
      // Renderer files share one global scope across <script> tags; ESLint
      // cannot see across files, so cross-file references look undefined.
      // tools/check-globals.js covers the real risk instead.
      'no-undef': 'off',
      // Cross-file helpers legitimately look unused within their own file.
      'no-unused-vars': 'off',
    },
  },
  {
    // constants.js is loaded both ways: required by Node and <script>-included
    // by the renderer.
    files: ['constants.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: { ...NODE_GLOBALS, ...BROWSER_GLOBALS, module: 'writable' },
    },
    rules: { ...SHARED_RULES, 'no-unused-vars': 'off' },
  },
];
