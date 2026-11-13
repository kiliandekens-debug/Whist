import {createClient} from "@supabase/supabase-js";
import qrcode from "qrcode-generator";

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
let recovering = false;
// A follow link is public and read-only: it never goes through sign-in.
const watching = /^\/suivre\/([0-9a-f]{64})\/?$/.exec(location.pathname);
navigation.hidden = true;
const wait = text => { app.innerHTML = '<p class="wrap app-wait"></p>'; app.firstChild.textContent = text; };
wait("Connexion au carnet…");

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
      <button class="text-action" type="button" id="login-reset" style="margin-top:10px">Mot de passe oublié ?</button>
      <p id="login-status" role="status" aria-live="polite" style="margin-top:12px"></p>
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
  document.querySelector("#login-reset").addEventListener("click", () => {
    if (!form.querySelector("#login-email").reportValidity()) return;
    void attempt("Envoi de l’e-mail…", async () => {
      const {error} = await client.auth.resetPasswordForEmail(email(), {redirectTo:location.origin + "/"});
      return error?.name === "AuthRetryableFetchError"
        ? "Connexion interrompue. Réessaie quand le réseau est disponible."
        : "Si un compte existe pour cette adresse, un e-mail vient de partir. Ouvre son lien dans ce navigateur pour choisir un nouveau mot de passe.";
    });
  });
  document.querySelector("#login-link").addEventListener("click", () => {
    if (!form.querySelector("#login-email").reportValidity()) return;
    void attempt("Envoi du lien…", async () => {
      // The first link creates the account. Only the owner's address can open the notebook.
      const {error} = await client.auth.signInWithOtp({
        email:email(),
        options:{emailRedirectTo:location.origin + "/",shouldCreateUser:true},
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

// Lets the signed-in owner choose the password used by the sign-in form.
function choosePassword() {
  const dialog = document.querySelector("#dialog");
  dialog.innerHTML = `<header class="dialog-head"><div><h2 id="dialog-title">Mot de passe</h2></div><button class="dialog-close" data-action="close" aria-label="Fermer">×</button></header>
    <form id="password-form"><div class="dialog-main">
      <label>Nouveau mot de passe<input name="password" type="password" autocomplete="new-password" required minlength="8" maxlength="200"></label>
      <p class="hint">Au moins 8 caractères. Il servira à te connecter sans attendre un e-mail.</p>
      <p class="error" role="alert" hidden></p></div>
    <div class="dialog-actions"><button type="button" class="btn secondary" data-action="close">Annuler</button><button type="submit" class="btn primary">Enregistrer</button></div></form>`;
  const form = dialog.querySelector("form");
  const problem = form.querySelector(".error");
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    problem.hidden = true;
    let failed = true;
    try {
      const {error} = await client.auth.updateUser({password:form.elements.password.value});
      failed = !!error;
    } catch {}
    if (failed) {
      problem.textContent = "Le mot de passe n’a pas pu être enregistré. Vérifie ta connexion, ou choisis-en un plus long.";
      problem.hidden = false;
      button.disabled = false;
      return;
    }
    dialog.close();
    document.querySelector("#toast").textContent = "Mot de passe enregistré.";
    setTimeout(() => {document.querySelector("#toast").textContent = "";}, 3200);
  });
  if (!dialog.open) dialog.showModal();
  form.elements.password.focus();
}

// The server no longer accepts this session: back to the sign-in form.
let leaving = false;
async function sessionLost() {
  if (leaving) return;
  leaving = true;
  try { await client.auth.signOut({scope:"local"}); } catch {}
  forgetUser();
  location.reload();
}

// Opens the notebook. Without `initial`, the app starts from the copy kept on this device.
async function launch(userId, initial) {
  if (loadedUser) return;
  loadedUser = userId;
  document.body.dataset.storage = "supabase";
  document.body.dataset.storageKey = "carnet-whist-v1:" + userId + (config.preview ? ":preview" : "");
  window.whistAuth = {getAccessToken, initial, sessionLost};
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
  const password = document.createElement("button");
  password.type = "button";
  password.textContent = "Mot de passe";
  password.addEventListener("click", choosePassword);
  const follow = document.createElement("button");
  follow.type = "button";
  follow.textContent = "Lien de suivi";
  follow.addEventListener("click", () => {void manageFollowLink();});
  const buttons = document.createElement("span");
  buttons.className = "cloud-buttons";
  // A preview has its own notebook, which the follow link does not reach.
  buttons.append(...(config.preview ? [] : [follow]), password, logout);
  for (const button of buttons.children) button.className = "quiet";
  document.querySelector(".cloud-controls").append(buttons);
  await import("./app.mjs");
  if (recovering) choosePassword();
}

// Lets the owner create, share or switch off the read-only link to the current game.
async function manageFollowLink(action = "get") {
  const dialog = document.querySelector("#dialog");
  const frame = body => {
    dialog.innerHTML = `<header class="dialog-head"><div><h2 id="dialog-title">Lien de suivi</h2></div><button class="dialog-close" data-action="close" aria-label="Fermer">×</button></header>
      <div class="dialog-main share-link">${body}</div>`;
    if (!dialog.open) dialog.showModal();
  };
  frame('<p class="body-copy">Un instant…</p>');
  let token = null;
  let problem = null;
  try {
    const {data, error} = await client.rpc("whist_share_link", {action});
    token = data;
    problem = error;
  } catch (error) { problem = error; }
  if (problem) {
    frame(`<p class="body-copy">${problem.code === "PGRST202"
      ? "Le suivi en direct n’est pas encore activé sur le serveur. Il faut exécuter une fois le fichier supabase/whist-share.sql dans Supabase."
      : "Le lien de suivi n’est pas disponible pour l’instant. Vérifie ta connexion et réessaie."}</p>`);
    return;
  }
  if (!token) {
    frame(`<p class="body-copy">Crée un lien à envoyer aux autres joueurs : ils verront la partie en cours et ses scores se mettre à jour, sans compte et sans pouvoir rien modifier.</p>
      <button class="btn primary" type="button" id="follow-create">Créer le lien de suivi</button>`);
    dialog.querySelector("#follow-create").addEventListener("click", () => {void manageFollowLink("create");});
    return;
  }
  const url = location.origin + "/suivre/" + token;
  const code = qrcode(0, "M");
  code.addData(url);
  code.make();
  frame(`<p class="body-copy">Fais scanner ce code, ou envoie le lien : on y voit la partie en cours et la dernière partie terminée, sans pouvoir rien modifier.</p>
    <div class="share-qr" role="img" aria-label="Code QR du lien de suivi">${code.createSvgTag({scalable:true, margin:2})}</div>
    <input readonly aria-label="Lien de suivi" value="${url}">
    <button class="btn primary" type="button" id="follow-send">${navigator.share ? "Envoyer le lien" : "Copier le lien"}</button>
    <button class="btn secondary" type="button" id="follow-revoke">Désactiver ce lien</button>
    <p class="hint" role="status" id="follow-status"></p>`);
  dialog.querySelector("input").addEventListener("focus", event => event.target.select());
  dialog.querySelector("#follow-send").addEventListener("click", async () => {
    try {
      if (navigator.share) await navigator.share({title:"Whist en direct", url});
      else {
        await navigator.clipboard.writeText(url);
        dialog.querySelector("#follow-status").textContent = "Lien copié.";
      }
    } catch (error) {
      if (error?.name !== "AbortError") dialog.querySelector("#follow-status").textContent = "Sélectionne le lien ci-dessus pour le copier.";
    }
  });
  dialog.querySelector("#follow-revoke").addEventListener("click", () => {
    if (confirm("Les personnes qui ont ce lien ne pourront plus suivre la partie. Désactiver le lien ?")) void manageFollowLink("revoke");
  });
}

// The public, read-only page behind a follow link.
async function startWatching(token) {
  wait("Chargement de la partie…");
  const read = async () => {
    const {data, error} = await client.rpc("whist_shared", {share_token:token});
    if (error) throw error;
    return data;
  };
  let state;
  try { state = await read(); }
  catch { return showFailure(); }
  if (!state) {
    app.innerHTML = '<section class="wrap narrow page"><div class="page-head"><h1>Lien inactif</h1><p>Ce lien de suivi a été désactivé. Demande un nouveau lien à la personne qui tient les scores.</p></div></section>';
    return;
  }
  document.body.dataset.viewer = "true";
  window.whistViewer = {state};
  try { await import("./app.mjs"); }
  catch { return showFailure(); }
  let revision = state.revision;
  let busy = false;
  async function refresh() {
    if (busy || document.hidden) return;
    busy = true;
    try {
      const next = await read();
      if (!next) location.reload();
      else if (next.revision !== revision) {
        revision = next.revision;
        window.whistViewer.update(next);
      }
    } catch {}
    busy = false;
  }
  setInterval(refresh, 8000);
  document.addEventListener("visibilitychange", refresh);
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
  wait("Chargement de ton carnet…");
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
  if (watching) return;
  if (event === "SIGNED_OUT") forgetUser();
  if (event === "PASSWORD_RECOVERY") {
    recovering = true;
    if (loadedUser) choosePassword();
  }
  if (loadedUser) {
    if (event === "SIGNED_OUT" || (session && session.user.id !== loadedUser)) location.reload();
  } else if (session) setTimeout(() => {void start(session);}, 0);
});

const known = lastUser();
if (watching) await startWatching(watching[1]);
else if (known) {
  // This account already opened the notebook here: show it at once from the copy kept on the device.
  // The session is checked in the background, and every exchange with the server checks it again.
  await startOffline(known);
  if (navigator.onLine) void client.auth.getSession().then(({data, error}) => {
    if (location.search) history.replaceState(null, "", location.pathname);
    if (error?.name === "AuthRetryableFetchError") return;
    if (!data?.session || data.session.user.id !== known) void sessionLost();
  });
} else {
  const outcome = await client.auth.getSession();
  if (location.search) history.replaceState(null, "", location.pathname);
  if (outcome.error) showLogin("Ce lien a expiré ou a été ouvert dans un autre navigateur. Demande un nouveau lien.");
  else await start(outcome.data.session);
}
