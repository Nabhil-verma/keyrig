import { KeyrigError, createDocument, createId, isVersionedDocument, type StorageLike } from "@keyrig/shared";
import { BUILTIN_TOOLS, findBuiltinTool } from "./toolCatalog";
import {
  buildTool,
  needsToolConsent,
  normalizePermissions,
  toolFingerprint,
  type NewToolInput,
  type Tool,
} from "./toolDefinition";

/**
 * Phase 2, item 1: the local tool registry.
 *
 * The registry keeps user tools and the user copy of a built-in tool. A
 * built-in tool is a frozen constant in `toolCatalog.ts`; the registry never
 * changes it. An edit makes a copy, and a reset drops the copy, so the
 * original always returns.
 *
 * The warning is part of the registry, not only of the screen. Every call that
 * creates, imports, enables or edits a tool needs `acknowledged: true`. A test
 * cannot skip the warning by calling the registry (AS-01).
 *
 * The record stays in this browser. It holds no key (PR-01).
 */

export const TOOLS_STORAGE_KEY = "keyrig.tools.v1";
export const TOOLS_SCHEMA_VERSION = 1;
export const MAX_USER_TOOLS = 40;

export interface ToolConsent {
  /** The person confirmed the warning card. There is no other value. */
  acknowledged: true;
}

export interface ToolRecord {
  tool: Tool;
  /** The built-in id when this record is a user copy. */
  originId: string | null;
  enabled: boolean;
  /** The fingerprint that the person approved for a run. */
  approvedFingerprint: string | null;
  acknowledgedAt: string | null;
}

export interface ToolEntry {
  tool: Tool;
  /** The built-in original for a copy, so the screen can show a reset. */
  original: Tool | null;
  isEdited: boolean;
  enabled: boolean;
  /** True when the app must show the warning before the next run. */
  needsApproval: boolean;
}

export interface ToolStoreOptions {
  storage: StorageLike;
  now?: () => number;
}

const COPY_PREFIX = "copy:";

function warningRequired(action: string): KeyrigError {
  return KeyrigError.fromCategory("invalid_request", {
    code: "tool_warning_required",
    message: `Read the tool warning before you ${action} a tool.`,
    retryable: false,
    action: "check_settings",
  });
}

