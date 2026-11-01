import { KeyrigError } from "@keyrig/shared";
import { MAX_COMMIT_CHARS, MAX_COMMIT_FILES, normalizeWorkspacePath, protectedReason } from "./tools";
import { GITHUB_API_URL } from "../identity/identity";

/**
 * The GitHub commit path (AS-01, AS-02).
 *
 * keyrig writes a commit from the browser with the token of the user. It
 * writes only the files that the user approved. It cannot delete a file, and
 * it cannot move a branch pointer in a way that drops a commit: the new commit
 * always has the current head as its parent.
 */

export interface GithubRepoRef {
  owner: string;
  repo: string;
  branch: string;
}

export interface CommitFileInput {
  path: string;
  content: string;
}

export interface CommitOptions {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  message: string;
  files: readonly CommitFileInput[];
  fetchImpl?: typeof fetch;
}

export interface CommitOutcome {
  commitSha: string;
  url: string;
  branch: string;
  files: string[];
}

const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
const BRANCH_PATTERN = /^[A-Za-z0-9._/-]{1,200}$/;

function invalid(message: string, code = "github_input_invalid"): never {
  throw KeyrigError.fromCategory("invalid_request", { code, message, action: "check_settings" });
}

/** Read "owner/repo" from one text field. */
export function parseRepo(raw: unknown): { owner: string; repo: string } {
  if (typeof raw !== "string") {
    invalid("Type the repository as owner/repo.");
  }
  const value = (raw as string).trim();
  const parts = value.split("/");
  if (parts.length !== 2) {
    invalid("Type the repository as owner/repo. One slash separates the two names.");
  }
  const owner = parts[0] ?? "";
  const repo = parts[1] ?? "";
  if (!OWNER_PATTERN.test(owner) || !REPO_PATTERN.test(repo)) {
    invalid("The repository name is not valid. Use the name from the GitHub address.");
  }
  return { owner, repo };
}

/** A branch name that cannot escape the refs folder. */
export function parseBranch(raw: unknown): string {
  if (typeof raw !== "string") {
    invalid("Type a branch name.");
  }
  const value = (raw as string).trim();
  if (value.length === 0 || value.length > 200 || !BRANCH_PATTERN.test(value)) {
    invalid("The branch name is not valid.");
  }
  if (value.includes("..") || value.includes("@{") || value.includes("\\")) {
    invalid("The branch name is not valid.");
  }
  const parts = value.split("/");
  if (parts.some((part) => part.length === 0 || part === "." || part === ".." || part.endsWith(".lock"))) {
    invalid("The branch name is not valid.");
  }
  return value;
}

/**
 * AS-02: no protected path, no duplicate, no oversized file. A path that fails
 * the check stops the whole commit, so the user never gets half a commit.
 */
export function normalizeCommitFiles(files: readonly CommitFileInput[]): CommitFileInput[] {
  if (!Array.isArray(files) || files.length === 0) {
    invalid("Choose at least one file to commit.");
  }
  if (files.length > MAX_COMMIT_FILES) {
    invalid(`A commit can hold ${MAX_COMMIT_FILES} files. Make one commit for each group.`);
  }
  const seen = new Set<string>();
  let total = 0;
  return files.map((file) => {
    const path = normalizeWorkspacePath(file.path);
    const reason = protectedReason(path);
    if (reason !== null) {
      invalid(`${reason} keyrig will not commit ${path}.`);
    }
    if (seen.has(path)) {
      invalid(`The commit has ${path} two times.`);
    }
    seen.add(path);
    if (typeof file.content !== "string") {
      invalid(`keyrig cannot read the text of ${path}.`);
    }
    total += (file.content as string).length;
    if (total > MAX_COMMIT_CHARS) {
      invalid("The commit is too large. Commit fewer or smaller files.");
    }
    return { path, content: file.content as string };
  });
}

