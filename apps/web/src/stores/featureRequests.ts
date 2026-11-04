import { createDocument, createId, isVersionedDocument, type StorageLike } from "@keyrig/shared";

/**
 * D-07 and Phase 5: the local copy of the feature requests.
 *
 * A person who never turns on the backend still sees the requests and can add
 * one. The record holds a title, a detail, a status and a vote count. It holds
 * no key, no chat, no cost and no usage (PR-05).
 */

export const LOCAL_REQUESTS_STORAGE_KEY = "keyrig.feature-requests.v1";
export const LOCAL_REQUESTS_SCHEMA_VERSION = 1;
export const LOCAL_REQUEST_LIMIT = 50;
export const REQUEST_TITLE_LIMIT = 200;
export const REQUEST_DETAIL_LIMIT = 2_000;

export type RequestStatus = "open" | "planned" | "done" | "declined";

export interface LocalRequest {
  id: string;
  title: string;
  detail: string;
  status: RequestStatus;
  statusReason: string;
  votes: number;
  voted: boolean;
  createdAt: string;
}

function readStatus(value: unknown): RequestStatus {
  return value === "planned" || value === "done" || value === "declined" ? value : "open";
}

function readRequest(value: unknown): LocalRequest | null {
  if (value === null || typeof value !== "object") {
    return null;
  }
  const record = value as Partial<LocalRequest>;
  if (typeof record.id !== "string" || typeof record.title !== "string") {
    return null;
  }
  return {
    id: record.id,
    title: record.title,
    detail: typeof record.detail === "string" ? record.detail : "",
    status: readStatus(record.status),
    statusReason: typeof record.statusReason === "string" ? record.statusReason : "",
    votes: typeof record.votes === "number" && Number.isFinite(record.votes) && record.votes > 0 ? record.votes : 0,
    voted: record.voted === true,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date(0).toISOString(),
  };
}

export function readLocalRequests(storage: StorageLike): LocalRequest[] {
  let raw: string | null;
  try {
    raw = storage.getItem(LOCAL_REQUESTS_STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isVersionedDocument(parsed) || parsed.schemaVersion !== LOCAL_REQUESTS_SCHEMA_VERSION) {
      return [];
    }
    if (!Array.isArray(parsed.data)) {
      return [];
    }
    return (parsed.data as unknown[])
      .map(readRequest)
      .filter((item): item is LocalRequest => item !== null)
      .slice(0, LOCAL_REQUEST_LIMIT);
  } catch {
    return [];
  }
}

function writeLocalRequests(storage: StorageLike, requests: LocalRequest[]): LocalRequest[] {
  const capped = requests.slice(0, LOCAL_REQUEST_LIMIT);
  try {
    storage.setItem(
      LOCAL_REQUESTS_STORAGE_KEY,
      JSON.stringify(createDocument(LOCAL_REQUESTS_SCHEMA_VERSION, capped)),
    );
  } catch {
    return capped;
  }
  return capped;
}

/** Add one request. A short title is refused with a clear reason (PR-04). */
export function addLocalRequest(
  storage: StorageLike,
  title: string,
  detail: string,
  now: Date = new Date(),
): LocalRequest[] {
  const clean = title.trim();
  if (clean.length < 3) {
    throw new Error("Give the request a title of at least 3 characters.");
  }
  if (clean.length > REQUEST_TITLE_LIMIT) {
    throw new Error(`The title is longer than ${REQUEST_TITLE_LIMIT} characters.`);
  }
  if (detail.length > REQUEST_DETAIL_LIMIT) {
    throw new Error(`The detail is longer than ${REQUEST_DETAIL_LIMIT} characters.`);
  }
  const request: LocalRequest = {
    id: createId("request_"),
    title: clean,
    detail: detail.trim(),
    status: "open",
    statusReason: "",
    votes: 0,
    voted: false,
    createdAt: now.toISOString(),
  };
  return writeLocalRequests(storage, [request, ...readLocalRequests(storage)]);
}

/** One vote from this device on one request. A second call takes the vote back. */
export function voteLocalRequest(storage: StorageLike, id: string): LocalRequest[] {
  const next = readLocalRequests(storage).map((request) => {
    if (request.id !== id) {
      return request;
    }
    const voted = !request.voted;
    return { ...request, voted, votes: Math.max(0, request.votes + (voted ? 1 : -1)) };
  });
  return writeLocalRequests(storage, next);
}

/** Owner or admin, on this device. The local view has no roles, so anyone can plan. */
export function setLocalRequestStatus(
  storage: StorageLike,
  id: string,
  status: RequestStatus,
  reason = "",
): LocalRequest[] {
  const next = readLocalRequests(storage).map((request) =>
    request.id === id ? { ...request, status, statusReason: reason } : request,
  );
  return writeLocalRequests(storage, next);
}
