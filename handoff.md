# CasualProviders — Handoff

## Summary

**CasualProviders** is a third-party plugin for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
(`dsh`) that makes LLM provider setup a one-gesture operation. It adds a **Quick Setup** panel and a
per-provider-card control to the Models settings page, both driven by a curated catalog of 28 major
providers with their credential reference and default model already resolved.

- **Source:** `/home/kyssta/Documents/Codes/CasualProviders/`
- **Remote:** `https://github.com/kyssta-exe/CasualProviders.git`
- **Installed into:** `~/.dsh/profiles/web` (via `dsh plugin --profile web add <path>` → `link:`)
- **Targets:** dsh `0.2.0-rc.2` (the version installed at `~/.local/bin/dsh`)

## Why it exists

dsh already ships the whole provider stack. `@earendil-works/pi-ai@0.85.1` carries **39 providers**
with endpoints, model catalogs, and login flows, and the built-in Models page can add any of them and
store an API key. What was missing is the part a first-time user needs: a short, curated list where
choosing a provider and pasting a key is a single action, with no knowledge of route ids, endpoints,
model lists, or credential references required.

**The central design decision: this plugin stores no endpoint data.** Every route it curates is one
`pi-ai` already describes, so `api`, `baseURL`, and the model list come from the installed catalog. The
minimum configuration for any provider stays one line:

```yaml
- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    providers:
      openai:
        apiKeyEnv: OPENAI_API_KEY   # a credential reference, never a key value
```

What the plugin *does* add is what a catalog cannot know: which routes are worth a first-time user's
attention, how they group, where a pasted key belongs, and which model to pick when someone says
"make this my default".

## Install

```sh
dsh plugin --profile web add github:kyssta-exe/CasualProviders   # see caveat below
# or, from a built checkout:
dsh plugin --profile web add /path/to/CasualProviders
dsh web --no-open     # then: Settings -> Models, scroll to Quick Setup
```

> **Caveat — a git install does not build.** dsh's own docs state that a git install fetches sources
> and never runs `build`, so a TypeScript package arrives without `lib/` and fails to load with a
> missing-module error. This repo is plain `src/` + a build step, so **`github:` installs will not
> work as-is.** Options: install from a built checkout, or `pnpm pack` and install the tarball. If
> GitHub installs are wanted, add a release workflow that runs `pnpm pack` and attaches the tarball.

## Remove

```sh
dsh plugin --profile web remove dsh-casual-providers
```

## Architecture

One package, two faces, one Loader row.

