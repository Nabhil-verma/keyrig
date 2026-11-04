import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const folder = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(folder, "manifest.json"), "utf8"));
const listed = new Set(manifest.modules.map((module) => module.path.replace(/^\.\//, "")));

function localImports(file) {
  const source = readFileSync(resolve(folder, file), "utf8");
  return [...source.matchAll(/from\s+["']\.\/([^"']+)["']/g)].map((match) => match[1]);
}

function allModules() {
  const seen = new Set();
  const queue = [manifest.entrypoint];

  while (queue.length > 0) {
    const file = queue.shift();
    if (seen.has(file)) {
      continue;
    }
    seen.add(file);
    queue.push(...localImports(file));
  }
  return seen;
}

describe("D-07 the deployment manifest lists every Worker module", () => {
  it("lists each local import, including the backend", () => {
    for (const file of allModules()) {
      expect(listed.has(file), `${file} is imported but not listed in manifest.json`).toBe(true);
    }
    expect(listed.has("backend.mjs")).toBe(true);
  });

  it("points at files that exist", () => {
    for (const module of manifest.modules) {
      expect(existsSync(resolve(folder, module.path)), `${module.path} does not exist`).toBe(true);
    }
  });
});
