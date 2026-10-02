/**
 * Quick Setup copy. `en` is the source of truth for the key union; `zh` must
 * carry exactly the same keys.
 *
 * Group headings are flat keys rather than a nested dictionary because the
 * locale seam types a namespace as `Record<key, string>` — a nested object
 * would not be a valid dictionary value. `groupKey` maps a catalog group onto
 * its heading key so the panel never builds a key name at the call site.
 */

import type { CasualGroup } from '../catalog.ts'

export const en = {
  panelTitle: 'Quick Setup',
  panelBlurb: 'Pick a provider, paste a key, and it is wired up — endpoints and model lists come from the bundled catalog.',
  loading: 'Loading providers…',
  dismiss: 'Hide panel',
  restore: 'Show panel',
  groupFrontier: 'Frontier labs',
  groupFast: 'Fast and affordable',
  groupGateway: 'Gateways and aggregators',
  groupSubscription: 'Subscriptions and sign-in',
  groupCloud: 'Cloud platforms',
  groupRegional: 'Regional',
  keyLabel: 'API key',
  keyPlaceholder: 'Paste your key',
  keyRejected: 'That does not look like an API key — check for a stray quote, newline, or a pasted NAME=value line.',
  save: 'Save',
  saving: 'Saving…',
  remove: 'Remove',
  removeConfirm: 'Remove {name}? The API key stored for it is deleted too.',
  makeDefault: 'Make default',
  defaultBadge: 'Default',
  hide: 'Hide',
  getKey: 'Get a key',
  stateReady: 'Configured',
  stateActive: 'Serving now',
  stateKeyOnly: 'Key saved — save the route to start',
  stateKeyMissing: 'No key stored',
  stateUnknown: 'State unavailable',
  stateUnknownRoute: 'Not in this build’s provider catalog',
  stateNotMounted: 'The pi-ai provider adapter is not mounted, so no provider route can be configured.',
  signinHint: 'Authenticates through a browser sign-in — finish it from the provider card above.',
  ambientHint: 'Authenticates with ambient cloud credentials — export them, then reload.',
  configured: 'Route configured',
  docsNote: 'Keys are stored write-only and are sent nowhere except this provider.',
  saved: '{name} is set up.',
  removed: '{name} was removed.',
  defaultSet: '{name} is now the default model.',
  nothingConfigured: 'No provider configured yet — pick one above to get started.',
  noSuggestedModel: 'This route has no suggested model, so pick one in the model picker.',
} as const

export type QuickSetupKey = keyof typeof en

/** Heading key for one catalog group. */
const GROUP_KEYS: Readonly<Record<CasualGroup, QuickSetupKey>> = {
  frontier: 'groupFrontier',
  fast: 'groupFast',
  gateway: 'groupGateway',
  subscription: 'groupSubscription',
  cloud: 'groupCloud',
  regional: 'groupRegional',
}

/**
 * Resolve a catalog group's heading key.
 * @param group - the catalog group.
 * @returns the dictionary key holding its heading.
 */
export function groupKey(group: CasualGroup): QuickSetupKey {
  return GROUP_KEYS[group]
}

export const zh: Record<QuickSetupKey, string> = {
  panelTitle: '快速配置',
  panelBlurb: '选一个供应商，粘贴密钥即可——接口地址和模型列表都来自内置目录。',
  loading: '正在加载供应商…',
  dismiss: '隐藏面板',
  restore: '显示面板',
  groupFrontier: '前沿实验室',
  groupFast: '快速且便宜',
  groupGateway: '网关与聚合平台',
  groupSubscription: '订阅与登录',
  groupCloud: '云平台',
  groupRegional: '区域版',
  keyLabel: 'API 密钥',
  keyPlaceholder: '粘贴你的密钥',
  keyRejected: '这看起来不像 API 密钥——检查是否多了一对引号、换行，或粘贴成了 NAME=value 的环境变量行。',
  save: '保存',
  saving: '保存中…',
  remove: '移除',
  removeConfirm: '要移除 {name} 吗？为它存储的 API 密钥也会一并删除。',
  makeDefault: '设为默认',
  defaultBadge: '默认',
  hide: '隐藏',
  getKey: '获取密钥',
  stateReady: '已配置',
  stateActive: '正在服务',
  stateKeyOnly: '密钥已保存——保存路由后生效',
  stateKeyMissing: '未存储密钥',
  stateUnknown: '状态不可用',
  stateUnknownRoute: '此构建的供应商目录中没有该路由',
  stateNotMounted: 'pi-ai 供应商适配器未挂载，无法配置任何供应商路由。',
  signinHint: '通过浏览器登录认证——请在上方的供应商卡片中完成。',
  ambientHint: '使用云环境凭据认证——导出后重新加载。',
  configured: '路由已配置',
  docsNote: '密钥只写存储，除本供应商外不会发送到任何地方。',
  saved: '{name} 已配置完成。',
  removed: '{name} 已移除。',
  defaultSet: '{name} 现在是默认模型。',
  nothingConfigured: '还没有配置任何供应商——先从上面选一个开始。',
  noSuggestedModel: '该路由没有推荐的模型，请在模型选择器中自行选择。',
}
