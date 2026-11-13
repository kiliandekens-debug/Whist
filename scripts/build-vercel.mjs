import {mkdir, readFile, writeFile, copyFile, rm} from "node:fs/promises";
import {build} from "esbuild";
import {stamp} from "./version.mjs";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!url?.startsWith("https://") || !key || key.startsWith("sb_secret_")) {
  throw Error("Configure SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY before building.");
}
const output = new URL("../vercel-public/", import.meta.url);
await rm(output, {recursive:true,force:true});
await mkdir(output, {recursive:true});
for (const name of ["app.mjs","cloud.mjs","score.mjs","players.mjs","style.css","cards.svg","icon.svg","apple-touch-icon.png","sw.js","manifest.webmanifest","icon-192.png","icon-512.png","icon-maskable-512.png"]) {
  await copyFile(new URL("../" + name, import.meta.url), new URL(name, output));
}
let html = await readFile(new URL("../index.html", import.meta.url), "utf8");
html = html.replace('src="/app.mjs"', 'src="/boot.mjs"');
const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
html = await stamp(html, process.env.VERCEL_ENV !== "production" && commit ? "aperçu " + commit : "");
await writeFile(new URL("index.html", output), html);
const preview = process.env.VERCEL_ENV !== "production";
const common = {bundle:true, format:"esm", platform:"browser", target:"es2022", minify:true, external:["./app.mjs", "./auth.mjs"]};
// The boot script only needs to know which notebook it is; the sign-in entry carries Supabase.
await build({...common, entryPoints:["vercel/boot.mjs"], outfile:"vercel-public/boot.mjs", define:{WHIST_CONFIG:JSON.stringify({preview})}});
await build({...common, entryPoints:["vercel/auth.mjs"], outfile:"vercel-public/auth.mjs", define:{WHIST_CONFIG:JSON.stringify({url, key, preview})}});
