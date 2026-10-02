# CasualProviders

One-click provider setup for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`).

The harness ships a complete provider stack: `pi-ai` carries 39 providers with
their endpoints, model catalogs, and login flows, and the Models settings page
can already add any of them and store an API key. What it does not have is the
thing a first-time user actually needs — a short, curated list where picking a
provider, pasting a key, and being done is one gesture.

**CasualProviders adds that.** It contributes a *Quick Setup* panel to the Models
page and a compact control inside every provider card, both driven by a curated
catalog of the major providers with their credential reference and default model
already resolved. It changes nothing else: your routes, your keys, and your
`settings.yaml` stay exactly where the built-in page would have put them.

---

## What it does

| Surface | What you get |
|---|---|
| **Models → Quick Setup** | Every curated provider, grouped (frontier labs, fast & affordable, gateways, subscriptions, cloud platforms, regional), each with a one-field API-key input, a *Get a key* link, live state, **Make default**, **Remove**, and **Hide**. |
| **Models → any provider card** | The same key field inline, so you never have to scroll down to configure the provider you are already looking at. |
| **`settings.yaml` / profile patch** | Nothing new to hand-write. The panel writes `llm-pi-ai.providers.<id>.apiKeyEnv` and `agent-default-model` through the ordinary settings seam. |

Twenty-eight providers ship in the catalog, covering OpenAI, Anthropic, Google,
xAI, DeepSeek, Groq, Cerebras, Mistral, Together, Fireworks, NVIDIA, Hugging
Face, Baseten, OpenRouter, Vercel AI Gateway, Cloudflare AI Gateway, GitHub
Copilot, OpenAI Codex, Kimi For Coding, OpenCode Zen, Amazon Bedrock, Google
Vertex, Azure OpenAI, Moonshot, Z.AI, MiniMax, Xiaomi, and Qwen.

## Install

From a checkout:

```sh
dsh plugin --profile web add /path/to/CasualProviders
```

From git (after you push):

```sh
dsh plugin --profile web add github:YOUR-USER/CasualProviders
```

Then start the profile as usual:

```sh
dsh web
```

Open **Settings → Models** and scroll past the provider rows to **Quick Setup**.

`dsh plugin … add` appends the package to your profile's `dsh.profile.bundles`
because `package.json` declares `dsh.bundle`, so there is no `cordis.patch.yml`
to edit by hand. To remove it:

```sh
dsh plugin --profile web remove dsh-casual-providers
```

> A git-installed package runs `pnpm pack` semantics, not `build` — dsh's docs
> are explicit that a git install fetches sources and never runs a build
> script, so a TypeScript package arrives without `lib/` and fails to load.
> Either install from a checkout that has been built (as above, where pnpm links
> the directory and `lib/` is already present), or publish a tarball / npm
> release that includes `lib/`.

## Develop

```sh
pnpm install
pnpm run verify     # typecheck + build + both smoke tests
pnpm run watch      # rebuild the two bundles on change
```

`pnpm run verify` runs a typecheck, both bundles, and the two offline smoke
tests. Two more tests drive a real browser and need a running profile:

```sh
dsh web --no-open &                       # copy the URL it prints
node test/browser.mjs   <url>             # the panel mounts and renders
node test/roundtrip.mjs <url>             # configure -> default -> remove, no trace
```

All four are worth having, because a dsh plugin has failure modes a typecheck
cannot see — and each of these caught a real bug during development:

- **`test/host.mjs`** imports the **built** `lib/index.js` the way the Cordis
  Loader does and asserts it is a function plugin (named exports, *no* default
  export — a default export makes the Loader discard the namespace), that all
  four config fields are `volatile()` (the only fields a client may write), and
  that the page policy registers through an optional `settings` child so the
  plugin still mounts without Settings.
- **`test/smoke.mjs`** evaluates the **built** `lib/client.js` the way the web
  client does — through `window.__ModuleLoader__.load` and its factory closure,
  with the platform seed table stubbed — then drives `apply` against a fake
  cordis context. It fails if the bundle requires anything outside the seed
  table, which at runtime would throw inside the factory, and it pins the
  `inject` list to the services the shipped client plugins actually provide.
  *This is the test that would have caught the original bug: `settingsScope` was
  renamed to `configForms` in 0.2.0, and an unsatisfied `inject` name does not
  throw — cordis parks the fiber and the web boot reports a dead entry.*
- **`test/browser.mjs`** drives real Chromium against a running profile and
  asserts the failure screen is *not* what it sees, then that the panel renders
  with every group heading actually translated. *This caught a panel that
  mounted cleanly and showed nothing, because nothing triggered its first load,
  and a heading that rendered the literal `groups.frontier`.*
- **`test/roundtrip.mjs`** types a dummy key, saves, makes the provider default,
  removes it, and asserts the profile patch and the credential store return to
  their pre-test checksums. *This proved the two-store write ordering works and
  that no key literal ever reaches `cordis.patch.yml`.* It writes to the real
  harness home and cleans up after itself, so run it against a profile you do
  not mind touching.

## How it works

**The endpoint knowledge is not duplicated here.** Every route in the catalog is
one `pi-ai` already describes, so `api`, `baseURL`, and the model list come from
the installed catalog and this plugin never restates them. The minimum profile
for any of them is one credential reference:

```yaml
- id: llm-pi-ai
  name: '@deepseek-ai/dsh-llm-pi-ai'
  config:
    providers:
      openai:
        apiKeyEnv: OPENAI_API_KEY   # a reference, never a key value
