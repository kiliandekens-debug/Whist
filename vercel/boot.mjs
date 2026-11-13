// The first script of the page. It is tiny on purpose: a device that already opened the
// notebook shows it straight from its own copy, and the sign-in code loads afterwards.
const config = WHIST_CONFIG;
const marker = "whist-last-user" + (config.preview ? ":preview" : "");
let known = null;
try { known = localStorage.getItem(marker); } catch {}
const watching = /^\/suivre\/[0-9a-f]{64}\/?$/.test(location.pathname);

// A follow link, a first visit, or a sign-in link (it carries a code) all need the full entry.
if (!known || watching || location.search) await import("./auth.mjs");
else {
  const boot = window.whistBoot = {user:known, auth:null};
  const auth = () => boot.auth ??= import("./auth.mjs");
  document.body.dataset.storage = "supabase";
  document.body.dataset.storageKey = "carnet-whist-v1:" + known + (config.preview ? ":preview" : "");
  window.whistAuth = {
    getAccessToken:async () => (await auth()).getAccessToken(),
    sessionLost:async () => (await auth()).sessionLost(),
  };
  try {
    await import("./app.mjs");
  } catch {
    // The copy of the app is missing: let the full entry say so.
    delete window.whistBoot;
    delete document.body.dataset.storage;
    delete document.body.dataset.storageKey;
  }
  await auth();
}
