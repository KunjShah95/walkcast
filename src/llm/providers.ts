/**
 * Model providers the lab can route to. Claude uses the native Anthropic SDK; every other
 * provider (including the Vercel AI Gateway and OpenRouter, which themselves front many
 * vendors) is reached through its OpenAI-compatible Chat Completions endpoint.
 *
 * Select a model as "provider:model", e.g. "groq:openai/gpt-oss-120b" or
 * "openrouter:anthropic/claude-opus-5-5". Model IDs are passed through verbatim; check each
 * provider's model list, they change often.
 */
export interface ProviderInfo {
  id: string;
  label: string;
  kind: "anthropic" | "openai-compatible";
  /** OpenAI-compatible base URL (unused for anthropic). Override with LAB_<ID>_BASE_URL. */
  baseURL?: string;
  /** Environment variables checked, in order, for the API key. */
  apiKeyEnv: string[];
  /** Local servers (Ollama) need no key. */
  keyOptional?: boolean;
  /**
   * How to request JSON that matches a schema. "json_schema": native structured outputs, with
   * automatic fallback to "json_object" if the model rejects it. "json_object": JSON mode plus
   * the schema in the prompt.
   */
  structuredOutput: "json_schema" | "json_object";
  /** Send `strict: true` on function tools (only where the provider is known to accept it). */
  strictTools: boolean;
  /** Example model id for docs and error messages, not a default. */
  exampleModel: string;
  docs: string;
}

