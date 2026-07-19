/**
 * GENERATED FILE — DO NOT EDIT BY HAND.
 *
 * To add or modify entries, edit:
 *   src/main/providers/catalog.source.json
 * and run `npm run gen:catalog`.
 */

import type { ProviderEntry } from './types'

export const PROVIDER_CATALOG: readonly ProviderEntry[] =
[
    {
      "id": "anthropic",
      "label": "Anthropic",
      "aliases": [
        "claude"
      ],
      "featured": true,
      "envKeys": [
        "ANTHROPIC_API_KEY"
      ],
      "baseUrlEnv": "ANTHROPIC_BASE_URL",
      "authType": "api_key",
      "probeKind": "anthropicModels",
      "defaultBaseUrl": "https://api.anthropic.com",
      "notes": "Claude API. Keys look like `sk-ant-…`."
    },
    {
      "id": "openai",
      "label": "OpenAI",
      "featured": true,
      "envKeys": [
        "OPENAI_API_KEY"
      ],
      "baseUrlEnv": "OPENAI_BASE_URL",
      "authType": "api_key",
      "probeKind": "openaiModels",
      "defaultBaseUrl": "https://api.openai.com/v1",
      "notes": "GPT models. Keys look like `sk-…`."
    },
    {
      "id": "google",
      "label": "Google Gemini",
      "aliases": [
        "gemini",
        "google-gemini"
      ],
      "envKeys": [
        "GEMINI_API_KEY",
        "GOOGLE_API_KEY"
      ],
      "baseUrlEnv": "GOOGLE_BASE_URL",
      "authType": "api_key",
      "probeKind": "geminiModels",
      "defaultBaseUrl": "https://generativelanguage.googleapis.com",
      "notes": "Google AI Studio (Gemini Developer API)."
    },
    {
      "id": "vertex",
      "label": "Google Vertex AI",
      "aliases": [
        "vertex-ai",
        "gcp-vertex"
      ],
      "envKeys": [],
      "authType": "cloud_creds",
      "probeKind": "gcp",
      "notes": "Uses ADC. Configure project + region in your gateway."
    },
    {
      "id": "bedrock",
      "label": "AWS Bedrock",
      "aliases": [
        "aws-bedrock"
      ],
      "envKeys": [],
      "authType": "cloud_creds",
      "probeKind": "aws",
      "notes": "Uses AWS credentials from the standard chain."
    },
    {
      "id": "azure-openai",
      "label": "Azure OpenAI",
      "aliases": [
        "azure",
        "azure-openai"
      ],
      "envKeys": [
        "AZURE_OPENAI_API_KEY",
        "AZURE_API_KEY"
      ],
      "baseUrlEnv": "AZURE_OPENAI_ENDPOINT",
      "authType": "api_key",
      "probeKind": "azure",
      "notes": "Set endpoint via env or gateway config."
    },
    {
      "id": "azure-ai-foundry",
      "label": "Azure AI Foundry (Claude)",
      "aliases": [
        "azure-ai",
        "foundry"
      ],
      "envKeys": [
        "AZURE_API_KEY"
      ],
      "baseUrlEnv": "ANTHROPIC_BASE_URL",
      "authType": "api_key",
      "probeKind": "anthropicModels",
      "notes": "Anthropic endpoint over Azure Foundry: `https://<res>.services.ai.azure.com/anthropic`."
    },
    {
      "id": "groq",
      "label": "Groq",
      "envKeys": [
        "GROQ_API_KEY"
      ],
      "baseUrlEnv": "GROQ_BASE_URL",
      "authType": "api_key",
      "probeKind": "openaiModels",
      "defaultBaseUrl": "https://api.groq.com/openai/v1",
      "notes": "OpenAI-compatible."
    },
    {
      "id": "mistral",
      "label": "Mistral AI",
      "envKeys": [
        "MISTRAL_API_KEY"
      ],
      "baseUrlEnv": "MISTRAL_BASE_URL",
      "authType": "api_key",
      "probeKind": "openaiModels",
      "defaultBaseUrl": "https://api.mistral.ai/v1",
      "notes": "OpenAI-compatible."
    },
    {
      "id": "cohere",
      "label": "Cohere",
      "envKeys": [
        "COHERE_API_KEY"
      ],
      "baseUrlEnv": "CO_BASE_URL",
      "authType": "api_key",
      "probeKind": "openaiModels",
      "defaultBaseUrl": "https://api.cohere.com/v1",
      "notes": "OpenAI-compatible v2."
    },
    {
      "id": "together",
      "label": "Together AI",
      "aliases": [
        "together-ai"
      ],
      "envKeys": [
        "TOGETHER_API_KEY"
      ],
      "baseUrlEnv": "TOGETHER_BASE_URL",
      "authType": "api_key",
      "probeKind": "openaiModels",
      "defaultBaseUrl": "https://api.together.xyz/v1",
      "notes": "100+ open models, OpenAI-compatible."
    },
    {
      "id": "fireworks",
      "label": "Fireworks AI",
      "envKeys": [
        "FIREWORKS_API_KEY"
      ],
      "authType": "api_key",
      "probeKind": "openaiModels",
      "defaultBaseUrl": "https://api.fireworks.ai/inference/v1",
      "notes": "OpenAI-compatible."
    },
    {
      "id": "deepseek",
      "label": "DeepSeek",
      "envKeys": [
        "DEEPSEEK_API_KEY"
      ],
      "authType": "api_key",
      "probeKind": "openaiModels",
      "defaultBaseUrl": "https://api.deepseek.com/v1",
      "notes": "OpenAI-compatible."
    },
    {
      "id": "xai",
      "label": "xAI (Grok)",
      "envKeys": [
        "XAI_API_KEY"
      ],
      "authType": "api_key",
      "probeKind": "openaiModels",
      "defaultBaseUrl": "https://api.x.ai/v1",
      "notes": "OpenAI-compatible."
    },
    {
      "id": "openrouter",
      "label": "OpenRouter",
      "envKeys": [
        "OPENROUTER_API_KEY"
      ],
      "authType": "api_key",
      "probeKind": "openaiModels",
      "defaultBaseUrl": "https://openrouter.ai/api/v1",
      "notes": "100+ models through one OpenAI-compatible endpoint."
    },
    {
      "id": "cerebras",
      "label": "Cerebras",
      "envKeys": [
        "CEREBRAS_API_KEY"
      ],
      "authType": "api_key",
      "probeKind": "openaiModels",
      "defaultBaseUrl": "https://api.cerebras.ai/v1",
      "notes": "OpenAI-compatible."
    },
    {
      "id": "sambanova",
      "label": "SambaNova",
      "envKeys": [
        "SAMBANOVA_API_KEY"
      ],
      "authType": "api_key",
      "probeKind": "openaiModels",
      "defaultBaseUrl": "https://api.sambanova.ai/v1",
      "notes": "OpenAI-compatible."
    },
    {
      "id": "custom-openai",
      "label": "Custom OpenAI-compatible",
      "envKeys": [
        "CUSTOM_API_KEY"
      ],
      "authType": "api_key",
      "probeKind": "openaiModels",
      "defaultBaseUrl": "",
      "notes": "Bring-your-own endpoint. Set base URL in Gateway."
    }
  ] as const
