#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(__dirname, "..");
const schemaDir = join(pkgRoot, "src", "schema");
const drizzleConfig = join(pkgRoot, "drizzle.config.ts");
const cacheDir = join(pkgRoot, "node_modules", ".cache");
const cacheFile = join(cacheDir, "drizzle-push-checksum.json");

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walk(full));
    } else if (st.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function computeChecksum() {
  const hash = createHash("sha256");
  const files = [...walk(schemaDir), drizzleConfig].sort();
  for (const file of files) {
    hash.update(relative(pkgRoot, file));
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  const dbUrl = process.env.DATABASE_URL ?? "";
  hash.update("DATABASE_URL=");
  hash.update(createHash("sha256").update(dbUrl).digest("hex"));
  return hash.digest("hex");
}

function readCache() {
  try {
    if (!existsSync(cacheFile)) return null;
    return JSON.parse(readFileSync(cacheFile, "utf8"));
  } catch {
    return null;
  }
}

function writeCache(checksum) {
  try {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(cacheFile, JSON.stringify({ checksum, at: new Date().toISOString() }));
  } catch (err) {
    console.warn(`[db push-if-changed] failed to write cache: ${err.message}`);
  }
}

const checksum = computeChecksum();
const cached = readCache();

if (cached && cached.checksum === checksum) {
  console.log("[db push-if-changed] schema unchanged since last push, skipping drizzle-kit push.");
  process.exit(0);
}

console.log("[db push-if-changed] schema changed (or no cache), running drizzle-kit push...");
const result = spawnSync(
  "pnpm",
  ["exec", "drizzle-kit", "push", "--config", "./drizzle.config.ts"],
  { cwd: pkgRoot, stdio: "inherit" },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

writeCache(checksum);