```

What this plugin adds is the part a catalog cannot know: which routes are worth
a first-time user's attention, how they group, where a pasted key belongs, and
which model to pick when someone says "make this my default".

**Secrets never enter configuration.** A pasted key goes through
`credentials.set` and lands in `~/.dsh/.credentials.yaml` (mode `0600`, under a
cross-process lock). Only the *reference* is written to configuration. Removing
a row deletes the credential, but only when the profile names the exact derived
reference this plugin would have written — a hand-written reference is not
provably ours, so its secret is retained.

**Settings-first ordering.** Every write commits the settings change before it
stores the secret. A settings commit validates the merged provider profile, so a
route the adapter refuses is rejected before any secret exists; and a failed
credential stage leaves a keyless but configured route, which is exactly the
posture a sign-in or ambient-credential route wants anyway.

**It adds capability to a page it does not own.** Both surfaces are registered
into the extension slots the Models page publishes for out-of-repo plugins —
`settings.models.footer` (list) and `settings.models.provider-card` (keyed) —
so no shipped file is patched. Without this plugin the two seats render nothing.

**Durable preferences.** The panel's own settings (shown, pinned, hidden, and
whether to auto-select a default) live in this plugin's `Config` schema, which
*is* its settings namespace, keyed by the `casual-providers` row that
`cordis.patch.yml` inserts. All four fields are `volatile()`, which is what
makes them writable user preferences rather than deployment defaults.

## Layout

```
src/
  index.ts                    Host half: the Config schema (this entry's settings
                              namespace) and the page-policy opt-out.
  catalog.ts                  The curated provider list. Dependency-free, shared
                              by both halves.
  contract.ts                 Names and types shared by both halves.
  client/
    index.ts                  Browser half: joins the two Models-page seats.
    store.ts                  The joined snapshot: catalog x directory x live
                              routes x settings sections x credential state.
    operations.ts             The Host reads and writes, as named outcomes.
    QuickSetupPanel.tsx       The panel.
    ProviderCardExtras.tsx    The per-card control.
    panel-styles.ts           Stylesheet and class map, injected once.
    locales.ts                en + zh copy.
cordis.patch.yml              The profile row this bundle contributes.
test/
  host.mjs                    Built Host entry, loaded the way the Loader does.
  smoke.mjs                   Built client bundle, executed the way the browser does.
  chromium.mjs                Locates the cached Playwright build.
  browser.mjs                 Real browser: the panel mounts and renders.
  roundtrip.mjs               Real browser: configure -> default -> remove, no trace.
```

## Notes and limits

- **Web only.** The browser half targets the web client (`dsh.client.platform:
  'web'`). The `tui` / `headless` profiles have no extension slots to join, so
  there is nothing to add there; configure providers by editing the profile
  patch as usual.
- **Suggested models are suggestions.** `suggestedModel` was read out of
  `pi-ai@0.85.1`'s catalog. A stale id costs you a model that does not resolve —
  change it in the model picker. Nothing else depends on it.
- **Non-catalog routes are out of scope.** A route `pi-ai` does not describe
  needs `api`, `baseURL`, and an explicit model list spelled out by hand; that is
  what the built-in *Add a custom provider* card is for, and this plugin defers
  to it.
- **Sign-in and ambient routes.** `github-copilot`, `openai-codex`, and
  `kimi-coding` authenticate through the authorization seam's browser flow —
  the panel creates the route and points you at the card that completes it.
  `amazon-bedrock` and `google-vertex` use ambient cloud credentials, so the
  panel deliberately writes no `apiKeyEnv` at all, which is what tells the
  adapter to defer to `pi-ai`'s own discovery.
- **Remove does not reset your default model.** Removing a provider that is
  currently the default leaves `agent-default-model` pointing at it. Rewriting
  someone's default model silently would be worse than leaving a selection the
  model picker makes obvious — change it there.
- **Requires dsh 0.2.0 or newer.** The browser half binds `configForms`, the
  settings base service that replaced `settingsScope` in 0.2.0. Against 0.1.x
  the entry stays parked as pending and the web boot reports it as a dead
  entry.

## License

MIT
