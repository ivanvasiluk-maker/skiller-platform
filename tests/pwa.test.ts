import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("PWA manifest describes an installable standalone app", async () => {
  const source = await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8");
  const manifest = JSON.parse(source) as {
    display: string;
    start_url: string;
    icons: Array<{ src: string; purpose: string }>;
  };
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.ok(manifest.icons.some((icon) => icon.src === "/icons/icon-192.png"));
  assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));
});

test("service worker never caches API or conversation HTML", async () => {
  const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.match(source, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(source, /const isStatic/);
  assert.equal(source.includes('STATIC_ASSETS = [\n  "/",'), false);
});
