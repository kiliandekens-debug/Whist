import {readFile} from "node:fs/promises";

// The version shown in the app footer comes from package.json, the single place to change it.
export async function stamp(html, detail = "") {
  const {version} = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const label = "v" + version + (detail ? " · " + detail : "");
  return html.replace('id="app-version"></span>', 'id="app-version">' + label + "</span>");
}
