const assetTypes = {
  ".html":"text/html; charset=utf-8",
  ".mjs":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8",
  ".svg":"image/svg+xml",
};
const pagePath = /^\/(?:accueil|nouvelle-partie(?:\/table)?|partie|historique(?:\/[^/]+)?|joueurs(?:\/[^/]+)?|classements|bareme|groupes)?\/?$/;

function error(code, status) {
  return Response.json({error:code}, {status, headers:{"Cache-Control":"no-store"}});
}

async function storage(request, env) {
  const owner = request.headers.get("oai-authenticated-user-id");
  if (!owner) return error("unauthorized",401);
  if (!["GET","PUT"].includes(request.method)) return error("method",405);
  if (request.method === "PUT" && request.headers.get("Sec-Fetch-Site") === "cross-site") {
    return error("origin",403);
  }
  if (!env.WHIST_STORAGE_URL || !env.WHIST_STORAGE_KEY) return error("unavailable",503);

  try {
    const response = await fetch(env.WHIST_STORAGE_URL, {
      method: request.method,
      headers: {
        "X-Whist-Site-Key":env.WHIST_STORAGE_KEY,
        "X-Whist-Owner":owner,
        "Content-Type":"application/json",
      },
      body: request.method === "PUT" ? request.body : undefined,
      redirect:"error",
      signal:AbortSignal.timeout(5000),
    });
    return new Response(response.body, {
      status:response.status,
      headers:{"Content-Type":"application/json","Cache-Control":"no-store"},
    });
  } catch {
    return error("unavailable",503);
  }
}

export default {
  async fetch(request, env) {
    const {pathname} = new URL(request.url);
    if (pathname === "/api/whist-state") return storage(request, env);
    const path = pagePath.test(pathname) ? "/index.html" : pathname;
    if (!Object.hasOwn(assets, path)) return new Response("Introuvable", {status:404});
    if (!["GET","HEAD"].includes(request.method)) return error("method",405);
    return new Response(request.method === "HEAD" ? null : assets[path], {
      headers: {
        "Content-Type":assetTypes[path.slice(path.lastIndexOf("."))],
        "Cache-Control":"no-cache",
        "X-Content-Type-Options":"nosniff",
      },
    });
  },
};