function refused(message: string): KeyrigError {
  return KeyrigError.fromCategory("invalid_request", {
    code: "tool_refused",
    message,
    retryable: false,
    action: "check_settings",
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readTool(value: unknown): Tool | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.description !== "string" ||
    typeof value.script !== "string" ||
    typeof value.version !== "number" ||
    !isRecord(value.inputSchema)
  ) {
    return null;
  }
  if (value.source !== "built-in" && value.source !== "user" && value.source !== "marketplace") {
    return null;
  }
  return {
    id: value.id,
    name: value.name,
    description: value.description,
    inputSchema: value.inputSchema as unknown as Tool["inputSchema"],
    permissions: normalizePermissions(value.permissions),
    source: value.source,
    version: value.version,
    script: value.script,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date(0).toISOString(),
  };
}

function readRecord(value: unknown): ToolRecord | null {
  if (!isRecord(value)) {
    return null;
  }
  const tool = readTool(value.tool);
  if (tool === null) {
    return null;
  }
  return {
    tool,
    originId: typeof value.originId === "string" ? value.originId : null,
    enabled: value.enabled === true,
    approvedFingerprint: typeof value.approvedFingerprint === "string" ? value.approvedFingerprint : null,
    acknowledgedAt: typeof value.acknowledgedAt === "string" ? value.acknowledgedAt : null,
  };
}

export class ToolRegistry {
  readonly #storage: StorageLike;
  readonly #now: () => number;

  constructor(options: ToolStoreOptions) {
    this.#storage = options.storage;
    this.#now = options.now ?? (() => Date.now());
  }

  #read(): ToolRecord[] {
    let raw: string | null;
    try {
      raw = this.#storage.getItem(TOOLS_STORAGE_KEY);
    } catch {
      return [];
    }
    if (!raw) {
      return [];
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isVersionedDocument(parsed) || parsed.schemaVersion !== TOOLS_SCHEMA_VERSION) {
        return [];
      }
      if (!Array.isArray(parsed.data)) {
        return [];
      }
      return (parsed.data as unknown[])
        .map(readRecord)
        .filter((record): record is ToolRecord => record !== null);
    } catch {
      return [];
    }
  }

  #write(records: ToolRecord[]): void {
    try {
      this.#storage.setItem(
        TOOLS_STORAGE_KEY,
        JSON.stringify(createDocument(TOOLS_SCHEMA_VERSION, records)),
      );
    } catch {
      throw refused("keyrig cannot save the tool. The browser storage is full or blocked.");
    }
  }

  #find(records: readonly ToolRecord[], id: string): ToolRecord | undefined {
    return records.find((record) => record.tool.id === id || record.originId === id);
  }

  /** Every tool with the copy of a built-in tool in front of the original. */
  list(): ToolEntry[] {
    const records = this.#read();
    const entries: ToolEntry[] = [];

    for (const original of BUILTIN_TOOLS) {
      const record = records.find((item) => item.originId === original.id);
      const tool = record?.tool ?? original;
      entries.push({
        tool,
        original,
        isEdited: record !== undefined,
        enabled: record?.enabled ?? false,
        needsApproval: record === undefined || needsToolConsent(tool, record.approvedFingerprint),
      });
    }

    for (const record of records) {
      if (record.originId !== null) {
        continue;
      }
      entries.push({
        tool: record.tool,
        original: null,
        isEdited: false,
        enabled: record.enabled,
        needsApproval: needsToolConsent(record.tool, record.approvedFingerprint),
      });
    }

    return entries;
  }

  get(id: string): ToolEntry | undefined {
    return this.list().find((entry) => entry.tool.id === id || entry.original?.id === id);
  }

  /** AS-01: create a user tool. The warning is a required argument. */
  create(input: NewToolInput, consent: ToolConsent): Tool {
    if (consent?.acknowledged !== true) {
      throw warningRequired("create");
    }
    const records = this.#read();
    const userTools = records.filter((record) => record.originId === null);
    if (userTools.length >= MAX_USER_TOOLS) {
      throw refused(`keyrig holds ${MAX_USER_TOOLS} tools. Remove one first.`);
    }
    const tool = buildTool({ ...input, source: "user" }, this.#now(), createId("tool_"));
    records.push({
      tool,
      originId: null,
      enabled: false,
      approvedFingerprint: null,
      acknowledgedAt: new Date(this.#now()).toISOString(),
    });
    this.#write(records);
    return tool;
  }

  /**
   * AS-01: import a tool from text. The item is checked, scanned for a key and
   * saved disabled. keyrig never runs an imported tool on its own.
   */
  importTool(raw: unknown, consent: ToolConsent): Tool {
    if (consent?.acknowledged !== true) {
      throw warningRequired("import");
    }
    let value: unknown = raw;
    if (typeof raw === "string") {
      try {
        value = JSON.parse(raw);
      } catch {
        throw refused("The tool text is not JSON.");
      }
    }
    if (!isRecord(value)) {
      throw refused("The tool must be one JSON object.");
    }
    const tool = buildTool(
      {
        name: value.name as string,
        description: value.description as string,
        inputSchema: value.inputSchema,
        permissions: value.permissions,
        script: value.script as string,
        source: "marketplace",
      },
      this.#now(),
      createId("market_"),
    );
    const records = this.#read();
    if (records.filter((record) => record.originId === null).length >= MAX_USER_TOOLS) {
      throw refused(`keyrig holds ${MAX_USER_TOOLS} tools. Remove one first.`);
    }
    records.push({
      tool,
      originId: null,
      enabled: false,
      approvedFingerprint: null,
      acknowledgedAt: new Date(this.#now()).toISOString(),
    });
    this.#write(records);
    return tool;
  }

  /**
   * AS-01: edit a tool. A built-in edit makes a copy and never changes the
   * original. A permission change clears the run approval, so the next run
   * asks again.
   */
  edit(id: string, patch: Partial<NewToolInput>, consent: ToolConsent): Tool {
    if (consent?.acknowledged !== true) {
      throw warningRequired("change");
    }
    const records = this.#read();
    const entry = this.get(id);
    if (entry === undefined) {
      throw refused("keyrig cannot find this tool.");
    }
    const original = entry.original;
    const base = entry.tool;
    const nextId = original === null ? base.id : `${COPY_PREFIX}${original.id}`;
    const tool = buildTool(
      {
        name: patch.name ?? base.name,
        description: patch.description ?? base.description,
        inputSchema: patch.inputSchema ?? base.inputSchema,
        permissions: patch.permissions ?? base.permissions,
        script: patch.script ?? base.script,
        source: original === null ? base.source : "user",
      },
      this.#now(),
      nextId,
    );
    tool.version = base.version + 1;
    const permissionsChanged =
      tool.permissions.join(",") !== base.permissions.join(",") || tool.script !== base.script;
    const existing = records.find((record) => record.tool.id === nextId);
    const next: ToolRecord = {
      tool,
      originId: original?.id ?? existing?.originId ?? null,
      enabled: existing?.enabled ?? false,
      approvedFingerprint: permissionsChanged ? null : (existing?.approvedFingerprint ?? null),
      acknowledgedAt: new Date(this.#now()).toISOString(),
    };
    this.#write(
      existing === undefined
        ? [...records, next]
        : records.map((record) => (record.tool.id === nextId ? next : record)),
    );
    return tool;
  }

  /** Reset a copy to the built-in original. The original never changed. */
  reset(id: string): void {
    const entry = this.get(id);
    if (entry === undefined) {
      throw refused("keyrig cannot find this tool.");
    }
    const origin = entry.original?.id ?? entry.tool.id;
    const next = this.#read().filter((record) => record.originId !== origin && record.tool.id !== origin);
    this.#write(next);
  }

  /** AS-01: enable a tool. The warning is part of the call. */
  enable(id: string, consent: ToolConsent): void {
    if (consent?.acknowledged !== true) {
      throw warningRequired("enable");
    }
    const records = this.#read();
    const entry = this.get(id);
    if (entry === undefined) {
      throw refused("keyrig cannot find this tool.");
    }
    const stored = this.#find(records, id);
    if (stored === undefined) {
      if (entry.original === null) {
        throw refused("keyrig cannot find this tool.");
      }
      // The first enable of a clean built-in makes its record.
      records.push({
        tool: entry.original,
        originId: entry.original.id,
        enabled: true,
        approvedFingerprint: null,
        acknowledgedAt: new Date(this.#now()).toISOString(),
      });
    } else {
      stored.enabled = true;
      stored.acknowledgedAt = new Date(this.#now()).toISOString();
    }
    this.#write(records);
  }

  disable(id: string): void {
    const records = this.#read();
    const stored = this.#find(records, id);
    if (stored === undefined) {
      return;
    }
    stored.enabled = false;
    this.#write(records);
  }

  /** AS-01: the person allowed this exact tool code. */
  approve(id: string): void {
    const records = this.#read();
    const entry = this.get(id);
    const stored = this.#find(records, id);
    if (entry === undefined || stored === undefined) {
      throw refused("keyrig cannot find this tool.");
    }
    stored.approvedFingerprint = toolFingerprint(stored.tool);
    stored.acknowledgedAt = new Date(this.#now()).toISOString();
    this.#write(records);
  }

  /** A removed user tool leaves the record list. A built-in copy resets. */
  remove(id: string): void {
    const entry = this.get(id);
    if (entry === undefined) {
      return;
    }
    if (entry.original !== null) {
      this.reset(id);
      return;
    }
    this.#write(this.#read().filter((record) => record.tool.id !== id));
  }

  /** AS-01: a tool runs only when it is enabled and a person allowed the code. */
  canRun(id: string): boolean {
    const entry = this.get(id);
    return entry !== undefined && entry.enabled && !entry.needsApproval;
  }

  /** The original built-in list, for the "reset" preview. */
  originals(): readonly Tool[] {
    return BUILTIN_TOOLS;
  }

  original(id: string): Tool | undefined {
    return this.get(id)?.original ?? findBuiltinTool(id);
  }
}
