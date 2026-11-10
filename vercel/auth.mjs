import {createClient} from "@supabase/supabase-js";

const config = WHIST_CONFIG;
const client = createClient(config.url, config.key, {
  auth:{flowType:"pkce",storageKey:"whist-supabase-auth",persistSession:true,autoRefreshToken:true,detectSessionInUrl:true},
});
const app = document.querySelector("#app");
const navigation = document.querySelector("nav");
let loadedUser = null;
let starting = false;
navigation.hidden = true;
app.textContent = "Connexion au carnet…";

function showLogin(message = "Retrouve tes parties et tes scores sur tous tes appareils.") {
  app.innerHTML = `<section class="wrap narrow page">
    <div class="page-head"><span class="eyebrow">Ton carnet personnel</span><h1>À toi de jouer<span>.</span></h1><p id="login-message"></p></div>
    <form id="login-form" class="surface" style="padding:clamp(20px,5vw,36px)">
      <label for="login-email">Ton adresse e-mail</label>
      <input id="login-email" type="email" autocomplete="email" inputmode="email" required maxlength="254"
        placeholder="prenom@exemple.be" style="display:block;width:100%;min-height:52px;margin:12px 0 24px;padding:12px;font:inherit;border:1px solid #b8c2b8;border-radius:12px;box-sizing:border-box">
      <button class="btn primary" type="submit">Recevoir mon lien de connexion</button>
      <p id="login-status" role="status" aria-live="polite" style="margin-top:20px"></p>
    </form>
    <p class="hint">Ouvre le lien dans le navigateur utilisé pour cette demande.</p>
    ${config.preview ? '<p class="hint">Version de test · les parties encodées ici sont séparées du carnet principal.</p>' : ""}
  </section>`;
  document.querySelector("#login-message").textContent = message;
  document.querySelector("#login-form").addEventListener("submit", async event => {
    event.preventDefault();
    const button = event.target.querySelector("button");
    const status = document.querySelector("#login-status");
    button.disabled = true;
    status.textContent = "Envoi du lien…";
    try {
      const {error} = await client.auth.signInWithOtp({
        email:document.querySelector("#login-email").value.trim(),
        options:{emailRedirectTo:location.origin + "/",shouldCreateUser:true},
      });
      status.textContent = error
        ? "Le lien n’a pas pu être envoyé. Réessaie plus tard. L’envoi d’e-mails doit être activé pour cette adresse dans Supabase."
        : "Le lien est envoyé. Consulte ta boîte mail et tes courriers indésirables.";
    } catch {
      status.textContent = "Connexion interrompue. Réessaie quand le réseau est disponible.";
    } finally {
      button.disabled = false;
    }
  });
}

async function getAccessToken() {
  const {data:{session},error} = await client.auth.getSession();
  if (error || !session || session.user.id !== loadedUser) throw Error("Session expired");
  return session.access_token;
}

async function start(session) {
  if (loadedUser || starting) return;
  if (!session) return showLogin();
  starting = true;
  app.textContent = "Chargement de ton carnet…";
  try {
    const response = await fetch("/api/whist-state", {
      headers:{Authorization:"Bearer " + session.access_token},cache:"no-store",signal:AbortSignal.timeout(15000),
    });
    if (response.status === 401 || response.status === 403) {
      await client.auth.signOut({scope:"local"});
      showLogin(response.status === 403 ? "Ce carnet est réservé au compte de son propriétaire." : "Ta connexion a expiré. Demande un nouveau lien.");
      return;
    }
    if (!response.ok) throw Error("Storage unavailable");
    const key = "carnet-whist-v1:" + session.user.id + (config.preview ? ":preview" : "");
    // The API has verified access before importing data from the original domain.
    if (!config.preview && !localStorage.getItem(key)) {
      const legacy = localStorage.getItem("carnet-whist-v1");
      if (legacy) localStorage.setItem(key, legacy);
    }
    loadedUser = session.user.id;
    document.body.dataset.storage = "supabase";
    document.body.dataset.storageKey = key;
    window.whistAuth = {getAccessToken};
    navigation.hidden = false;
    const logout = document.createElement("button");
    logout.type = "button";
    logout.textContent = "Déconnexion";
    logout.addEventListener("click", async () => {
      if (!confirm("Les dernières modifications doivent être sauvegardées avant de te déconnecter. Continuer ?")) return;
      logout.disabled = true;
      const {error} = await client.auth.signOut({scope:"local"});
      if (error) {logout.disabled = false; return;}
      location.reload();
    });
    document.querySelector(".cloud-controls").append(logout);
    await import("./app.mjs");
  } catch {
    app.innerHTML = '<section class="wrap narrow page"><h1>Connexion interrompue</h1><p>Ton carnet sera disponible dès que la connexion sera rétablie.</p><button class="btn primary" id="retry-login">Réessayer</button></section>';
    document.querySelector("#retry-login").addEventListener("click", () => location.reload());
  } finally {
    starting = false;
  }
}

client.auth.onAuthStateChange((_event, session) => {
  if (loadedUser && session?.user.id !== loadedUser) location.reload();
  else if (!loadedUser && session) setTimeout(() => {void start(session);}, 0);
});
const {data:{session},error} = await client.auth.getSession();
if (location.search) history.replaceState(null, "", location.pathname);
if (error) showLogin("Ce lien a expiré ou a été ouvert dans un autre navigateur. Demande un nouveau lien.");
else await start(session);
