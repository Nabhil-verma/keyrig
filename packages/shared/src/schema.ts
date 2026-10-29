/**
 * AR-03: version all stored data and migrate it once.
 *
 * Every stored document is an envelope. A migration records its id in the
 * document, so a second run does nothing.
 */

export interface VersionedDocument<T> {
  schemaVersion: number;
  appliedMigrations: string[];
  data: T;
}

export interface Migration<T> {
  id: string;
  from: number;
  to: number;
  migrate: (data: unknown) => T;
}

export function createDocument<T>(schemaVersion: number, data: T): VersionedDocument<T> {
  return { schemaVersion, appliedMigrations: [], data };
}

export function isVersionedDocument(value: unknown): value is VersionedDocument<unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.schemaVersion === "number" && Array.isArray(record.appliedMigrations) && "data" in record;
}

export interface MigrateResult<T> {
  document: VersionedDocument<T>;
  applied: string[];
}

/**
 * Apply the migrations in order. Skip a migration whose id is already recorded.
 * Throw when the document is newer than this build knows.
 */
export function applyMigrations<T>(
  raw: unknown,
  targetVersion: number,
  migrations: readonly Migration<T>[],
): MigrateResult<T> {
  if (!isVersionedDocument(raw)) {
    throw new Error("The stored data has no schema version.");
  }
  const document = raw as VersionedDocument<T>;

  if (document.schemaVersion > targetVersion) {
    throw new Error("The stored data is newer than this build. Update keyrig.");
  }

  const applied: string[] = [];
  let data: unknown = document.data;
  let version = document.schemaVersion;
  const done = new Set(document.appliedMigrations);

  for (const migration of migrations) {
    if (done.has(migration.id) || version !== migration.from) {
      continue;
    }
    data = migration.migrate(data);
    version = migration.to;
    done.add(migration.id);
    applied.push(migration.id);
  }

  return {
    document: {
      schemaVersion: version,
      appliedMigrations: [...done],
      data: data as T,
    },
    applied,
  };
}
