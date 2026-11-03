/**
 * CX-04: the `@` and `/` shortcuts of the composer.
 *
 * `/` opens a saved skill. `@` opens a workspace file. A file that the user
 * picks becomes a context block on the next send, so the model reads the real
 * text and the box keeps the short form.
 */

const MAX_CONTEXT_CHARS = 20_000;

interface ComposerToken {
  /** `/` for a skill, `@` for a file. */
  kind: "skill" | "file";
  /** The text after the marker. */
  query: string;
  /** The index of the marker in the text. */
  start: number;
  /** The end of the token: the cursor. */
  end: number;
}

const TOKEN = /(^|\s)([/@])([A-Za-z0-9._/-]*)$/;

export function findToken(text: string, cursor: number): ComposerToken | null {
  const end = Math.max(0, Math.min(cursor, text.length));
  const match = TOKEN.exec(text.slice(0, end));
  if (match === null) {
    return null;
  }
  const query = match[3] ?? "";
  const kind = match[2] === "/" ? "skill" : "file";
  return { kind, query, start: end - query.length - 1, end };
}

/** Replace the token with the chosen text and keep the cursor at the end. */
export function applyToken(text: string, token: ComposerToken, insert: string): string {
  const head = text.slice(0, token.start);
  const tail = text.slice(token.end);
  return `${head}${insert} ${tail.replace(/^\s+/, "")}`.replace(/\s+$/, " ");
}

/**
 * Add the text of each `@path` file to the prompt. A path that the workspace
 * does not have stays text. The whole block is bounded.
 */
export function expandContext(
  text: string,
  files: ReadonlyArray<{ path: string; content: string }>,
  limit: number = MAX_CONTEXT_CHARS,
): string {
  const byPath = new Map(files.map((file) => [file.path, file.content]));
  const used: string[] = [];
  for (const match of text.matchAll(/(^|\s)@([A-Za-z0-9._/-]+)/g)) {
    const path = match[2] ?? "";
    if (byPath.has(path) && !used.includes(path)) {
      used.push(path);
    }
  }
  if (used.length === 0 || limit <= 0) {
    return text;
  }
  const blocks: string[] = [];
  let total = 0;
  for (const path of used) {
    const content = byPath.get(path) ?? "";
    const room = limit - total;
    if (room <= 0) {
      break;
    }
    const part = content.slice(0, room);
    total += part.length;
    blocks.push(`<file path="${path}">\n${part}\n</file>`);
  }
  return blocks.length === 0 ? text : `${text}\n\n${blocks.join("\n\n")}`;
}
