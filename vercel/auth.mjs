import {createClient} from "@supabase/supabase-js";

const config = WHIST_CONFIG;
const client = createClient(config.url, config.key, {
  auth:{flowType:"pkce",storageKey:"whist-supabase-auth",persistSession:true,autoRefreshToken:true,detectSessionInUrl:true},
});
const app = document.querySelector("#app");
const navigation = document.querySelector("nav");
// Remembers who last opened the notebook here, so it can open without a connection.
const marker = "whist-last-user" + (config.preview ? ":preview" : "");
let loadedUser = null;
let starting = false;
let failed = false;
let rejectedToken = null;
navigation.hidden = true;
app.textContent = "Connexion au carnet…";

function lastUser() {
  try { return localStorage.getItem(marker); } catch { return null; }
}
function forgetUser() {
  try { localStorage.removeItem(marker); } catch {}
}

function showLogin(message = "Retrouve tes parties et tes scores sur tous tes appareils.") {
  const field = "display:block;width:100%;min-height:52px;margin:12px 0 24px;padding:12px;font:inherit;border:1px solid #b8c2b8;border-radius:12px;box-sizing:border-box";
  app.innerHTML = `<section class="wrap narrow page">
    <div class="page-head"><h1>On se fait un whist ?</h1><p id="login-message"></p></div>
    <form id="login-form" class="surface" style="padding:clamp(20px,5vw,36px)">
      <label for="login-email">Ton adresse e-mail</label>
      <input id="login-email" type="email" autocomplete="username" inputmode="email" required maxlength="254"
        placeholder="prenom@exemple.be" style="${field}">
      <label for="login-password">Ton mot de passe</label>
      <input id="login-password" type="password" autocomplete="current-password" maxlength="200" style="${field}">
      <div style="display:flex;flex-wrap:wrap;gap:12px">
        <button class="btn primary" type="submit">Se connecter</button>
        <button class="btn secondary" type="button" id="login-link">Recevoir un lien par e-mail</button>
      </div>
      <p id="login-status" role="status" aria-live="polite" style="margin-top:20px"></p>
    </form>
    <p class="hint">Si tu demandes un lien, ouvre-le dans le navigateur utilisé pour cette demande.</p>
    ${config.preview ? '<p class="hint">Les parties jouées dans cet aperçu restent ici.</p>' : ""}
  </section>`;
  document.querySelector("#login-message").textContent = message;
  const form = document.querySelector("#login-form");
  const status = document.querySelector("#login-status");
  const email = () => document.querySelector("#login-email").value.trim();
  async function attempt(waiting, action) {
    const buttons = form.querySelectorAll("button");
    buttons.forEach(button => {button.disabled = true;});
    status.textContent = waiting;
    try {
      status.textContent = await action();
    } catch {
      status.textContent = "Connexion interrompue. Réessaie quand le réseau est disponible.";
    } finally {
      buttons.forEach(button => {button.disabled = false;});
    }
  }
  form.addEventListener("submit", event => {
    event.preventDefault();
    const password = document.querySelector("#login-password").value;
    if (!password) {
      status.textContent = "Saisis ton mot de passe, ou demande un lien par e-mail.";
      return;
    }
    void attempt("Connexion…", async () => {
      const {error} = await client.auth.signInWithPassword({email:email(), password});
      if (!error) return "Chargement de ton carnet…";
      return error.name === "AuthRetryableFetchError"
        ? "Connexion interrompue. Réessaie quand le réseau est disponible."
        : "Adresse ou mot de passe incorrect.";
    });
  });
  document.querySelector("#login-link").addEventListener("click", () => {
    if (!form.querySelector("#login-email").reportValidity()) return;
    void attempt("Envoi du lien…", async () => {
      // The notebook belongs to one owner: never create accounts for other addresses.
      const {error} = await client.auth.signInWithOtp({
        email:email(),
        options:{emailRedirectTo:location.origin + "/",shouldCreateUser:false},
      });
      return error
        ? "Le lien n’a pas pu être envoyé. Vérifie ton adresse et réessaie dans un instant."
        : "Le lien est envoyé. Consulte ta boîte mail et tes courriers indésirables.";
    });
  });
}

