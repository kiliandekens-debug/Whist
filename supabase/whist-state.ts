const supabaseUrl = Deno.env.get("SUPABASE_URL");
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const serviceKey = secretKeys.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const limit = 1_000_000;

function result(body: unknown, status = 200) {
  return Response.json(body, {status, headers:{"Cache-Control":"no-store"}});
}

function dataRequest(resource: string, init: RequestInit = {}) {
  return fetch(supabaseUrl + "/rest/v1/" + resource, {
    ...init,
    headers: {
      apikey: serviceKey!,
      ...(serviceKey.startsWith("sb_secret_") ? {} : {Authorization:"Bearer " + serviceKey}),
      "Content-Type": "application/json",
      ...init.headers,
    },
    redirect: "error",
  });
}

async function authorized(request: Request) {
  const token = request.headers.get("X-Whist-Site-Key");
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  const digest = Array.from(hash, byte => byte.toString(16).padStart(2, "0")).join("");
  const query = new URLSearchParams({name:"eq.production",token_digest:"eq." + digest,select:"name"});
  const response = await dataRequest("whist_site_access?" + query);
  if (!response.ok) throw Error("Storage authentication unavailable");
  return (await response.json()).length === 1;
}

async function handle(request: Request) {
  if (!["GET","PUT"].includes(request.method)) return result({error:"method"},405);
  if (!supabaseUrl || !serviceKey) return result({error:"unavailable"},503);
  let owner: string | null;
  if (request.headers.has("X-Whist-Site-Key")) {
    if (!(await authorized(request))) return result({error:"unauthorized"},401);
    owner = request.headers.get("X-Whist-Owner");
  } else {
    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return result({error:"unauthorized"},401);
    const response = await fetch(supabaseUrl + "/auth/v1/user", {
      headers:{apikey:serviceKey,Authorization:authorization},
      signal:AbortSignal.timeout(5000),
      redirect:"error",
    });
    if (response.status >= 500) throw Error("Identity unavailable");
    if (!response.ok) return result({error:"unauthorized"},401);
    const user = await response.json();
    if (!user.email || !user.email_confirmed_at || user.is_anonymous) return result({error:"unauthorized"},401);
    const query = new URLSearchParams({email:"eq." + user.email.toLowerCase(),select:"owner_id"});
    const access = await dataRequest("whist_account_access?" + query);
    if (!access.ok) throw Error("Access unavailable");
    const [account] = await access.json();
    if (!account) return result({error:"forbidden"},403);
    owner = account.owner_id;
    if (request.headers.get("X-Whist-Environment") === "preview") owner += "_preview";
  }
  if (!owner || !/^[A-Za-z0-9_-]{1,200}$/.test(owner)) return result({error:"owner"},400);
  const row = new URLSearchParams({owner_id:"eq." + owner,select:"revision,snapshot"});
  if (request.method === "GET") {
    const response = await dataRequest("whist_state?" + row);
    if (!response.ok) throw Error("Storage read unavailable");
    const [record] = await response.json();
    return result(record ?? {revision:0,snapshot:null});
  }

  if (Number(request.headers.get("content-length")) > limit) return result({error:"size"},413);
  const body = await request.text();
  if (new TextEncoder().encode(body).length > limit) return result({error:"size"},413);
  let payload;
  try { payload = JSON.parse(body); }
  catch { return result({error:"json"},400); }
  const {revision, snapshot} = payload ?? {};
  if (!Number.isInteger(revision) || revision < 0 || revision >= 2147483647 ||
      !snapshot || !Array.isArray(snapshot.history) || !Array.isArray(snapshot.groups)) {
    return result({error:"snapshot"},400);
  }

  row.set("revision", "eq." + revision);
  const response = revision === 0
    ? await dataRequest("whist_state?on_conflict=owner_id&select=revision", {
      method:"POST",
      headers:{Prefer:"resolution=ignore-duplicates,return=representation"},
      body:JSON.stringify({owner_id:owner,revision:1,snapshot}),
    })
    : await dataRequest("whist_state?" + row, {
      method:"PATCH",
      headers:{Prefer:"return=representation"},
      body:JSON.stringify({revision:revision+1,snapshot}),
    });
  if (!response.ok) throw Error("Storage write unavailable");
  const [record] = await response.json();
  return record ? result({revision:record.revision}) : result({error:"conflict"},409);
}

Deno.serve(async request => {
  try { return await handle(request); }
  catch { return result({error:"unavailable"},503); }
});
