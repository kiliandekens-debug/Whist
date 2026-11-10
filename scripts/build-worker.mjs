import {mkdir, readFile, writeFile} from "node:fs/promises";

const assetFiles = ["index.html", "app.mjs", "score.mjs", "players.mjs", "cloud.mjs", "style.css", "icon.svg", "cards.svg"];
const source = new URL("../" + (process.argv[2] ?? "dist/"), import.meta.url);
const entries = await Promise.all(assetFiles.map(async path => {
  let content = await readFile(new URL(path, source), "utf8");
  if (path === "index.html") content = content.replace("<body>", '<body data-storage="supabase">');
  return ["/" + path, content];
}));
const worker = await readFile(new URL("../worker/index.mjs", import.meta.url), "utf8");
const output = new URL("../dist/server/", import.meta.url);
await mkdir(output, {recursive:true});
await writeFile(new URL("index.js", output), "const assets = " + JSON.stringify(Object.fromEntries(entries)) + ";\n" + worker);
