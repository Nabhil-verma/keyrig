import {
  MAX_FILE_CHARS,
  MAX_WORKSPACE_CHARS,
  MAX_WORKSPACE_FILES,
  normalizeWorkspacePath,
  protectedReason,
} from "@keyrig/core";
import { KeyrigError, createDocument, isVersionedDocument, type StorageLike } from "@keyrig/shared";

/**
 * AS-05: the workspace of the agent.
 *
 * A browser has no file system, so keyrig keeps a named text workspace in the
 * browser storage for one account. The tools in the agent loop read and write
 * this workspace. Every path passes the AS-02 check, and every write passes a
 * size check, so one turn cannot fill the storage.
 */

const WORKSPACE_STORAGE_KEY = "keyrig.workspace.v1";
const WORKSPACE_SCHEMA_VERSION = 1;
const MAX_SEARCH_MATCHES = 40;

export interface WorkspaceFile {
  path: string;
  content: string;
  updatedAt: string;
}

interface SearchMatch {
  path: string;
  line: number;
  text: string;
}

function fail(code: string, message: string): never {
  throw KeyrigError.fromCategory("invalid_request", { code, message, action: "none" });
}

/** AS-02: the path is relative and it is not a secret. */
function checkWorkspacePath(raw: unknown): string {
  const path = normalizeWorkspacePath(raw);
  const reason = protectedReason(path);
  if (reason !== null) {
    fail("path_protected", `${reason} Choose another path.`);
  }
  return path;
}

function readFile(value: unknown): WorkspaceFile | null {
  if (value === null || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.path !== "string" || typeof record.content !== "string") {
    return null;
  }
  return {
    path: record.path,
    content: record.content,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date(0).toISOString(),
  };
}

export class Workspace {
  readonly #storage: StorageLike;
  readonly #now: () => number;

  constructor(options: { storage: StorageLike; now?: () => number }) {
    this.#storage = options.storage;
    this.#now = options.now ?? (() => Date.now());
  }

  files(): WorkspaceFile[] {
    let raw: string | null;
    try {
      raw = this.#storage.getItem(WORKSPACE_STORAGE_KEY);
    } catch {
      return [];
    }
    if (!raw) {
      return [];
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
    if (!isVersionedDocument(parsed) || parsed.schemaVersion !== WORKSPACE_SCHEMA_VERSION) {
      return [];
    }
    if (!Array.isArray(parsed.data)) {
      return [];
    }
    return (parsed.data as unknown[])
      .map(readFile)
      .filter((file): file is WorkspaceFile => file !== null)
      .sort((left, right) => left.path.localeCompare(right.path));
  }

  read(rawPath: unknown): WorkspaceFile | null {
    const path = checkWorkspacePath(rawPath);
    return this.files().find((file) => file.path === path) ?? null;
  }

  write(rawPath: unknown, content: unknown): WorkspaceFile {
    const path = checkWorkspacePath(rawPath);
    if (typeof content !== "string") {
      fail("workspace_invalid", "The text of the file must be text.");
    }
    if ((content as string).length > MAX_FILE_CHARS) {
      fail("workspace_full", `One file can hold ${MAX_FILE_CHARS} characters. Make the file shorter.`);
    }
    const files = this.files();
    const existing = files.find((file) => file.path === path);
    const total = files.reduce((sum, file) => sum + (file.path === path ? 0 : file.content.length), 0);
    if (total + (content as string).length > MAX_WORKSPACE_CHARS) {
      fail("workspace_full", "The workspace is full. Delete a file first.");
    }
    if (existing === undefined && files.length >= MAX_WORKSPACE_FILES) {
      fail("workspace_full", `The workspace holds ${MAX_WORKSPACE_FILES} files. Delete a file first.`);
    }
    const file: WorkspaceFile = {
      path,
      content: content as string,
      updatedAt: new Date(this.#now()).toISOString(),
    };
    const next = existing === undefined ? [...files, file] : files.map((item) => (item.path === path ? file : item));
    this.#persist(next);
    return file;
  }

  remove(rawPath: unknown): boolean {
    const path = checkWorkspacePath(rawPath);
    const files = this.files();
    const next = files.filter((file) => file.path !== path);
    if (next.length === files.length) {
      return false;
    }
    this.#persist(next);
    return true;
  }

  search(query: unknown, folder?: unknown): SearchMatch[] {
    if (typeof query !== "string" || query.trim().length === 0) {
      fail("workspace_invalid", "Type the text to find.");
    }
    const needle = (query as string).trim().toLowerCase();
    const prefix = typeof folder === "string" && folder.trim().length > 0 ? checkWorkspacePath(folder) : null;
    const matches: SearchMatch[] = [];
    for (const file of this.files()) {
      if (prefix !== null && !(file.path === prefix || file.path.startsWith(`${prefix}/`))) {
        continue;
      }
      const lines = file.content.split("\n");
      for (let index = 0; index < lines.length; index += 1) {
        const text = lines[index] ?? "";
        if (text.toLowerCase().includes(needle)) {
          matches.push({ path: file.path, line: index + 1, text: text.trim().slice(0, 200) });
          if (matches.length >= MAX_SEARCH_MATCHES) {
            return matches;
          }
        }
      }
    }
    return matches;
  }

  totals(): { files: number; chars: number } {
    const files = this.files();
    return { files: files.length, chars: files.reduce((sum, file) => sum + file.content.length, 0) };
  }

  #persist(files: WorkspaceFile[]): void {
    try {
      this.#storage.setItem(
        WORKSPACE_STORAGE_KEY,
        JSON.stringify(createDocument(WORKSPACE_SCHEMA_VERSION, files)),
      );
    } catch {
      fail("storage_write_failed", "keyrig cannot save the file. The browser storage is full or blocked.");
    }
  }
}
