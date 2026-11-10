import {createCloudStore} from "./cloud.mjs";
import {modes, contracts, byId, rolesFor, calculateRound, declarationWon} from "./score.mjs";

const app = document.querySelector("#app");
const dialog = document.querySelector("#dialog");
const toast = document.querySelector("#toast");
const storageKey = document.body.dataset.storageKey || "carnet-whist-v1";
const defaults = {active:null, history:[], groups:[], last:null, overrides:{}, piccolo:false};
let saved = {};
try {
  saved = JSON.parse(localStorage.getItem(storageKey) || "{}") ?? {};
} catch {}
const {_supabase: syncMeta, ...savedGame} = saved;
let data = normalize(savedGame);
function normalize(snapshot) {
  const state = {...defaults, ...snapshot};
  if (state.active && !state.active.scoringVersion) {
    state.active = {...state.active, scoringVersion:1, overrides:state.overrides, piccolo:false};
  }
  return state;
}
let page = "home";
let draft = null;
let score = null;
let swap = null;
let viewedGame = null;
let fromRules = "home";
let toastTimer;
let restoreFocus;
const suits = ["♠", "♥", "♣", "♦", "★"];
const steps = [
  {title:"Compose ta table", copy:"Place quatre ou cinq joueurs et désigne le premier donneur.", icon:"users"},
  {title:"Encode chaque donne", copy:"Choisis le contrat et les plis. Le carnet calcule les points.", icon:"cards"},
  {title:"Suis le classement", copy:"Consulte les scores, corrige une donne et retrouve tes parties.", icon:"scores"},
];
const icons = {
  plus:'<path d="M12 5v14M5 12h14"/>',
  arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
  back:'<path d="m14 6-6 6 6 6"/>',
  clock:'<path d="M3 12a9 9 0 1 1 2.5 6.3M3 17v-5h5m4-4v4l3 2"/>',
  users:'<circle cx="9" cy="7" r="3"/><path d="M3 20v-2a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v2m1-16a3 3 0 0 1 0 6m4 10v-2a5 5 0 0 0-3-4"/>',
  cards:'<rect x="8" y="3" width="11" height="16" rx="2"/><path d="M5 7H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h10m-.5-14 2.5 4-2.5 4-2.5-4Z"/>',
  scores:'<path d="M4 20h16M6 16v-4m6 4V5m6 11V8"/><circle cx="12" cy="5" r="1"/>',
  dealer:'<rect x="5" y="7" width="12" height="14" rx="2"/><path d="M8 4h10a2 2 0 0 1 2 2v11M11 11l2 3-2 3-2-3Z"/>',
  pause:'<path d="M9 5v14M15 5v14"/>',
  first:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
  swap:'<path d="M4 8h15m-4-4 4 4-4 4m5 4H5m4-4-4 4 4 4"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
};
const icon = name => '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' + icons[name] + '</svg>';
const escape = value => String(value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
const avatar = index => `<span class="avatar tone${index}" aria-hidden="true">${suits[index]}</span>`;
const back = (action, label = "Accueil") => `<button class="back" data-action="${action}">${icon("back")}${label}</button>`;
const head = (tag, title, desc) => `<div class="page-head"><span class="eyebrow">${tag}</span><h1>${title}</h1><p>${desc}</p></div>`;
const signed = value => value > 0 ? "+" + value : value < 0 ? "−" + Math.abs(value) : "0";
const color = value => value > 0 ? "pos" : value < 0 ? "neg" : "";
const totals = game => game.rounds.reduce((values, round) => values.map((value, index) => value + round.values[index]), game.players.map(() => 0));
const plural = n => n > 1 ? "s" : "";
const formatDate = value => new Intl.DateTimeFormat("fr-BE", {dateStyle:"medium", timeStyle:"short"}).format(new Date(value));
const empty = (suit, title, copy) => `<div class="empty surface"><span class="step-mark" aria-hidden="true">${suit}</span><strong>${title}</strong><p>${copy}</p></div>`;

function tell(message) {
  toast.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {toast.textContent = "";}, 3200);
}
const storageStatus = document.querySelector("#cloud-status");
const storageAction = document.querySelector("#cloud-action");
let storageMode;
const cloud = document.body.dataset.storage === "supabase" ? createCloudStore({
  authorize:window.whistAuth?.getAccessToken,
  read:() => data,
  write(snapshot, meta) {
    if (snapshot !== data) data = normalize(snapshot);
    persist({...data,_supabase:meta});
  },
  report(message, action) {
    storageStatus.textContent = message;
    storageMode = action;
    storageAction.hidden = !action;
    storageAction.textContent = action === "resolve" ? "Voir les options" : "Réessayer";
  },
  hasLocal:state => !!(state.active || state.last || state.piccolo || state.history.length ||
    state.groups.length || Object.keys(state.overrides).length),
  revision:syncMeta?.revision ?? null,
  dirty:syncMeta?.dirty === true,
}) : null;

