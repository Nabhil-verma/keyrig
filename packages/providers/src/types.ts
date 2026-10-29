/**
 * Neutral types for the provider layer (PV-07).
 *
 * The UI and the core use these types. They never see a provider wire type.
 */

export interface TextPart {
  type: "text";
  text: string;
}

export interface ImagePart {
  type: "image";
  mediaType: string;
  /** Base64 data, without a data URL prefix. */
  data: string;
}

export type ContentPart = TextPart | ImagePart;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

export interface ChatRequest {
  model: string;
  messages: readonly ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Ask the provider to send prompt-cache usage, when the provider supports it. */
  promptCache?: boolean;
}

/**
 * inputTokens is the uncached prompt part. cachedTokens is the cached prompt part.
 * This shape is the same for every provider. The adapters normalize the counts.
 */
export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  reasoningTokens?: number;
}

export type StopReason = "complete" | "aborted" | "partial" | "length" | "filtered";

export interface ChatResult {
  text: string;
  reasoning: string;
  usage: Usage;
  finishReason: string | null;
  /** True when the model did not send a normal end event. */
  partial: boolean;
  aborted: boolean;
  stopReason: StopReason;
  model: string;
  providerId: string;
  requestId?: string;
  /** KS-07 and CO-05: safe notes for the user. Example: a local base URL warning. */
  warnings?: string[];
}

export interface StreamHandlers {
  onDelta?: (text: string) => void;
  onReasoningDelta?: (text: string) => void;
  onUsage?: (usage: Usage) => void;
}

export interface ProviderCallConfig {
  /** The key for one request. The adapter does not store the key. */
  apiKey?: string;
  /** A custom base URL. The caller must check the URL first (KS-07). */
  baseUrl?: string;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ChatClock {
  now: () => number;
}
