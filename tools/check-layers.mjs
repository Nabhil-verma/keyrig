#!/usr/bin/env node
/**
 * AR-01: a lower layer must not import a higher layer.
 *
 * shared <- providers <- core <- apps
 */
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const allowed = {
  shared: new Set(["@keyrig/shared"]),
  providers: new Set(["@keyrig/shared", "@keyrig/providers"]),
  core: new Set(["@keyrig/shared", "@keyrig/providers", "@keyrig/core"]),
  web: new Set(["@keyrig/shared", "@keyrig/providers", "@keyrig/core", "@keyrig/web"]),
};

const packageName = {
  "packages/shared": "shared",
  "packages/providers": "providers",
  "packages/core": "core",
  "apps/web": "web",
};

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collect(full)));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      files.push(full);
    }
  }
  return files;
}

const importPattern = /(?:import|export)[^"'()]*from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
const problems = [];
let checked = 0;

for (const [relativePackage, layer] of Object.entries(packageName)) {
  const packageRoot = path.join(root, relativePackage);
  try {
    await stat(packageRoot);
  } catch {
    continue;
  }
  for (const file of await collect(path.join(packageRoot, "src"))) {
    const text = await readFile(file, "utf8");
    checked += 1;
    for (const match of text.matchAll(importPattern)) {
      const specifier = match[1] ?? match[2];
      if (!specifier) {
        continue;
      }
      if (specifier.startsWith("@keyrig/")) {
        if (!allowed[layer].has(specifier)) {
          problems.push(`${path.relative(root, file)}: ${layer} must not import ${specifier}`);
        }
        continue;
      }
      if (specifier.startsWith("..")) {
        const resolved = path.resolve(path.dirname(file), specifier);
        if (!resolved.startsWith(path.resolve(packageRoot))) {
          problems.push(`${path.relative(root, file)}: ${layer} must not import across the package boundary (${specifier})`);
        }
      }
    }
  }
}

if (checked === 0) {
  console.error("check-layers: no files were checked.");
  process.exit(1);
}

if (problems.length > 0) {
  console.error("check-layers: a lower layer imports a higher layer (AR-01).");
  for (const problem of problems) {
    console.error(`  ${problem}`);
  }
  process.exit(1);
}

console.log(`check-layers: ${checked} files follow the layer order.`);