function persist(snapshot) {
  try { localStorage.setItem(storageKey, JSON.stringify(snapshot)); }
  catch { tell("Le navigateur ne peut pas sauvegarder cette partie."); }
}
function save() {
  if (cloud) cloud.save();
  else persist(data);
}
function go(next) {
  page = next;
  render();
  window.scrollTo(0, 0);
  const heading = app.querySelector("h1");
  if (heading) {
    heading.tabIndex = -1;
    heading.focus({preventScroll:true, focusVisible:false});
  }
}
function render() {
  const screens = {home, setup, table, board, history, archive, rules, groups};
  app.innerHTML = screens[page]();
  document.querySelectorAll("[data-nav]").forEach(button => {
    if (button.dataset.nav === page) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
}
function home() {
  const game = data.active;
  const main = game
    ? `<button class="btn primary" data-action="resume">Reprendre la partie ${icon("arrow")}</button><button class="btn secondary" data-action="new">${icon("plus")} Nouvelle partie</button>`
    : `<button class="btn primary" data-action="new">${icon("plus")} Nouvelle partie</button><button class="btn secondary" data-action="history">${icon("clock")} Historique</button>`;
  return `<section class="hero"><div class="wrap hero-inner"><div class="hero-copy">
    <div class="hero-labels"><span class="eyebrow">Whist belge</span><span class="table-badge">4 ou 5 joueurs</span></div>
    <h1>Carnet de <em>Whist<span>.</span></em></h1>
    <p>La feuille de score de tes soirées whist. Encode les plis, le carnet compte les points.</p>
    <div class="actions">${main}</div>
    ${game ? `<p class="resume-note"><span></span>Partie en cours · Tour ${game.rounds.length + 1} · ${game.players.length} joueurs</p>` : ""}
  </div><img class="hero-art" src="cards.svg" width="620" height="520" alt=""></div></section>
  <section class="wrap section"><div class="section-heading">
    <div><span class="eyebrow">Autour de la table</span><h2>La partie en trois temps</h2></div>
    <button class="text-action" data-action="groups">${icon("users")} Groupes de joueurs ${icon("arrow")}</button>
  </div>
    <div class="steps">${steps.map((step, index) => `<article class="step"><div class="step-top"><span class="step-mark">${icon(step.icon)}</span><span class="step-number" aria-hidden="true">0${index + 1}</span></div><h3>${step.title}</h3><p>${step.copy}</p></article>`).join("")}</div>
  </section>`;
}
function setup() {
  const count = draft.players.length;
  return `<section class="wrap narrow page setup-page">${back("home")}${head("Nouvelle partie · 1 sur 2", "Qui joue ?", "Choisis le nombre de joueurs, puis saisis leurs prénoms.")}
    <form id="setup-form">
      <fieldset class="player-count"><legend>Nombre de joueurs</legend><div class="count-options">
        ${[4, 5].map(size => `<label><input type="radio" name="size" value="${size}" ${count === size ? "checked" : ""}><span>${size} joueurs</span></label>`).join("")}
      </div>${count === 5 ? '<p class="hint">Le joueur après le donneur est mort à chaque donne.</p>' : ""}</fieldset>
      <div class="setup-grid">${draft.players.map((name, index) => `<div class="player-input surface">
        ${avatar(index)}
        <label><span>Joueur ${index + 1}</span><input class="player-name" name="player${index}" maxlength="24"
          placeholder="Prénom ou surnom" autocomplete="off" autocapitalize="words" autocorrect="off" spellcheck="false"
          enterkeyhint="${index < count - 1 ? "next" : "go"}" required value="${escape(name)}"></label>
      </div>`).join("")}</div>
      <p class="error" id="setup-error" hidden>Utilise un nom différent pour chaque joueur.</p>
      <div class="page-actions"><button class="quiet" type="button" data-action="groups">${icon("users")} Groupes de joueurs</button><button class="btn primary" type="submit">Placer les joueurs ${icon("arrow")}</button></div>
    </form></section>`;
}
function table() {
  const {dealer, dead, first} = rolesFor(draft);
  return `<section class="wrap narrow page">${back("setup", "Prénoms")}${head("Nouvelle partie · 2 sur 2", "À table", "Place les joueurs dans le sens horaire, puis désigne le premier donneur.")}
    <div class="table-felt" data-player-count="${draft.players.length}">${draft.players.map((name, index) => `<article class="seat ${index === dealer ? "is-dealer" : ""} ${index === dead ? "is-dead" : ""} ${swap === index ? "is-swapping" : ""}">
      ${avatar(index)}<strong>${escape(name)}</strong><small>${index === dealer ? "Donneur" : index === dead ? "Mort" : index === first ? "Parle en premier" : "Place " + (index + 1)}</small>
      <div class="seat-controls"><button aria-label="${escape(name)} comme donneur" aria-pressed="${index === dealer}" data-action="dealer" data-value="${index}">${icon("dealer")}</button><button aria-label="Échanger la place de ${escape(name)}" aria-pressed="${swap === index}" data-action="swap" data-value="${index}">${icon("swap")}</button></div>
    </article>`).join("")}<span class="table-center" aria-hidden="true">♠</span></div>
    <div class="page-actions"><small>${swap === null ? "⇄ Échanger deux places" : "Choisis la deuxième place à échanger."}</small><button class="btn primary" data-action="start">Lancer la partie ${icon("arrow")}</button></div>
  </section>`;
}
function roleStrip(game, index) {
  const {dealer, dead, first} = rolesFor(game, index);
  return `<div class="role-strip">
    <span class="role">${icon("dealer")}<span>Donneur<strong>${escape(game.players[dealer])}</strong></span></span>
    ${dead === null ? "" : `<span class="role dead-role">${icon("pause")}<span>Mort<strong>${escape(game.players[dead])}</strong></span></span>`}
    <span class="role">${icon("first")}<span>Parle en premier<strong>${escape(game.players[first])}</strong></span></span>
  </div>`;
}
function board() {return gameView(data.active, false);}
function archive() {return gameView(viewedGame, true);}
function scoreTile(name, seat, points, roles) {
  let role = "";
  let label = "";
  if (seat === roles?.dealer) { role = "dealer"; label = "Donneur"; }
  else if (seat === roles?.dead) { role = "pause"; label = "Mort"; }
  else if (seat === roles?.first) { role = "first"; label = "Parle en premier"; }
  return `<article class="score-tile surface tone${seat}" ${role ? `data-role="${role}"` : ""}>
    <div class="tile-player">${avatar(seat)}<span class="tile-name" title="${escape(name)}">${escape(name)}</span></div>
    <strong class="tile-score ${color(points)}">${signed(points)}</strong>
    ${roles ? `<div class="tile-role">${role ? `<span title="${label}">${icon(role)}${role === "first" ? '<span class="role-first-long">Parle en premier</span><span class="role-first-short" aria-hidden="true">1er</span>' : label}</span>` : ""}</div>` : ""}
  </article>`;
}
function gameView(game, finished) {
  const sums = totals(game);
  const roles = finished ? null : rolesFor(game, game.rounds.length);
  const leaders = game.players.filter((_, index) => sums[index] === Math.max(...sums));
  const heading = finished ? "Partie terminée" : "Tour " + (game.rounds.length + 1);
  return `<section class="board-hero"><div class="wrap">${finished ? back("history", "Historique") : back("home")}<div class="board-top">
    <div><span class="eyebrow">${finished ? formatDate(game.finished) : "Feuille de score · " + game.players.length + " joueurs"}</span><h1>${heading}</h1></div>
    ${finished ? `<div class="board-leader">${icon("scores")}<span>${leaders.length > 1 ? "En tête ex æquo" : "En tête"}<strong>${leaders.map(escape).join(", ")}</strong></span></div>` : '<div class="board-emblem" aria-hidden="true"><span>♦</span><span>♠</span></div>'}
  </div></div></section>
  <section class="wrap board-body" data-player-count="${game.players.length}">
    <div class="round-heading score-heading"><h2>Scores cumulés</h2><small>Points</small></div>
    <div class="score-tiles">${game.players.map((name, seat) => scoreTile(name, seat, sums[seat], roles)).join("")}</div>
    <div class="round-heading"><h2>Donnes</h2><small>${game.rounds.length} au total</small></div>
    ${game.rounds.length ? roundTable(game, finished) : empty("♣", "Aucun score pour le moment", "Jouez la première donne puis ajoutez son score.")}
    ${finished ? "" : `<div class="board-actions"><button class="btn primary" data-action="add-score">${icon("plus")} Ajouter un score</button><button class="btn secondary" data-action="finish" ${game.rounds.length ? "" : "disabled"}>Terminer la partie</button></div>`}
  </section>`;
}
function roundTable(game, finished) {
  return `<div class="surface score-table-wrap"><table class="score-table" aria-label="Points par donne"><thead><tr><th scope="col">Contrat</th>${game.players.map((name, seat) => `<th scope="col">${avatar(seat)}<span>${escape(name)}</span></th>`).join("")}</tr></thead>
  <tbody>${game.rounds.map((round, index) => {
    const {dead} = rolesFor(game, index);
    const played = round.entries.map(entry => {
      const name = escape(game.players[entry.seat]);
      if (byId[round.contract].outcomeOnly) {
        const won = declarationWon(byId[round.contract], entry, round.entries.length === 2 ? entry.tricks : round.tricks);
        return name + " · " + (won ? "Gagné" : "Perdu");
      }
      return round.tricks === null ? name + " (" + entry.tricks + ")" : name;
    }).join(" / ");
    const result = byId[round.contract].outcomeOnly || round.tricks === null ? played : played + " · " + round.tricks + " pli" + plural(round.tricks);
    const info = `${escape(byId[round.contract].label)}${round.doubled ? " ×2" : ""}<small>Tour ${index + 1} · ${result}</small>`;
    return `<tr><td>${finished ? info : `<button data-action="edit-score" data-value="${index}" title="Modifier le tour ${index + 1}">${info}</button>`}</td>${round.values.map((value, seat) => `<td class="${seat === dead ? "dead-cell" : color(value)}">${signed(value)}${seat === dead ? "<small>Mort</small>" : ""}</td>`).join("")}</tr>`;
  }).join("")}</tbody></table></div>`;
}
function history() {
  return `<section class="wrap narrow page">${back("home")}${head("Carnet de parties", "Historique", "Retrouve le classement et les donnes de tes parties terminées.")}
    ${data.history.length ? `<div class="list">${data.history.map((game, index) => `<article class="list-item surface"><div><strong>${game.players.map(escape).join(" · ")}</strong><small>${formatDate(game.finished)} · ${game.rounds.length} donne${plural(game.rounds.length)}</small></div><button class="btn secondary" data-action="view-game" data-value="${index}">Voir ${icon("arrow")}</button></article>`).join("")}</div>` : empty("♥", "Aucune partie terminée", "Tes parties apparaîtront ici à la fin du jeu.")}
  </section>`;
}
function groups() {
  return `<section class="wrap narrow page">${draft ? back("setup", "Prénoms") : back("home")}${head("Les habitués", "Groupes de joueurs", "Retrouve tes tables habituelles sans ressaisir les noms.")}
    ${data.groups.length ? `<div class="list">${data.groups.map((group, index) => `<article class="list-item surface"><div><strong>${escape(group.name)}</strong><small>${group.players.map(escape).join(" · ")}</small></div><button class="btn secondary" data-action="use-group" data-value="${index}">Choisir ${icon("arrow")}</button></article>`).join("")}</div>` : empty("♦", "Aucun groupe enregistré", "Tu peux enregistrer les joueurs que tu viens de saisir ou ceux de ta dernière partie.")}
    <div class="page-actions">${data.last ? `<button class="btn secondary" data-action="last-group">Reprendre les derniers joueurs</button>` : ""}<button class="btn primary" data-action="save-group" ${validNames(draft?.players) || data.last ? "" : "disabled"}>Enregistrer un groupe</button></div>
  </section>`;
}
const ruleValue = (contract, field) => data.overrides[contract.id]?.[field] ?? contract[field];
function ruleInput(items, fields, sign, label) {
  const name = items.map(item => item.id).join(",") + ":" + fields.join(",");
  const disabled = items[0].id === "piccolo" && !data.piccolo ? "disabled" : "";
  return `<label class="rule-input"><span aria-hidden="true">${sign}</span><input aria-label="${label}" type="number" min="0" max="9999" step="1" inputmode="numeric" required ${disabled} name="${name}" value="${ruleValue(items[0], fields[0])}"></label>`;
}
function ruleRow(contract) {
  const {label, target, bonus, id} = contract;
  const sharedBase = bonus != null && ruleValue(contract, "win") === ruleValue(contract, "loss");
  const sharedStep = bonus != null && ruleValue(contract, "bonus") === ruleValue(contract, "penalty");
  const base = ruleInput([contract], sharedBase ? ["win","loss"] : ["win"], sharedBase ? "±" : "+", label + " · Points");
  const loss = sharedBase ? "" : ruleInput([contract], ["loss"], "−", label + " · Perdu");
  let step = "";
  if (sharedStep) step = ruleInput([contract], ["bonus","penalty"], "±", label + " · Par pli");
  else if (bonus != null) {
    step = ruleInput([contract], ["bonus"], "+", label + " · Pli en plus") +
      ruleInput([contract], ["penalty"], "−", label + " · Pli manquant");
  }
  const goal = target === 0 ? "Pas de pli" : target + " pli" + plural(target);
  return `<tr class="${id === "piccolo" ? "piccolo-row" : ""}"><th scope="row">${label}<small>${goal}</small></th><td>${base}</td><td>${step}</td><td>${loss}</td></tr>`;
}
function capotRow(label, items) {
  return `<tr><th scope="row">${label}<small>13 plis</small></th><td>${ruleInput(items, ["capot"], "+", label + " · Points")}</td><td></td><td></td></tr>`;
}
function rules() {
  const duos = contracts.filter(contract => contract.mode === "duo");
  const duoCapots = duos.every(contract => ruleValue(contract, "capot") === ruleValue(duos[0], "capot"))
    ? capotRow("Capot", duos)
    : duos.map(contract => capotRow("Capot · " + contract.label, [contract])).join("");
  const groups = [
    duos.map(ruleRow).join("") + duoCapots,
    contracts.filter(contract => contract.mode === "solo").map(ruleRow).join("") +
      ruleRow(byId.trou) + capotRow("Capot sur trou", [byId.trou]) +
      [byId.small, byId.solo8small, byId.piccolo].map(ruleRow).join(""),
    [byId.ab9, byId.ab10, byId.ab11, byId.large, byId.largetrou, byId.smallslam, byId.slam].map(ruleRow).join(""),
  ];
  return `<section class="wrap narrow page">${back("rules-back", "Retour")}${head("Règles de la table", "Barème", "Modifie la grille de points pour tes prochaines parties.")}
    <form class="rule-list" id="rules-form">
    <div class="rule-option surface">
      <label for="piccolo"><strong>Piccolo</strong><small>Contrat à exactement un pli.</small></label>
      <input type="checkbox" role="switch" id="piccolo" name="piccolo" ${data.piccolo ? "checked" : ""}>
    </div>
    <p class="body-copy">Les points s’appliquent à chaque joueur du duo ou au déclarant en solo. Le signe ± indique la valeur de base en gain et en perte. Pour un Solo 6, 7 ou 8, les bonus s’arrêtent au huitième pli.</p>
    <div class="rule-table-wrap surface"><table class="rule-table" aria-label="Grille de points">
      <thead><tr><th scope="col">Contrat</th><th scope="col">Points</th><th scope="col">Par pli</th><th scope="col">Si perdu</th></tr></thead>
      ${groups.map(rows => `<tbody>${rows}</tbody>`).join("")}
    </table></div>
    <div class="page-actions"><button class="btn secondary" type="button" data-action="reset-rules">Valeurs par défaut</button><button class="btn primary" type="submit">Enregistrer le barème</button></div></form>
  </section>`;
}
function showDialog(html) {
  if (!dialog.open) restoreFocus = document.activeElement;
  dialog.innerHTML = html;
  if (!dialog.open) dialog.showModal();
}
function dialogHead(tag, title) {
  return `<header class="dialog-head"><div><span class="eyebrow">${tag}</span><h2 id="dialog-title">${title}</h2></div><button class="dialog-close" data-action="close" aria-label="Fermer">×</button></header>`;
}
dialog.addEventListener("close", () => {
  if (restoreFocus?.isConnected) restoreFocus.focus();
  restoreFocus = null;
});
function ask(title, copy, action, label) {
  showDialog(`${dialogHead("Confirmation", title)}<div class="dialog-main"><p class="body-copy">${copy}</p></div><div class="dialog-actions"><button class="btn secondary" data-action="close">Annuler</button><button class="btn primary" data-action="${action}">${label}</button></div>`);
}
function openScore(index = null) {
  const round = index === null ? null : data.active.rounds[index];
  score = round ? {index, mode:byId[round.contract].mode, contract:round.contract, entries:round.entries.map(entry => ({...entry})), tricks:round.tricks, doubled:round.doubled, rules:{...round.rules}}
    : {index, mode:"duo", contract:null, entries:[], tricks:null, doubled:false, rules:null};
  if (round && byId[round.contract].outcomeOnly) {
    score.entries = round.entries.map(entry => ({seat:entry.seat,
      won:declarationWon(byId[round.contract], entry, round.entries.length === 2 ? entry.tricks : round.tricks)}));
    score.tricks = null;
  }
  renderScore();
}
function scoreValues() {
  const game = data.active;
  const contract = byId[score.contract];
  if (!contract || score.entries.length < contract.players) return null;
  const individual = contract.target === 0 && score.entries.length === 2;
  if (contract.outcomeOnly) {
    if (score.entries.some(entry => typeof entry.won !== "boolean")) return null;
  } else if (individual) {
    if (score.entries.some(entry => entry.tricks === null)) return null;
    const count = score.entries.reduce((sum, entry) => sum + entry.tricks, 0);
    if (count > (contract.id === "small" ? 12 : 13)) return null;
  } else if (score.tricks === null) return null;
  return calculateRound(game, score.index ?? game.rounds.length, contract, score.entries, score.tricks, score.doubled, score.rules ?? game.overrides[contract.id]);
}
function trickPicker(selected, max, target, seat = "all") {
  return `<div class="tricks">${Array.from({length:max + 1}, (_, n) => `<button aria-label="${n} pli${plural(n)}${seat === "all" ? "" : " pour " + escape(data.active.players[seat])}" aria-pressed="${n === selected}" class="${n === target ? "target" : ""}" data-action="tricks" data-value="${n}" data-seat="${seat}">${n}</button>`).join("")}</div>`;
}
function outcomePicker(entry) {
  return `<div class="trick-row"><p class="hint">${escape(data.active.players[entry.seat])}</p><div class="toggle outcome-picker" role="group" aria-label="Résultat de ${escape(data.active.players[entry.seat])}">${[true,false].map(won => `<button aria-pressed="${entry.won === won}" data-action="outcome" data-value="${Number(won)}" data-seat="${entry.seat}">${won ? "Gagné" : "Perdu"}</button>`).join("")}</div></div>`;
}
function renderScore() {
  const game = data.active;
  const contract = byId[score.contract];
  const index = score.index ?? game.rounds.length;
  const {dead} = rolesFor(game, index);
  const values = scoreValues();
  const individual = contract?.target === 0 && score.entries.length === 2;
  const active = dialog.open ? document.activeElement : null;
  const focusData = active?.dataset ? {...active.dataset} : null;
  const scroll = dialog.scrollTop;
  const max = contract?.id === "small" ? 12 : 13;
  const entriesTotal = score.entries.reduce((sum, entry) => sum + (entry.tricks ?? 0), 0);
  const playerHint = contract?.multiple ? "Un ou deux déclarants" : contract?.players === 2 ? "Deux partenaires" : contract ? "Un déclarant" : "Choisis d’abord le contrat";
  showDialog(`${dialogHead("Encodage de la donne", "Score du tour " + (index + 1))}
    <div class="dialog-main score-entry">${roleStrip(game, index)}
      <div class="entry-grid">
      <fieldset><legend><span aria-hidden="true">01</span> Contrat</legend><div class="mode-tabs">${Object.entries(modes).map(([key, mode]) => `<button aria-pressed="${key === score.mode}" data-action="mode" data-value="${key}"><span aria-hidden="true">${mode.suit}</span>${mode.name}</button>`).join("")}</div>
      <div class="chips" data-mode="${score.mode}">${contracts.filter(item => item.mode === score.mode && (item.id !== "piccolo" || game.piccolo)).map(item => `<button aria-pressed="${item.id === score.contract}" data-action="contract" data-value="${item.id}">${item.label}</button>`).join("")}</div></fieldset>
      <fieldset><legend><span aria-hidden="true">02</span> Joueurs actifs</legend><p class="hint player-hint">${playerHint}</p><div class="pick-players">
      ${game.players.map((name, seat) => seat === dead ? "" : `<button ${contract ? "" : "disabled"} aria-label="${escape(name)}" aria-pressed="${score.entries.some(entry => entry.seat === seat)}" data-action="player" data-value="${seat}">${avatar(seat)}<span class="pick-name">${escape(name)}</span></button>`).join("")}</div></fieldset>
      </div>
      ${contract ? `<fieldset><legend><span aria-hidden="true">03</span> ${contract.outcomeOnly ? "Résultat du contrat" : "Plis gagnés"}</legend>${contract.outcomeOnly
        ? (score.entries.length ? score.entries.map(outcomePicker).join("") : '<p class="hint">Sélectionne le ou les déclarants pour encoder leur résultat.</p>') : individual
        ? score.entries.map(entry => `<div class="trick-row"><p class="hint">${escape(game.players[entry.seat])}</p>${trickPicker(entry.tricks,max,0,entry.seat)}</div>`).join("")
        : trickPicker(score.tricks,max,contract.target)}
        ${!contract.outcomeOnly && individual && entriesTotal > max ? `<p class="error" role="alert">Le total des deux joueurs dépasse ${max} plis.</p>` : ""}
      </fieldset>` : ""}
      <div class="double-row"><span id="double-label">Donne doublée</span><div class="toggle" role="group" aria-labelledby="double-label">${[false,true].map(option => `<button aria-pressed="${score.doubled === option}" data-action="double" data-value="${Number(option)}">${option ? "Oui ×2" : "Non"}</button>`).join("")}</div></div>
    </div>
    <div class="score-footer" data-player-count="${game.players.length}">
      ${values ? `<div class="score-preview" aria-label="Aperçu des points">${values.map((value, seat) => `<span class="${seat === dead ? "dead-cell" : color(value)}"><small>${escape(game.players[seat])}</small>${signed(value)}${seat === dead ? "<small>Mort</small>" : ""}</span>`).join("")}</div>` : ""}
      <div class="dialog-actions"><button class="btn secondary" data-action="close">Annuler</button><button class="btn primary" data-action="confirm-score" ${values ? "" : "disabled"}>${icon("check")}${score.index === null ? "Confirmer" : "Enregistrer"}</button></div>
    </div>`);
  if (focusData?.action) {
    const same = Array.from(dialog.querySelectorAll("[data-action]")).find(button =>
      button.dataset.action === focusData.action && button.dataset.value === focusData.value && button.dataset.seat === focusData.seat);
    same?.focus({preventScroll:true});
  }
  dialog.scrollTop = scroll;
}
function validNames(names) {
  return [4, 5].includes(names?.length) && names.every(name => name.trim()) && new Set(names.map(name => name.trim().toLocaleLowerCase("fr-BE"))).size === names.length;
}
function newDraft(names = ["", "", "", ""]) {
  draft = {players:[...names], dealer:0};
  swap = null;
  go("setup");
}
function changePlayer(seat) {
  const contract = byId[score.contract];
  const existing = score.entries.find(entry => entry.seat === seat);
  if (existing) {
    score.entries = score.entries.filter(entry => entry !== existing);
    if (contract.target === 0 && score.entries.length === 1) score.tricks = score.entries[0].tricks;
  } else if (contract.players === 1 && !contract.multiple) {
    score.entries = [{seat, tricks:null}];
  } else if (score.entries.length < 2) {
    if (contract.target === 0 && score.entries.length === 1) score.entries[0].tricks = score.tricks;
    score.entries.push({seat, tricks:null});
  }
}
function recordScore() {
  const values = scoreValues();
  if (!values) return;
  const {index, contract, entries, tricks, doubled} = score;
  const rules = {...(score.rules ?? data.active.overrides[contract])};
  const round = {contract, entries, tricks:byId[contract].target === 0 && entries.length === 2 ? null : tricks, doubled, rules, values};
  if (index === null) data.active.rounds.push(round);
  else data.active.rounds[index] = round;
  save();
  dialog.close();
  render();
  const button = app.querySelector(index === null ? '[data-action="add-score"]' : '[data-action="edit-score"][data-value="' + index + '"]');
  button?.focus({preventScroll:true});
  if (index === null) button?.scrollIntoView({block:"nearest"});
  tell(index === null ? "Score enregistré." : "Donne corrigée.");
}
function launchGame() {
  data.active = {players:[...draft.players], dealer:draft.dealer, rounds:[], scoringVersion:2, overrides:data.overrides, piccolo:data.piccolo};
  data.last = [...draft.players];
  draft = null;
  save();
  if (dialog.open) dialog.close();
  go("board");
}
const actions = {
  home() { draft = null; go("home"); },
  new() { newDraft(); },
  resume() { go("board"); },
  history() { go("history"); },
  "view-game"(value) { viewedGame = data.history[Number(value)]; go("archive"); },
  rules() { if (page !== "rules") fromRules = page; go("rules"); },
  "rules-back"() { go(fromRules); },
  "reset-rules"() { ask("Rétablir le barème ?", "Les nouvelles parties utiliseront le barème par défaut.", "confirm-reset", "Rétablir"); },
  "confirm-reset"() { data.overrides = {}; data.piccolo = false; save(); dialog.close(); render(); tell("Barème rétabli."); },
  setup() { swap = null; go("setup"); },
  dealer(value) { draft.dealer = Number(value); render(); app.querySelector('[data-action="dealer"][data-value="' + value + '"]')?.focus(); },
  swap(value) {
    const seat = Number(value);
    if (swap === null) swap = seat;
    else {
      if (swap !== seat) [draft.players[swap], draft.players[seat]] = [draft.players[seat], draft.players[swap]];
      swap = null;
    }
    render();
    app.querySelector('[data-action="swap"][data-value="' + value + '"]')?.focus();
  },
  start() {
    if (data.active) ask("Remplacer la partie en cours ?", "Cette action efface les donnes de la partie en cours.", "confirm-start", "Remplacer et lancer");
    else launchGame();
  },
  "confirm-start"() { launchGame(); },
  groups() { go("groups"); },
  "use-group"(value) { newDraft(data.groups[Number(value)].players); },
  "last-group"() { newDraft(data.last); },
  "save-group"() {
    showDialog(`${dialogHead("Groupes de joueurs", "Enregistrer un groupe")}<form id="group-form">
      <div class="dialog-main"><label>Nom du groupe<input name="group" required maxlength="32" autofocus placeholder="Ex. La table du vendredi"></label><p class="error" hidden>Choisis un nom de groupe différent.</p></div>
      <div class="dialog-actions"><button class="btn secondary" data-action="close" type="button">Annuler</button><button class="btn primary" type="submit">Enregistrer</button></div></form>`);
  },
  "add-score"() { openScore(); },
  "edit-score"(value) { openScore(Number(value)); },
  close() { dialog.close(); },
  mode(value) {
    if (value === score.mode) return;
    Object.assign(score, {mode:value, contract:null, entries:[], tricks:null, rules:null});
    renderScore();
  },
  contract(value) {
    if (value === score.contract) return;
    Object.assign(score, {contract:value, entries:[], tricks:null, rules:null});
    renderScore();
  },
  player(value) { changePlayer(Number(value)); renderScore(); },
  outcome(value, seat) {
    score.entries.find(entry => entry.seat === Number(seat)).won = value === "1";
    renderScore();
  },
  tricks(value, seat) {
    if (seat === "all") score.tricks = Number(value);
    else score.entries.find(entry => entry.seat === Number(seat)).tricks = Number(value);
    renderScore();
  },
  double(value) { score.doubled = value === "1"; renderScore(); },
  "confirm-score"() { recordScore(); },
  finish() { ask("Terminer la partie ?", "Les scores et les donnes seront consultables dans l’historique.", "confirm-finish", "Terminer la partie"); },
  "confirm-finish"() {
    viewedGame = {...data.active, finished:Date.now()};
    data.history.unshift(viewedGame);
    data.active = null;
    save();
    dialog.close();
    go("archive");
  },
};
document.addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  if (button && !button.disabled) actions[button.dataset.action]?.(button.dataset.value, button.dataset.seat);
});

