import { createDocument, isVersionedDocument, type StorageLike } from "@keyrig/shared";
import { browserStorage } from "./storage";

/**
 * A skill is a saved prompt. The person adds it once and uses it in any chat.
 * The record stays in this browser. A skill holds no key and no chat text.
 */
export interface Skill {
  id: string;
  name: string;
  prompt: string;
  createdAt: string;
}

export const SKILLS_STORAGE_KEY = "keyrig.skills.v1";
export const SKILLS_SCHEMA_VERSION = 1;
export const MAX_SKILLS = 100;
export const SKILL_NAME_LIMIT = 60;
export const SKILL_PROMPT_LIMIT = 8000;

function isSkill(value: unknown): value is Skill {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.prompt === "string" &&
    typeof record.createdAt === "string"
  );
}

function readAll(storage: StorageLike): Skill[] {
  let raw: string | null;
  try {
    raw = storage.getItem(SKILLS_STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isVersionedDocument(parsed) || parsed.schemaVersion !== SKILLS_SCHEMA_VERSION || !Array.isArray(parsed.data)) {
      return [];
    }
    return parsed.data.filter(isSkill);
  } catch {
    return [];
  }
}

function writeAll(storage: StorageLike, skills: Skill[]): void {
  storage.setItem(SKILLS_STORAGE_KEY, JSON.stringify(createDocument(SKILLS_SCHEMA_VERSION, skills)));
}

export function listSkills(storage: StorageLike = browserStorage()): Skill[] {
  return readAll(storage);
}

/** Add one skill. A bad name or a bad prompt throws a message for the form. */
export function addSkill(
  input: { name: string; prompt: string },
  storage: StorageLike = browserStorage(),
): Skill {
  const name = input.name.trim();
  const prompt = input.prompt.trim();
  if (name.length === 0) {
    throw new Error("Give the skill a name.");
  }
  if (name.length > SKILL_NAME_LIMIT) {
    throw new Error(`Keep the name under ${SKILL_NAME_LIMIT} characters.`);
  }
  if (prompt.length === 0) {
    throw new Error("Write the prompt.");
  }
  if (prompt.length > SKILL_PROMPT_LIMIT) {
    throw new Error(`Keep the prompt under ${SKILL_PROMPT_LIMIT} characters.`);
  }
  const skills = readAll(storage);
  if (skills.length >= MAX_SKILLS) {
    throw new Error(`keyrig holds ${MAX_SKILLS} skills. Delete one first.`);
  }
  const skill: Skill = {
    id: crypto.randomUUID(),
    name,
    prompt,
    createdAt: new Date().toISOString(),
  };
  writeAll(storage, [skill, ...skills]);
  return skill;
}

export function removeSkill(id: string, storage: StorageLike = browserStorage()): Skill[] {
  const next = readAll(storage).filter((skill) => skill.id !== id);
  writeAll(storage, next);
  return next;
}
