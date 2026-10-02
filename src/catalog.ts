/**
 * The curated provider catalog this plugin ships.
 *
 * Every entry names a route key that pi-ai's installed catalog already
 * describes, so `api`, `baseURL`, and the model list all come from that
 * catalog and this file never restates an endpoint. What it adds is the part
 * a catalog cannot know: which routes are worth a first-time user's attention,
 * how they are grouped, which credential reference a key belongs under, and
 * which model to select when the user asked for "make this my default".
 *
 * Model ids were read out of `@earendil-works/pi-ai@0.85.1`'s installed
 * catalog. A stale id here is harmless: it only pre-fills the default-model
 * field, and the user can change it — see `DEFAULT_MODEL_IS_A_SUGGESTION` in
 * the README.
 *
 * This module is imported by both the Host and the browser half, so it must
 * stay free of runtime dependencies.
 */

/** How a route authenticates, which decides what the panel offers. */
export type CasualAuth = 'key' | 'signin' | 'ambient'

/** Presentation groups, in the order the panel renders them. */
export type CasualGroup = 'frontier' | 'fast' | 'gateway' | 'subscription' | 'cloud' | 'regional'

/** One curated provider route. */
export interface CasualProvider {
  /** pi-ai / dsh route id — the settings key, the credential-record id stem, and the default-model `provider`. */
  readonly id: string
  /** Display name. Falls back to the route id when absent. */
  readonly label: string
  /** One line explaining who this is for. */
  readonly blurb: string
  /** Presentation group. */
  readonly group: CasualGroup
  /** How the route authenticates. */
  readonly auth: CasualAuth
  /**
   * Credential reference a pasted key is stored under. Absent for `signin`
   * and `ambient` routes, which have nothing to paste.
   */
  readonly keyRef?: string
  /** Placeholder shown in the key field, purely a hint about key shape. */
  readonly keyHint?: string
  /** Model this plugin suggests when the route becomes the process default. */
  readonly suggestedModel?: string
  /** Where the user obtains a key. */
  readonly docsUrl?: string
}

/**
 * Derive the credential reference for a route, matching the convention the
 * built-in Models page uses (`MINIMAX_CN_API_KEY` for `minimax-cn`) so a
 * provider configured here and one configured there are the same profile.
 * @param provider - provider route id.
 * @returns the derived reference name.
 */
export function deriveKeyRef(provider: string): string {
  return `${provider.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`
}

/**
 * Every curated route, in render order. Ids must exist in pi-ai's installed
 * catalog; a route the catalog does not describe would need `api`, `baseURL`,
 * and an explicit model list, which is what the built-in "add custom
 * provider" card is for.
 */