function showFailure() {
  failed = true;
  navigation.hidden = true;
  app.innerHTML = '<section class="wrap narrow page"><h1>Connexion interrompue</h1><p>Ton carnet sera disponible dès que la connexion sera rétablie.</p><button class="btn primary" id="retry-login">Réessayer</button></section>';
  document.querySelector("#retry-login").addEventListener("click", () => location.reload());
}

async function getAccessToken() {
  if (!navigator.onLine) throw Error("Offline");
  const {data:{session},error} = await client.auth.getSession();
  if (error?.name === "AuthRetryableFetchError") throw Error("Offline");
  if (error || !session || session.user.id !== loadedUser) throw Object.assign(Error("Session expired"), {code:"session"});
  return session.access_token;
}

// Opens the notebook. Without `initial`, the app starts from the copy kept on this device.
async function launch(userId, initial) {
  if (loadedUser) return;
  loadedUser = userId;
  document.body.dataset.storage = "supabase";
  document.body.dataset.storageKey = "carnet-whist-v1:" + userId + (config.preview ? ":preview" : "");
  window.whistAuth = {getAccessToken, initial};
  navigation.hidden = false;
  const logout = document.createElement("button");
  logout.type = "button";
  logout.textContent = "Déconnexion";
  logout.addEventListener("click", async () => {
    if (window.whistAuth.hasUnsaved?.() && !confirm("Des modifications ne sont pas encore sauvegardées en ligne. Elles resteront sur cet appareil jusqu’à ta prochaine connexion. Te déconnecter quand même ?")) return;
    logout.disabled = true;
    const {error} = await client.auth.signOut({scope:"local"});
    if (error) {logout.disabled = false; return;}
    forgetUser();
    location.reload();
  });
  document.querySelector(".cloud-controls").append(logout);
  await import("./app.mjs");
}

async function startOffline(userId) {
  if (loadedUser || starting || failed) return;
  try { await launch(userId); }
  catch { showFailure(); }
}

async function start(session) {
  if (loadedUser || starting || failed) return;
  if (!session) return showLogin();
  if (session.access_token === rejectedToken) return;
  starting = true;
  app.textContent = "Chargement de ton carnet…";
  try {
    let response = null;
    try {
      response = await fetch("/api/whist-state", {
        headers:{Authorization:"Bearer " + session.access_token},cache:"no-store",signal:AbortSignal.timeout(15000),
      });
    } catch {}
    if (response?.status === 401 || response?.status === 403) {
      rejectedToken = session.access_token;
      await client.auth.signOut({scope:"local"});
      forgetUser();
      showLogin(response.status === 403 ? "Ce carnet est réservé au compte de son propriétaire." : "Ta connexion a expiré. Demande un nouveau lien.");
      return;
    }
    if (!response?.ok) {
      // No answer from the server: open the copy kept here if this account already used it.
      if (lastUser() !== session.user.id) throw Error("Storage unavailable");
      await launch(session.user.id);
      return;
    }
    const initial = await response.json();
    const key = "carnet-whist-v1:" + session.user.id + (config.preview ? ":preview" : "");
    // The API has verified access before importing data from the original domain.
    if (!config.preview && !localStorage.getItem(key)) {
      const legacy = localStorage.getItem("carnet-whist-v1");
      if (legacy) localStorage.setItem(key, legacy);
    }
    try { localStorage.setItem(marker, session.user.id); } catch {}
    await launch(session.user.id, initial);
  } catch {
    showFailure();
  } finally {
    starting = false;
  }
}

client.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT") forgetUser();
  if (loadedUser) {
    if (event === "SIGNED_OUT" || (session && session.user.id !== loadedUser)) location.reload();
  } else if (session) setTimeout(() => {void start(session);}, 0);
});

const known = lastUser();
if (known && !navigator.onLine) await startOffline(known);
else {
  // Refreshing an expired session can retry for a long time on a dead network.
  const waiting = known ? new Promise(resolve => setTimeout(resolve, 8000, null)) : null;
  const outcome = await (waiting ? Promise.race([client.auth.getSession(), waiting]) : client.auth.getSession());
  if (!outcome || (known && outcome.error?.name === "AuthRetryableFetchError")) await startOffline(known);
  else {
    if (location.search) history.replaceState(null, "", location.pathname);
    if (outcome.error) showLogin("Ce lien a expiré ou a été ouvert dans un autre navigateur. Demande un nouveau lien.");
    else await start(outcome.data.session);
  }
}