| Piece | File | Role |
|---|---|---|
| Host half | `src/index.ts` | The `Config` schema (this entry's settings namespace) and the auto-page opt-out |
| Curated catalog | `src/catalog.ts` | 28 provider entries. Dependency-free, shared by both halves |
| Shared names/types | `src/contract.ts` | Namespace constants, settings shapes |
| Browser half | `src/client/index.ts` | Joins the two Models-page extension seats |
| Joined snapshot | `src/client/store.ts` | catalog × directory × live routes × settings sections × credential state |
| Host operations | `src/client/operations.ts` | Named read/write outcomes over the Remote namespaces |
| The panel | `src/client/QuickSetupPanel.tsx` | Footer surface |
| The card control | `src/client/ProviderCardExtras.tsx` | Per-card surface |
| Styles | `src/client/panel-styles.ts` | Stylesheet + class map, injected once |
| Copy | `src/client/locales.ts` | `en` + `zh` |

It is a **bundle**: `package.json` declares `dsh.bundle.patch`, and `cordis.patch.yml` inserts one
Loader row (`casual-providers`). `dsh plugin … add` appends the package to the profile's
`dsh.profile.bundles` automatically, so there is no patch file to edit by hand.

### Extension slots

Both surfaces are registered into the extension seats the Models page publishes for out-of-repo
plugins, so no shipped file is patched and without this plugin both seats render nothing:

- `settings.models.footer` — list slot, the Quick Setup panel
- `settings.models.provider-card` — keyed slot on `llm-pi-ai`, so one registration receives every
  card of that adapter family, hand-declared routes included

### The secrets path

- A pasted key goes through `credentials.set` → `~/.dsh/.credentials.yaml` (mode `0600`, cross-process lock).
- **Only the reference** is written to configuration. `settings.yaml` / `cordis.patch.yml` never carries a key.
- Writes commit **settings first, secret second**. A settings commit validates the merged provider
  profile, so a route the adapter refuses is rejected before any secret exists; and a failed
  credential stage leaves a keyless-but-configured route, which is the correct posture for a sign-in
  or ambient route anyway.
- Removal deletes the credential only when the profile names the exact derived reference this plugin
  would have written. A hand-written reference is not provably ours, so its secret is retained.

## Settings namespace

The plugin's own preferences live in its `Config` schema, which *is* its settings namespace, keyed by
the `casual-providers` row id. All four fields are `.volatile()` — that is what makes a field writable
by a client rather than a deployment default.

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- id: casual-providers
  name: dsh-casual-providers
  config:
    quickSetup: true         # show the panel
    autoSelectDefault: true  # offer to point agent-default-model at a newly added provider
    pinned: []               # route ids pinned to the top of the panel
    hidden: []               # route ids hidden from the panel
```

## Subscription-backed routes (ChatGPT / Copilot / Kimi)

`openai-codex`, `github-copilot`, and `kimi-coding` carry a `subscription` block in `src/catalog.ts`:

```ts
subscription: { plan: 'ChatGPT Plus / Pro / Business', methods: ['oauth'], startableFromBrowser: false }
```

**`startableFromBrowser: false` is a finding, not an omission.** In dsh 0.2.0:

- `dsh-llm-pi-ai` registers an OAuth flow for every installed provider that ships a login, on the
  **Host**, via `ctx.authorization.registerFlow`.
- **No Remote in this release exposes the authorization seam to the web client.** The browser's
  credential namespace is `credentials/{describe,set,unset}` — credential *references* only, and a
  record key like `llm-pi-ai/openai-codex` is outside the reference grammar. The `account/*` namespace
  is the DeepSeek product account, not a provider grant. The only `settings.models.sign-in` slot that
  exists is declared inside the DeepSeek onboarding dialog, not for provider OAuth.
- Therefore a "Sign in with ChatGPT" button in this plugin would be a lie: it would render, do
  nothing, and cost the user their trust.

What the panel does instead, and it is the honest offer:

1. **Add route** writes `providers: { 'openai-codex': {} }` — the complete configuration, reference-free,
   which is exactly what the adapter needs.
2. The row states plainly that this release has no web surface for the grant, and that the route
   becomes usable the moment a grant for it is stored under `llm-pi-ai/openai-codex`.
3. **Copy config** puts the exact YAML fragment on the clipboard, so nobody is stuck waiting on a
   surface the release does not have.

`github-copilot` and `kimi-coding` are `auth: 'key'` (pi-ai ships an api-key method for both), so
their keys *can* be pasted today; the `subscription` block notes the OAuth alternative exists.

**If a future dsh release adds an authorization remote**, set `startableFromBrowser: true` and add a
sign-in action — the catalog field exists precisely so the copy stops hedging once that is true.

## Testing

```sh
pnpm run verify     # typecheck + build + the two offline tests
```

Two browser tests need a running profile:

```sh
dsh web --no-open &                       # copy the URL it prints
node test/browser.mjs   <url>
node test/roundtrip.mjs <url>
```

| Test | Guards | Bug it caught |
|---|---|---|
| `test/host.mjs` | Built Host entry is a cordis function plugin (named exports, **no** default — a default makes the Loader discard the namespace); config fields volatile; mounts without Settings | — |
| `test/smoke.mjs` | Built client bundle is a well-formed Lazy-CJS factory requiring nothing outside the platform seed table; `inject` list pinned to services the shipped client plugins actually provide; **every curated route still exists in the installed pi-ai catalog** | `settingsScope` → `configForms` rename |
| `test/browser.mjs` | Real Chromium: no dead entry, panel renders, group headings actually translated | panel mounted but rendered nothing (first load never triggered); heading rendered literal `groups.frontier` |
| `test/roundtrip.mjs` | Real Chromium: paste key → settings + credential stores; Codex keyless route; make default; remove; patch restored and no reference leaked | Add-route button wired to the key handler, so it silently did nothing |

`test/probe.mjs <url> [label]` is an ad-hoc row inspector used while debugging; not part of the suite.

### Two harness facts worth not rediscovering

1. **`~/.dsh/profiles/node_modules` is stale.** It holds `0.1.5-rc.2` packages left over from an older
   install. The code that actually runs is `0.2.0-rc.2` under
   `~/.local/lib/node_modules/@deepseek-ai/dsh/node_modules/`. **Read the second one.** Building against
   the stale tree is what produced the `settingsScope` bug.
2. **A git install does not build.** See the install caveat above.

### Version floor

The browser half binds `configForms`, the settings base service that replaced `settingsScope` in
0.2.0. Against 0.1.x the entry stays parked as pending and the web boot reports it as a dead entry —
visible as a full-page "Failed to load plugins" screen.

## Known limits

- **Web only.** The browser half targets the web client (`dsh.client.platform: 'web'`). The `tui` and
  `headless` profiles expose no extension slots, so configure providers by editing the profile patch.
- **Suggested models are suggestions.** `suggestedModel` was read out of `pi-ai@0.85.1`. A stale id
  costs a model that does not resolve; change it in the model picker. Nothing else depends on it.
- **Non-catalog routes are out of scope.** A route `pi-ai` does not describe needs `api`, `baseURL`,
  and an explicit model list spelled by hand — that is the built-in *Add a custom provider* card's job.
- **Remove does not reset your default model.** Removing the provider that is currently the default
  leaves `agent-default-model` pointing at it. Rewriting a default model silently is worse than
  leaving a selection the model picker makes obvious.
- **`autoSelectDefault` only fires when nothing is selected.** When you add the first provider to a
  profile with no `agent-default-model` at all, the panel also points the default at it. A default you
  already have is never displaced — see `maybeAutoSelectDefault` in
  `src/client/QuickSetupPanel.tsx`, which is the narrowest reading of the setting that is still useful.

## Current state

- **Pushed** to `github.com/kyssta-exe/CasualProviders`, branch `main`, public. 3 commits at time of
  writing:
  - `4b2c31b` CasualProviders: one-click provider setup for the DeepSeek Harness
  - `574ac0f` Fix browser activation, and add the tests that would have caught it
  - `5d56e64` Support subscription routes, and fix the three bugs that hid them
- The local branch was renamed `master` -> `main` to match the remote's default branch. If you re-init,
  create `main` directly.
- Installed into `~/.dsh/profiles/web` as a `link:` to this checkout, so `pnpm run build` here is picked
  up by the next `dsh web` — no reinstall needed while iterating locally.
- Verified against a live `dsh web`: boots clean, panel renders, full round trip green
  (`configured -> codex route -> defaulted -> removed -> no trace`).
- The local profile currently has `opencode-go` configured with `OPENCODE_GO_API_KEY` and set as the
  default (`reasoningEffort: max`) — a real configuration made through the panel, not test residue.

## Suggested next steps

1. **Decide the install story.** As shipped, `github:kyssta-exe/CasualProviders` will not load, because a
   git install never runs `build`. Either add a release workflow that runs `pnpm pack` and attaches the
   tarball, or commit `lib/` (ugly, but it is what makes a plain git install work today).
2. **Prune the catalog against a newer pi-ai.** `opencode` (68 models) and the `*-token-plan-*` and
   `xiaomi-token-plan-*` families are not curated; decide whether they belong.
3. **Watch for the authorization remote.** The moment dsh exposes one, three `startableFromBrowser` flags
   flip and the subscription rows get real sign-in actions.
4. **Re-verify on the next dsh release.** The 0.1.x -> 0.2.0 `settingsScope` -> `configForms` rename is the
   kind of change that silently parks this entry as pending rather than erroring. `test/browser.mjs` is
   the canary; run it on every upgrade.