export const PROVIDERS: Record<string, ProviderInfo> = {
  anthropic: {
    id: "anthropic",
    label: "Anthropic Claude (native SDK)",
    kind: "anthropic",
    apiKeyEnv: ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"],
    structuredOutput: "json_schema",
    strictTools: true,
    exampleModel: "claude-opus-5-5",
    docs: "https://platform.claude.com/docs",
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    kind: "openai-compatible",
    baseURL: "https://api.openai.com/v1",
    apiKeyEnv: ["OPENAI_API_KEY"],
    structuredOutput: "json_schema",
    strictTools: true,
    exampleModel: "gpt-5",
    docs: "https://platform.openai.com/docs/models",
  },
  vercel: {
    id: "vercel",
    label: "Vercel AI Gateway",
    kind: "openai-compatible",
    baseURL: "https://ai-gateway.vercel.sh/v1",
    apiKeyEnv: ["AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN"],
    structuredOutput: "json_schema",
    strictTools: false,
    exampleModel: "anthropic/claude-opus-5-5",
    docs: "https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions",
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openai-compatible",
    baseURL: "https://openrouter.ai/api/v1",
    apiKeyEnv: ["OPENROUTER_API_KEY"],
    structuredOutput: "json_schema",
    strictTools: false,
    exampleModel: "anthropic/claude-opus-5-5",
    docs: "https://openrouter.ai/models",
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini (OpenAI compatibility)",
    kind: "openai-compatible",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    apiKeyEnv: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    structuredOutput: "json_schema",
    strictTools: false,
    exampleModel: "gemini-2.5-flash",
    docs: "https://ai.google.dev/gemini-api/docs/openai",
  },
  groq: {
    id: "groq",
    label: "Groq",
    kind: "openai-compatible",
    baseURL: "https://api.groq.com/openai/v1",
    apiKeyEnv: ["GROQ_API_KEY"],
    structuredOutput: "json_schema",
    strictTools: false,
    exampleModel: "openai/gpt-oss-120b",
    docs: "https://console.groq.com/docs/models",
  },
  mistral: {
    id: "mistral",
    label: "Mistral",
    kind: "openai-compatible",
    baseURL: "https://api.mistral.ai/v1",
    apiKeyEnv: ["MISTRAL_API_KEY"],
    structuredOutput: "json_schema",
    strictTools: false,
    exampleModel: "mistral-large-latest",
    docs: "https://docs.mistral.ai/getting-started/models/",
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    kind: "openai-compatible",
    baseURL: "https://api.deepseek.com",
    apiKeyEnv: ["DEEPSEEK_API_KEY"],
    structuredOutput: "json_object",
    strictTools: false,
    exampleModel: "deepseek-chat",
    docs: "https://api-docs.deepseek.com/",
  },
  huggingface: {
    id: "huggingface",
    label: "Hugging Face Inference Providers (router)",
    kind: "openai-compatible",
    baseURL: "https://router.huggingface.co/v1",
    apiKeyEnv: ["HF_TOKEN", "HUGGINGFACE_HUB_TOKEN"],
    structuredOutput: "json_schema",
    strictTools: false,
    exampleModel: "Qwen/Qwen3-Coder-480B-A35B-Instruct:fastest",
    docs: "https://huggingface.co/docs/inference-providers",
  },
  xai: {
    id: "xai",
    label: "xAI",
    kind: "openai-compatible",
    baseURL: "https://api.x.ai/v1",
    apiKeyEnv: ["XAI_API_KEY"],
    structuredOutput: "json_schema",
    strictTools: false,
    exampleModel: "grok-4",
    docs: "https://docs.x.ai/docs/models",
  },
  together: {
    id: "together",
    label: "Together AI",
    kind: "openai-compatible",
    baseURL: "https://api.together.xyz/v1",
    apiKeyEnv: ["TOGETHER_API_KEY"],
    structuredOutput: "json_schema",
    strictTools: false,
    exampleModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    docs: "https://docs.together.ai/docs/serverless-models",
  },
  fireworks: {
    id: "fireworks",
    label: "Fireworks AI",
    kind: "openai-compatible",
    baseURL: "https://api.fireworks.ai/inference/v1",
    apiKeyEnv: ["FIREWORKS_API_KEY"],
    structuredOutput: "json_schema",
    strictTools: false,
    exampleModel: "accounts/fireworks/models/llama-v3p3-70b-instruct",
    docs: "https://docs.fireworks.ai/getting-started/introduction",
  },
  cerebras: {
    id: "cerebras",
    label: "Cerebras",
    kind: "openai-compatible",
    baseURL: "https://api.cerebras.ai/v1",
    apiKeyEnv: ["CEREBRAS_API_KEY"],
    structuredOutput: "json_schema",
    strictTools: false,
    exampleModel: "llama-3.3-70b",
    docs: "https://inference-docs.cerebras.ai/models/overview",
  },
  ollama: {
    id: "ollama",
    label: "Ollama (local)",
    kind: "openai-compatible",
    baseURL: "http://localhost:11434/v1",
    apiKeyEnv: ["OLLAMA_API_KEY"],
    keyOptional: true,
    structuredOutput: "json_schema",
    strictTools: false,
    exampleModel: "qwen3:32b",
    docs: "https://github.com/ollama/ollama/blob/main/docs/openai.md",
  },
  custom: {
    id: "custom",
    label: "Any OpenAI-compatible endpoint (LiteLLM, vLLM, Azure OpenAI v1, ...)",
    kind: "openai-compatible",
    apiKeyEnv: ["LAB_CUSTOM_API_KEY"],
    keyOptional: true,
    structuredOutput: "json_schema",
    strictTools: false,
    exampleModel: "<your-model>",
    docs: "Set LAB_CUSTOM_BASE_URL (and LAB_CUSTOM_API_KEY if required).",
  },
};

/** Short names people type. */
const ALIASES: Record<string, string> = { claude: "anthropic", google: "gemini", hf: "huggingface", "ai-gateway": "vercel", grok: "xai", litellm: "custom" };

export function provider(id: string): ProviderInfo {
  const info = PROVIDERS[ALIASES[id] ?? id];
  if (!info) throw new Error(`Unknown provider '${id}'. Known: ${Object.keys(PROVIDERS).join(", ")}`);
  return info;
}

export function apiKey(info: ProviderInfo): string | undefined {
  for (const name of info.apiKeyEnv) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}

export function baseURL(info: ProviderInfo): string | undefined {
  return process.env[`LAB_${info.id.toUpperCase()}_BASE_URL`] ?? info.baseURL;
}

/** Providers with credentials present in this environment. */
export function configuredProviders(): ProviderInfo[] {
  return Object.values(PROVIDERS).filter((p) => apiKey(p) !== undefined);
}
