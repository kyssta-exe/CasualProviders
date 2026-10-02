import { defineConfig } from 'tsdown'

/**
 * Two bundles from one source tree.
 *
 * `lib/index.js` is the Host half the Cordis Loader imports by package name:
 * ESM, Node platform, every `@deepseek-ai/*` specifier left external so the
 * loader's own singletons (cordis, the schemastery fork) stay the *same*
 * module instances the Host runs.
 *
 * `lib/client.js` is the browser half the web client serves at
 * `/plugins/<id>/client.js`. The client module system is Lazy-CJS: a bundle
 * registers a *factory* through `window.__ModuleLoader__.load`, receives the
 * module-table `require` for its externals, and its module body runs only at
 * materialization. So this output is CJS wrapped in that envelope, with
 * exactly the platform seed table as externals and everything else inlined.
 *
 * The seed table is the frozen set the web shell installs (`PLATFORM_MODULES`):
 * React, Cordis, and the static UI libraries. Anything else in a client bundle
 * must be inlined, because the module graph is flat and only table words
 * resolve — a `require` of a non-table specifier throws at runtime. That is
 * why every other dsh package is imported from the browser half type-only.
 */

/** Specifiers the web shell pre-seeds; a `require` of any other word fails. */
const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-slots',
]

/** The registration id the module graph row names: the package name. */
const CLIENT_ID = 'dsh-casual-providers'

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    dts: false,
    clean: false,
    sourcemap: true,
    // `package.json` says `type: module`, so a bare `esm` format would emit
    // `index.mjs`; the manifest and the Loader both name `lib/index.js`.
    outExtensions: () => ({ js: '.js' }),
    outputOptions: { chunkFileNames: 'chunks/[name]-[hash].js' },
    deps: {
      neverBundle: (id: string) => id.startsWith('@deepseek-ai/'),
    },
  },
  {
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: ['cjs'],
    platform: 'browser',
    target: 'es2022',
    dts: false,
    clean: false,
    sourcemap: true,
    outExtensions: () => ({ js: '.js' }),
    deps: { neverBundle: [...PLATFORM_MODULES] },
    outputOptions: {
      // The Lazy-CJS envelope. `id` must equal the graph row's name or the
      // module system refuses to register the factory.
      //
      // The two `var` lines are the module record rolldown's CommonJS output
      // assumes the host provides; inside the factory they are not in scope,
      // so the envelope has to declare them. `return module.exports` at the
      // foot is what hands the plugin module back to the module system, which
      // then runs it through the same export-unwrap the Loader uses.
      banner: [
        'window.__ModuleLoader__.load({',
        `  id: ${JSON.stringify(CLIENT_ID)},`,
        '  factory: (require) => {',
        '    var module = { exports: {} };',
        '    var exports = module.exports;',
      ].join('\n'),
      footer: ['    return module.exports;', '  },', '});'].join('\n'),
    },
  },
])
