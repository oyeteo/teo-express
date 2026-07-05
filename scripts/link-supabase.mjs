#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

function readDotenv(path) {
  if (!existsSync(path)) return {};

  const entries = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    entries[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }

  return entries;
}

const env = { ...readDotenv(".env.local"), ...process.env };
const projectRef =
  env.SUPABASE_PROJECT_REF ||
  env.NEXT_PUBLIC_SUPABASE_URL?.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co\/?$/i)?.[1];

if (!projectRef) {
  console.error(
    "Could not derive SUPABASE_PROJECT_REF. Set SUPABASE_PROJECT_REF or NEXT_PUBLIC_SUPABASE_URL in .env.local.",
  );
  process.exit(1);
}

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(
  npx,
  ["--no-install", "supabase", "link", "--project-ref", projectRef, ...process.argv.slice(2)],
  { stdio: "inherit" },
);

process.exit(result.status ?? 1);