function failure(status: number): KeyrigError {
  if (status === 401) {
    return KeyrigError.fromCategory("auth", {
      code: "github_token_invalid",
      message: "GitHub rejected the connected account. Connect GitHub again.",
      action: "check_settings",
    });
  }
  if (status === 403) {
    return KeyrigError.fromCategory("auth", {
      code: "github_forbidden",
      message: "GitHub refused the write. The connected account may not write to this repository.",
      action: "check_settings",
    });
  }
  if (status === 404) {
    return KeyrigError.fromCategory("invalid_request", {
      code: "github_not_found",
      message: "GitHub cannot find the repository or the branch. Check both names.",
      action: "check_settings",
    });
  }
  if (status === 409 || status === 422) {
    return KeyrigError.fromCategory("invalid_request", {
      code: "github_refused",
      message: "GitHub refused the commit. The branch may have changed. Try again.",
      action: "retry",
    });
  }
  return KeyrigError.fromCategory("server", {
    code: "github_failed",
    message: "GitHub failed. Try again in a moment.",
  });
}

interface CallOptions {
  url: string;
  headers: Record<string, string>;
  fetchImpl: typeof fetch;
  method?: string;
  body?: unknown;
}

async function call<T>(options: CallOptions): Promise<T> {
  let response: Response;
  try {
    response = await options.fetchImpl(options.url, {
      method: options.method ?? "GET",
      headers: options.headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch {
    throw KeyrigError.fromCategory("network", {
      code: "github_unreachable",
      message: "keyrig cannot reach GitHub. Check the network and try again.",
      action: "check_network",
    });
  }
  if (!response.ok) {
    throw failure(response.status);
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw KeyrigError.fromCategory("server", {
      code: "github_bad_answer",
      message: "GitHub sent an answer that keyrig cannot read. Try again.",
      action: "retry",
    });
  }
}

export async function commitFiles(options: CommitOptions): Promise<CommitOutcome> {
  const token = typeof options.token === "string" ? options.token.trim() : "";
  if (token.length < 8) {
    throw KeyrigError.fromCategory("auth", {
      code: "github_not_connected",
      message: "Connect GitHub first.",
      action: "check_settings",
    });
  }
  const repo = parseRepo(`${options.owner}/${options.repo}`);
  const branch = parseBranch(options.branch);
  const files = normalizeCommitFiles(options.files);
  const message = (typeof options.message === "string" ? options.message.trim() : "").slice(0, 500);
  if (message.length === 0) {
    invalid("Type a commit message.");
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const headers = {
    accept: "application/vnd.github+json",
    "content-type": "application/json",
    "x-github-api-version": "2022-11-28",
    authorization: `Bearer ${token}`,
    "user-agent": "keyrig",
  };
  const base = `${GITHUB_API_URL}/repos/${repo.owner}/${repo.repo}`;

  const head = await call<{ object: { sha: string } }>({
    url: `${base}/git/ref/heads/${branch}`,
    headers,
    fetchImpl,
  });
  const parentSha = head.object.sha;
  if (parentSha.length === 0) {
    invalid("GitHub sent no commit for this branch.");
  }

  const parent = await call<{ tree: { sha: string } }>({
    url: `${base}/git/commits/${parentSha}`,
    headers,
    fetchImpl,
  });

  const entries: Array<{ path: string; mode: string; type: string; sha: string }> = [];
  for (const file of files) {
    const blob = await call<{ sha: string }>({
      url: `${base}/git/blobs`,
      headers,
      fetchImpl,
      method: "POST",
      body: { content: file.content, encoding: "utf-8" },
    });
    entries.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
  }

  const tree = await call<{ sha: string }>({
    url: `${base}/git/trees`,
    headers,
    fetchImpl,
    method: "POST",
    body: { base_tree: parent.tree.sha, tree: entries },
  });

  const created = await call<{ sha: string }>({
    url: `${base}/git/commits`,
    headers,
    fetchImpl,
    method: "POST",
    body: { message, tree: tree.sha, parents: [parentSha] },
  });

  await call<Record<string, unknown>>({
    url: `${base}/git/refs/heads/${branch}`,
    headers,
    fetchImpl,
    method: "PATCH",
    body: { sha: created.sha, force: false },
  });

  return {
    commitSha: created.sha,
    url: `https://github.com/${repo.owner}/${repo.repo}/commit/${created.sha}`,
    branch,
    files: files.map((file) => file.path),
  };
}
