"""LLM provider registry (CLAUDE.md §8.1).

Pure data with no engine imports, so settings, secrets and core/llm.py can all use it.
The frontend mirrors the ids, labels and secret names in `frontend/lib/llmProviders.ts`.
Default models are only suggestions: the user can pick any model the provider lists.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Provider:
    id: str
    label: str
    secret: str  # keyring name of its API key
    base_url: str | None  # None: the user enters it (OpenAI-compatible)
    default_model: str
    api: str = "openai"  # "openai": /chat/completions · "anthropic": Messages API
    reasoning: bool = False  # models may spend output tokens on thinking: give the limit headroom
    effort: bool = False  # send reasoning_effort="low" (dropped automatically if refused)
    completion_tokens: bool = False  # OpenAI's own API: max_completion_tokens instead of max_tokens


PROVIDERS: dict[str, Provider] = {
    p.id: p
    for p in (
        Provider("openai", "OpenAI", "openai_api_key", "https://api.openai.com/v1", "gpt-6.1-terra",
                 reasoning=True, effort=True, completion_tokens=True),
        Provider("anthropic", "Anthropic (Claude)", "anthropic_api_key", "https://api.anthropic.com/v1",
                 "claude-haiku-5-5", api="anthropic"),
        Provider("gemini", "Google Gemini", "gemini_api_key", "https://generativelanguage.googleapis.com/v1beta/openai",
                 "gemini-3.6-flash", reasoning=True, effort=True),
        Provider("xai", "xAI (Grok)", "xai_api_key", "https://api.x.ai/v1", "grok-4.3", reasoning=True),
        Provider("deepseek", "DeepSeek", "deepseek_api_key", "https://api.deepseek.com", "deepseek-flash"),
        Provider("qwen", "Alibaba Qwen", "qwen_api_key", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
                 "qwen-plus"),
        # 9Router, Groq, OpenRouter, Together AI, … : any endpoint that speaks the OpenAI format
        Provider("openai_compatible", "OpenAI-compatible", "llm_api_key", None, "metisclip"),
    )
}

DEFAULT_PROVIDER = "openai_compatible"
DEFAULT_COMPATIBLE_BASE_URL = "https://9routeryoga.my.id/v1"

# Keyring names of every LLM key, in display order
LLM_SECRETS: tuple[str, ...] = tuple(p.secret for p in PROVIDERS.values())


def provider_for_secret(name: str) -> Provider | None:
    return next((p for p in PROVIDERS.values() if p.secret == name), None)
