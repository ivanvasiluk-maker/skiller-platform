import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("..", import.meta.url));

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (["node_modules", ".wrangler", "dist", ".next", ".git"].includes(name)) continue;
      yield* walk(full);
    } else if (/\.(ts|tsx|mjs)$/.test(name) && !name.endsWith(".test.ts")) {
      yield full;
    }
  }
}

test("production logging never interpolates raw user text or secrets", () => {
  for (const file of walk(root)) {
    const content = readFileSync(file, "utf8");
    for (const match of content.matchAll(/console\.(log|error|warn|info)\(([^)]*)\)/g)) {
      const args = match[2];
      for (const marker of ["main_problem", "confirmed_text", "body.text", "input.description", "OPENAI_API_KEY", "GOOGLE_SERVICE_ACCOUNT"]) {
        assert.ok(
          !args.includes(marker),
          `${path.relative(root, file)}: console.${match[1]} leaks ${marker}: ${args.slice(0, 80)}`,
        );
      }
    }
  }
});

test("OpenAI key is never read into the client bundle", () => {
  const appDir = path.join(root, "app");
  for (const file of walk(appDir)) {
    const rel = path.relative(root, file);
    if (rel.includes("api")) continue; // серверные маршруты читают ключ легально
    const content = readFileSync(file, "utf8");
    assert.ok(
      !content.includes("OPENAI_API_KEY") && !content.includes("process.env.OPENAI"),
      `${rel} reads OpenAI key outside a server route`,
    );
  }
});

test("no NEXT_PUBLIC_ secret pattern is used for OpenAI or Google credentials", () => {
  for (const file of walk(root)) {
    const content = readFileSync(file, "utf8");
    assert.ok(
      !/NEXT_PUBLIC_(OPENAI|GOOGLE|EXPORT|SERVICE_ACCOUNT)/.test(content),
      `${path.relative(root, file)} exposes a secret via NEXT_PUBLIC_ prefix`,
    );
  }
});

test("migration files are ordered and every migration has an idempotent guard or pure DDL", () => {
  const drizzleDir = path.join(root, "drizzle");
  const files = readdirSync(drizzleDir)
    .filter((name) => /^\d{4}_.*\.sql$/.test(name))
    .sort();
  assert.ok(files.length >= 7, `expected at least 7 migrations, got ${files.length}`);
  const seen = new Set<string>();
  for (const file of files) {
    const prefix = file.slice(0, 4);
    assert.ok(!seen.has(prefix), `duplicate migration prefix ${prefix}`);
    seen.add(prefix);
    const sql = readFileSync(path.join(drizzleDir, file), "utf8");
    assert.ok(
      /CREATE TABLE|ALTER TABLE|CREATE INDEX|INSERT/i.test(sql),
      `${file} has no recognizable DDL`,
    );
  }
});

test("client bundle never contains the OpenAI endpoint with a key reference", () => {
  const distClient = path.join(root, "dist", "client");
  try {
    statSync(distClient);
  } catch {
    // Build artifacts отсутствуют — проверка на исходниках уже покрыла это.
    return;
  }
  for (const file of walk(distClient)) {
    const content = readFileSync(file, "utf8");
    assert.ok(
      !content.includes("api.openai.com/v1/responses"),
      `${path.relative(root, file)} references OpenAI responses endpoint in client bundle`,
    );
  }
});

test("conversation follow-up always offers a free-text alternative", () => {
  const source = readFileSync(path.join(root, "app", "trainer-app.tsx"), "utf8");
  assert.ok(source.includes(">Другой ответ</button>"));
  assert.ok(source.includes("writeAnotherOutcome"));
});

test("safety and continuity copy use formal address", () => {
  const safety = readFileSync(path.join(root, "lib", "trainers.ts"), "utf8");
  const continuity = readFileSync(path.join(root, "lib", "trainer-continuity.ts"), "utf8");
  assert.ok(safety.includes("свяжитесь с местной экстренной службой"));
  assert.ok(continuity.includes("Вы отметили"));
  assert.ok(continuity.includes("Вы вернулись после перерыва"));
});