export const CASUAL_PROVIDERS: readonly CasualProvider[] = [
  // ── Frontier labs ────────────────────────────────────────────────────────
  {
    id: 'openai',
    label: 'OpenAI',
    blurb: 'GPT-5 and the rest of the first-party OpenAI line.',
    group: 'frontier',
    auth: 'key',
    keyHint: 'sk-proj-…',
    suggestedModel: 'gpt-5.4',
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    blurb: 'Claude, over the native Messages API with prompt caching.',
    group: 'frontier',
    auth: 'key',
    keyHint: 'sk-ant-…',
    suggestedModel: 'claude-fable-5',
    docsUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'google',
    label: 'Google Gemini',
    blurb: 'Gemini over the Generative Language API.',
    group: 'frontier',
    auth: 'key',
    keyHint: 'AIza…',
    suggestedModel: 'gemini-2.5-pro',
    docsUrl: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'xai',
    label: 'xAI',
    blurb: 'Grok.',
    group: 'frontier',
    auth: 'key',
    keyHint: 'xai-…',
    suggestedModel: 'grok-4.6',
    docsUrl: 'https://console.x.ai',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    blurb: 'DeepSeek direct — the harness vendor’s own route.',
    group: 'frontier',
    auth: 'key',
    keyHint: 'sk-…',
    suggestedModel: 'deepseek-v4-pro',
    docsUrl: 'https://platform.deepseek.com/api_keys',
  },

  // ── Fast and affordable ──────────────────────────────────────────────────
  {
    id: 'groq',
    label: 'Groq',
    blurb: 'LPU inference; very fast, very cheap open-weight models.',
    group: 'fast',
    auth: 'key',
    keyHint: 'gsk_…',
    suggestedModel: 'openai/gpt-oss-120b',
    docsUrl: 'https://console.groq.com/keys',
  },
  {
    id: 'cerebras',
    label: 'Cerebras',
    blurb: 'Wafer-scale inference; the fastest gpt-oss serving.',
    group: 'fast',
    auth: 'key',
    keyHint: 'csk-…',
    suggestedModel: 'gpt-oss-120b',
    docsUrl: 'https://cloud.cerebras.ai',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    blurb: 'European lab; strong coding and small-model line.',
    group: 'fast',
    auth: 'key',
    keyHint: '',
    suggestedModel: 'mistral-large-latest',
    docsUrl: 'https://console.mistral.ai/api-keys',
  },
  {
    id: 'together',
    label: 'Together AI',
    blurb: 'Cheap hosted open weights, including MiniMax and Qwen.',
    group: 'fast',
    auth: 'key',
    keyHint: '',
    suggestedModel: 'MiniMaxAI/minimax-M3',
    docsUrl: 'https://api.together.ai/settings/api-keys',
  },
  {
    id: 'fireworks',
    label: 'Fireworks AI',
    blurb: 'Fast hosted open weights with function-calling tuned builds.',
    group: 'fast',
    auth: 'key',
    keyHint: '',
    suggestedModel: 'accounts/fireworks/models/minimax-m3',
    docsUrl: 'https://fireworks.ai/api-keys',
  },
  {
    id: 'nvidia',
    label: 'NVIDIA NIM',
    blurb: 'Free-tier hosted Nemotron, Llama, and DeepSeek builds.',
    group: 'fast',
    auth: 'key',
    keyHint: 'nvapi-…',
    suggestedModel: 'deepseek-ai/deepseek-v4-pro-0813',
    docsUrl: 'https://build.nvidia.com',
  },
  {
    id: 'huggingface',
    label: 'Hugging Face',
    blurb: 'Inference Providers router; your HF token bills many vendors.',
    group: 'fast',
    auth: 'key',
    keyHint: 'hf_…',
    suggestedModel: 'MiniMaxAI/minimax-M3',
    docsUrl: 'https://huggingface.co/settings/tokens',
  },
  {
    id: 'baseten',
    label: 'Baseten',
    blurb: 'Production inference hosting with per-model deployments.',
    group: 'fast',
    auth: 'key',
    keyHint: '',
    suggestedModel: 'moonshotai/Kimi-K3',
    docsUrl: 'https://app.baseten.co/settings/api-keys',
  },

  // ── Gateways and aggregators ─────────────────────────────────────────────
  {
    id: 'openrouter',
    label: 'OpenRouter',
    blurb: 'One key, every major lab. The fastest way to compare models.',
    group: 'gateway',
    auth: 'key',
    keyHint: 'sk-or-…',
    suggestedModel: 'anthropic/claude-fable-5',
    docsUrl: 'https://openrouter.ai/keys',
  },
  {
    id: 'vercel-ai-gateway',
    label: 'Vercel AI Gateway',
    blurb: 'Vercel’s model gateway; one key across hosted providers.',
    group: 'gateway',
    auth: 'key',
    keyHint: 'vck_…',
    suggestedModel: 'alibaba/qwen-3-30b',
    docsUrl: 'https://vercel.com/dashboard/ai-gateway',
  },
  {
    id: 'cloudflare-ai-gateway',
    label: 'Cloudflare AI Gateway',
    blurb: 'Cloudflare gateway with caching, rate limits, and observability.',
    group: 'gateway',
    auth: 'key',
    keyHint: '',
    suggestedModel: 'claude-fable-5',
    docsUrl: 'https://dash.cloudflare.com/profile/api-tokens',
  },

  // ── Subscriptions and sign-in ────────────────────────────────────────────
  {
    id: 'github-copilot',
    label: 'GitHub Copilot',
    blurb: 'Uses your existing Copilot subscription through a browser sign-in.',
    group: 'subscription',
    auth: 'signin',
    suggestedModel: 'claude-fable-5',
  },
  {
    id: 'openai-codex',
    label: 'OpenAI Codex',
    blurb: 'Your ChatGPT plan, through a browser sign-in. No API key.',
    group: 'subscription',
    auth: 'signin',
    suggestedModel: 'gpt-5.4',
  },
  {
    id: 'kimi-coding',
    label: 'Kimi For Coding',
    blurb: 'Moonshot’s coding plan through a browser sign-in.',
    group: 'subscription',
    auth: 'signin',
    suggestedModel: 'k3',
  },
  {
    id: 'opencode-go',
    label: 'OpenCode Zen',
    blurb: 'OpenCode’s hosted gateway; one key, many models.',
    group: 'subscription',
    auth: 'key',
    keyHint: '',
    suggestedModel: 'deepseek-v4-flash',
    docsUrl: 'https://opencode.ai/auth',
  },

  // ── Cloud platforms ──────────────────────────────────────────────────────
  {
    id: 'amazon-bedrock',
    label: 'Amazon Bedrock',
    blurb: 'Uses your AWS credential chain — profile, env, or instance role.',
    group: 'cloud',
    auth: 'ambient',
    suggestedModel: 'anthropic.claude-fable-5',
  },
  {
    id: 'google-vertex',
    label: 'Google Vertex AI',
    blurb: 'Uses application default credentials against your GCP project.',
    group: 'cloud',
    auth: 'ambient',
    suggestedModel: 'gemini-3.1-pro-preview',
  },
  {
    id: 'azure-openai-responses',
    label: 'Azure OpenAI',
    blurb: 'Your Azure OpenAI deployments, keyed like any Azure resource.',
    group: 'cloud',
    auth: 'key',
    keyHint: '',
    suggestedModel: 'gpt-4.1',
    docsUrl: 'https://portal.azure.com',
  },

  // ── Regional ─────────────────────────────────────────────────────────────
  {
    id: 'moonshotai',
    label: 'Moonshot AI',
    blurb: 'Kimi, international endpoint.',
    group: 'regional',
    auth: 'key',
    keyHint: 'sk-…',
    suggestedModel: 'kimi-k2.7-code',
    docsUrl: 'https://platform.moonshot.ai',
  },
  {
    id: 'zai',
    label: 'Z.AI (GLM)',
    blurb: 'Zhipu’s GLM line, international endpoint.',
    group: 'regional',
    auth: 'key',
    keyHint: '',
    suggestedModel: 'glm-5.2',
    docsUrl: 'https://z.ai/manage-apikey/apikey-list',
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    blurb: 'MiniMax M-series, international endpoint.',
    group: 'regional',
    auth: 'key',
    keyHint: '',
    suggestedModel: 'minimax-M3',
    docsUrl: 'https://platform.minimax.io',
  },
  {
    id: 'xiaomi',
    label: 'Xiaomi MiMo',
    blurb: 'Xiaomi’s MiMo open-weight line, hosted.',
    group: 'regional',
    auth: 'key',
    keyHint: '',
    suggestedModel: 'mimo-v2.5-pro',
    docsUrl: 'https://platform.xiaomimimo.com',
  },
  {
    id: 'qwen-token-plan',
    label: 'Qwen Token Plan',
    blurb: 'Alibaba’s coding token plan, international region.',
    group: 'regional',
    auth: 'key',
    keyHint: '',
    suggestedModel: 'deepseek-v4-pro',
    docsUrl: 'https://bailian.console.aliyun.com',
  },
]

/** Group render order and the heading key suffix used for each. */
export const CASUAL_GROUP_ORDER: readonly CasualGroup[] = [
  'frontier',
  'fast',
  'gateway',
  'subscription',
  'cloud',
  'regional',
]

/** Curated routes by id, for O(1) panel lookups. */
export const CASUAL_BY_ID: ReadonlyMap<string, CasualProvider> = new Map(
  CASUAL_PROVIDERS.map(provider => [provider.id, provider]),
)
