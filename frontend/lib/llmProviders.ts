import type { LlmProvider, LlmSecretName } from '@/lib/engine'

export interface LlmProviderInfo {
  id: LlmProvider
  label: string
  /** Model family shown under the name */
  family: string
  secret: LlmSecretName
  /** Where the user creates an API key */
  keyUrl?: string
}

/**
 * The six most used LLM providers plus any OpenAI-compatible endpoint.
 * Mirrors backend/core/llm_providers.py (ids, secret names); default models come from the engine settings.
 */
export const LLM_PROVIDERS: LlmProviderInfo[] = [
  { id: 'openai', label: 'OpenAI', family: 'GPT', secret: 'openai_api_key', keyUrl: 'https://platform.openai.com/api-keys' },
  { id: 'anthropic', label: 'Anthropic', family: 'Claude', secret: 'anthropic_api_key', keyUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'gemini', label: 'Google', family: 'Gemini', secret: 'gemini_api_key', keyUrl: 'https://aistudio.google.com/apikey' },
  { id: 'xai', label: 'xAI', family: 'Grok', secret: 'xai_api_key', keyUrl: 'https://console.x.ai' },
  { id: 'deepseek', label: 'DeepSeek', family: 'DeepSeek', secret: 'deepseek_api_key', keyUrl: 'https://platform.deepseek.com/api_keys' },
  { id: 'qwen', label: 'Alibaba', family: 'Qwen', secret: 'qwen_api_key', keyUrl: 'https://www.alibabacloud.com/help/en/model-studio/get-api-key' },
  { id: 'openai_compatible', label: 'OpenAI-compatible', family: '9Router, Groq, OpenRouter, …', secret: 'llm_api_key' },
]

export const LLM_SECRET_NAMES: LlmSecretName[] = LLM_PROVIDERS.map((p) => p.secret)

export function providerInfo(id: LlmProvider): LlmProviderInfo {
  return LLM_PROVIDERS.find((p) => p.id === id) || LLM_PROVIDERS[LLM_PROVIDERS.length - 1]
}