const compactSetup = window.matchMedia("(max-width:650px)");
let playerFocusTimer;
function keepPlayerInputVisible() {
  if (!compactSetup.matches || !document.activeElement?.matches(".player-name")) return;
  clearTimeout(playerFocusTimer);
  playerFocusTimer = setTimeout(() => {
    const input = document.activeElement;
    if (!compactSetup.matches || !input?.matches(".player-name")) return;

    const viewport = window.visualViewport;
    const height = viewport?.height ?? window.innerHeight;
    const offset = viewport?.offsetTop ?? 0;
    // Reserve room for the preview controls above and below the form.
    const safeTop = offset + Math.min(110, height * .22);
    const safeBottom = offset + height - Math.min(145, height * .26);
    const rect = input.getBoundingClientRect();
    if (rect.top >= safeTop && rect.bottom <= safeBottom) return;

    const distance = (rect.top + rect.bottom - safeTop - safeBottom) / 2;
    window.scrollBy(0, distance);
  }, 90);
}
app.addEventListener("focusin", keepPlayerInputVisible);
window.visualViewport?.addEventListener("resize", keepPlayerInputVisible);
window.addEventListener("resize", keepPlayerInputVisible);
app.addEventListener("keydown", event => {
  const input = event.target;
  if (!compactSetup.matches || event.key !== "Enter" || event.isComposing || !input.matches(".player-name")) return;
  event.preventDefault();

  const form = input.form;
  const index = Number(input.name.slice("player".length));
  const next = form.elements.namedItem("player" + (index + 1));
  if (next) next.focus({preventScroll:true});
  else form.requestSubmit();
});
app.addEventListener("input", event => {
  if (event.target.form?.id === "setup-form" && event.target.name.startsWith("player")) {
    draft.players[Number(event.target.name.slice(6))] = event.target.value;
    app.querySelector("#setup-error").hidden = true;
  }
});
app.addEventListener("change", event => {
  if (event.target.form?.id === "setup-form" && event.target.name === "size") {
    const count = Number(event.target.value);
    if (count === 5) draft.players.push(draft.fifthPlayer ?? "");
    else draft.fifthPlayer = draft.players.pop();
    if (draft.dealer >= count) draft.dealer = 0;
    render();
    app.querySelector('[name="size"]:checked').focus();
    return;
  }
  if (event.target.id !== "piccolo") return;
  app.querySelectorAll(".piccolo-row input").forEach(input => {
    input.disabled = !event.target.checked;
  });
});
document.addEventListener("submit", event => {
  const form = event.target;
  const fields = new FormData(form);
  switch (form.id) {
    case "setup-form": {
      event.preventDefault();
      const names = draft.players.map((_, index) => fields.get("player" + index).trim());
      if (!validNames(names)) {
        app.querySelector("#setup-error").hidden = false;
        return;
      }
      draft.players = names;
      go("table");
      break;
    }
    case "rules-form": {
      event.preventDefault();
      const overrides = !fields.has("piccolo") && data.overrides.piccolo
        ? {piccolo:data.overrides.piccolo}
        : {};
      for (const [key, value] of fields) {
        if (key === "piccolo") continue;
        const [ids, fieldNames] = key.split(":");
        const points = Number(value);
        for (const id of ids.split(",")) {
          for (const field of fieldNames.split(",")) {
            if (points !== byId[id][field]) (overrides[id] ??= {})[field] = points;
          }
        }
      }
      data.overrides = overrides;
      data.piccolo = fields.has("piccolo");
      save();
      tell("Barème enregistré.");
      break;
    }
    case "group-form": {
      event.preventDefault();
      const name = fields.get("group").trim();
      if (!name || data.groups.some(group => group.name.toLocaleLowerCase("fr-BE") === name.toLocaleLowerCase("fr-BE"))) {
        form.querySelector(".error").hidden = false;
        return;
      }
      const players = (validNames(draft?.players) ? draft.players : data.last).map(player => player.trim());
      data.groups.push({name, players});
      save();
      dialog.close();
      render();
      tell("Groupe enregistré.");
      break;
    }
  }
});
async function reloadCloud(replace = false) {
  await cloud.load({replace});
  go("home");
}

storageAction.addEventListener("click", () => {
  if (storageMode !== "resolve") {
    void reloadCloud();
    return;
  }
  ask("Deux versions du carnet", "Le carnet Supabase contient des données différentes. Tu peux télécharger les données de cet appareil, puis charger la version Supabase.", "accept-cloud", "Télécharger et charger");
});
actions["accept-cloud"] = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type:"application/json"}));
  const download = document.createElement("a");
  download.href = url;
  download.download = "carnet-whist-sauvegarde.json";
  download.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  dialog.close();
  void reloadCloud(true);
};

if (cloud) {
  app.textContent = "Chargement du carnet…";
  void cloud.load().then(render);
} else render();
