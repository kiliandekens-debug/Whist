import {mkdir, readFile, writeFile, copyFile, rm} from "node:fs/promises";
import {build} from "esbuild";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!url?.startsWith("https://") || !key || key.startsWith("sb_secret_")) {
  throw Error("Configure SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY before building.");
}
const output = new URL("../vercel-public/", import.meta.url);
await rm(output, {recursive:true,force:true});
await mkdir(output, {recursive:true});
for (const name of ["app.mjs","cloud.mjs","score.mjs","players.mjs","style.css","cards.svg","icon.svg","apple-touch-icon.png"]) {
  await copyFile(new URL("../" + name, import.meta.url), new URL(name, output));
}
let html = await readFile(new URL("../index.html", import.meta.url), "utf8");
html = html.replace('src="/app.mjs"', 'src="/auth.mjs"');
await writeFile(new URL("index.html", output), html);
await build({
  entryPoints:["vercel/auth.mjs"],outfile:"vercel-public/auth.mjs",bundle:true,
  format:"esm",platform:"browser",target:"es2022",minify:true,
  external:["./app.mjs"],
  define:{WHIST_CONFIG:JSON.stringify({url,key,preview:process.env.VERCEL_ENV !== "production"})},
});
