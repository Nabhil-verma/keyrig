import { KeyrigError } from "@keyrig/shared";
import { joinUrl, type ProviderManifest, type WireFormat } from "./manifest";
import type { ChatMessage, ImagePart } from "./types";

/**
 * PV-03: the data path has three steps.
 *
 *   request intent -> named rule -> provider wire format
 *
 * A rule turns a neutral intent into one wire plan. The adapters only send a
 * plan and read the stream. A new provider adds a manifest and a rule.
 */

export interface ChatIntent {
  kind: "chat";
  stream: boolean;
  messages: readonly ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  promptCache?: boolean;
}

export interface PlanContext {
  manifest: ProviderManifest;
  baseUrl: string;
  apiKey?: string;
  model: string;
  intent: ChatIntent;
}

export interface WirePlan {
  ruleId: string;
  wireFormat: WireFormat;
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export interface RequestRule {
  id: string;
  wireFormat: WireFormat;
  build(context: PlanContext): WirePlan;
}

const DEFAULT_MAX_TOKENS = 4096;

function isImage(part: unknown): part is ImagePart {
  return part !== null && typeof part === "object" && (part as { type?: unknown }).type === "image";
}

function openAiContent(message: ChatMessage): unknown {
  if (typeof message.content === "string") {
    return message.content;
  }
  return message.content.map((part) =>
    isImage(part)
      ? { type: "image_url", image_url: { url: `data:${part.mediaType};base64,${part.data}` } }
      : { type: "text", text: part.text },
  );
}

function anthropicContent(message: ChatMessage): unknown {
  if (typeof message.content === "string") {
    return message.content;
  }
  return message.content.map((part) =>
    isImage(part)
      ? { type: "image", source: { type: "base64", media_type: part.mediaType, data: part.data } }
      : { type: "text", text: part.text },
  );
}

function textOnly(messages: readonly ChatMessage[]): string {
  return messages
    .map((message) => (typeof message.content === "string" ? message.content : message.content.map((p) => ("text" in p ? p.text : "")).join("\n")))
    .join("\n");
}

export const openAiChatRule: RequestRule = {
  id: "openai-chat",
  wireFormat: "openai-chat",
  build(context) {
    const field = context.manifest.maxTokensField;
    return {
      ruleId: "openai-chat",
      wireFormat: "openai-chat",
      url: joinUrl(context.baseUrl, "chat/completions"),
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
        ...(context.apiKey ? { authorization: `Bearer ${context.apiKey}` } : {}),
      },
      body: {
        model: context.model,
        messages: context.intent.messages.map((message) => ({
          role: message.role,
          content: openAiContent(message),
        })),
        stream: context.intent.stream,
        ...(context.intent.stream ? { stream_options: { include_usage: true } } : {}),
        ...(context.intent.maxTokens !== undefined ? { [field]: context.intent.maxTokens } : {}),
        ...(context.intent.temperature !== undefined ? { temperature: context.intent.temperature } : {}),
      },
    };
  },
};

export const anthropicMessagesRule: RequestRule = {
  id: "anthropic-messages",
  wireFormat: "anthropic-messages",
  build(context) {
    const system = context.intent.messages
      .filter((message) => message.role === "system")
      .map((message) => (typeof message.content === "string" ? message.content : textOnly([message])))
      .join("\n\n");
    const systemField =
      system.length === 0
        ? undefined
        : context.intent.promptCache === true
          ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }]
          : system;
    return {
      ruleId: "anthropic-messages",
      wireFormat: "anthropic-messages",
      url: joinUrl(context.baseUrl, "messages"),
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
        "anthropic-version": "2023-06-01",
        // Anthropic needs this header for a direct browser call. The key stays in the browser.
        "anthropic-dangerous-direct-browser-access": "true",
        ...(context.apiKey ? { "x-api-key": context.apiKey } : {}),
      },
      body: {
        model: context.model,
        max_tokens: context.intent.maxTokens ?? DEFAULT_MAX_TOKENS,
        stream: context.intent.stream,
        ...(systemField !== undefined ? { system: systemField } : {}),
        ...(context.intent.temperature !== undefined ? { temperature: context.intent.temperature } : {}),
        messages: context.intent.messages
          .filter((message) => message.role !== "system")
          .map((message) => ({ role: message.role, content: anthropicContent(message) })),
      },
    };
  },
};

export const ollamaChatRule: RequestRule = {
  id: "ollama-chat",
  wireFormat: "ollama-chat",
  build(context) {
    const options = {
      ...(context.intent.maxTokens !== undefined ? { num_predict: context.intent.maxTokens } : {}),
      ...(context.intent.temperature !== undefined ? { temperature: context.intent.temperature } : {}),
    };
    return {
      ruleId: "ollama-chat",
      wireFormat: "ollama-chat",
      url: joinUrl(context.baseUrl, "api/chat"),
      headers: {
        "content-type": "application/json",
        accept: "application/x-ndjson",
        ...(context.apiKey ? { authorization: `Bearer ${context.apiKey}` } : {}),
      },
      body: {
        model: context.model,
        stream: context.intent.stream,
        messages: context.intent.messages.map((message) => ({
          role: message.role,
          content: typeof message.content === "string" ? message.content : textOnly([message]),
          ...(Array.isArray(message.content)
            ? {
                images: message.content.filter(isImage).map((part) => part.data),
              }
            : {}),
        })),
        ...(Object.keys(options).length > 0 ? { options } : {}),
      },
    };
  },
};

export const BUILTIN_RULES: readonly RequestRule[] = [openAiChatRule, anthropicMessagesRule, ollamaChatRule];

// Register a rule in one place. Do not branch on a provider id in the core.
export function ruleFor(
  wireFormat: WireFormat,
  rules: readonly RequestRule[] = BUILTIN_RULES,
): RequestRule {
  const rule = rules.find((candidate) => candidate.wireFormat === wireFormat);
  if (!rule) {
    throw KeyrigError.fromCategory("invalid_request", {
      code: "no_rule_for_wire_format",
      message: "keyrig has no request rule for this provider.",
      details: { wireFormat },
    });
  }
  return rule;
}

export function planRequest(
  context: PlanContext,
  rules: readonly RequestRule[] = BUILTIN_RULES,
): WirePlan {
  return ruleFor(context.manifest.wireFormat, rules).build(context);
}
