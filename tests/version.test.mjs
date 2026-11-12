import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {stamp} from "../scripts/version.mjs";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");

test("the newest changelog entry matches the package version", async () => {
  const {version} = JSON.parse(await read("package.json"));
  assert.match(version, /^\d+\.\d+\.\d+$/);
  const [, newest] = /^## (\d+\.\d+\.\d+) — \d{4}-\d{2}-\d{2}$/m.exec(await read("CHANGELOG.md"));
  assert.equal(newest, version);
});

test("the build writes the version into the page footer", async () => {
  const {version} = JSON.parse(await read("package.json"));
  const html = await stamp(await read("index.html"), "aperçu abc1234");
  assert.ok(html.includes('id="app-version">v' + version + " · aperçu abc1234</span>"));
});
