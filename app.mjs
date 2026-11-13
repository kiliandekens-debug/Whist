import {createCloudStore, canonical} from "./cloud.mjs";
import {modes, contracts, byId, rolesFor, calculateRound, declarationWon} from "./score.mjs";
import {playerKey, findPlayer, matchingPlayers, migratePlayers, registerPlayer, renamePlayer, playerStatistics, overallStatistics} from "./players.mjs";

const app = document.querySelector("#app");
const dialog = document.querySelector("#dialog");
const toast = document.querySelector("#toast");
const storageKey = document.body.dataset.storageKey || "carnet-whist-v1";
const defaults = {active:null, history:[], groups:[], last:null, overrides:{}, piccolo:false, roster:[], lastPlayerIds:null};
// A follow link shows one notebook read-only: nothing is read from or written to this device.
const viewer = document.body.dataset.viewer === "true";
const watched = state => ({active:state?.active ?? null, history:state?.last ? [state.last] : []});
let saved = {};
if (!viewer) try {
  saved = JSON.parse(localStorage.getItem(storageKey) || "{}") ?? {};
} catch {}
const {_supabase: syncMeta, ...savedGame} = saved;
let data = normalize(viewer ? watched(window.whistViewer?.state) : savedGame);
function normalize(snapshot) {
  const state = {...defaults, ...snapshot};
  if (state.active && !state.active.scoringVersion) {
    state.active = {...state.active, scoringVersion:1, overrides:state.overrides, piccolo:false};
  }
  const gameIds = new Set(state.history.map(game => game.id).filter(Boolean));
  state.history = state.history.map(game => {
    // Games archived before the barème update must keep the scoring they were played with.
    if (!game.scoringVersion) game = {...game, scoringVersion:1, overrides:game.overrides ?? {}, piccolo:false};
    else if (!game.overrides) game = {...game, overrides:{}};
    if (game.id) return game;
    const base = "partie-" + game.finished;
    let id = base;
    for (let suffix = 2; gameIds.has(id); suffix++) id = base + "-" + suffix;
    gameIds.add(id);
    return {...game,id};
  });
  return migratePlayers(state);
}
const pagePaths = {
  home:"/accueil", setup:"/nouvelle-partie", table:"/nouvelle-partie/table", board:"/partie",
  history:"/historique", rules:"/bareme", groups:"/groupes", players:"/joueurs", statistics:"/classements",
};
const pagesByPath = new Map(Object.entries(pagePaths).map(([screen,path]) => [path,screen]));
let page = "home";
let draft = null;
let score = null;
let swap = null;
let viewedGame = null;
let viewedPlayerId = null;
let playerToDelete = null;
let statsContract = "all";
let statsOrder = "wins";
let overallOrder = "wins";
let chart = null;
let fromRules = "home";
let toastTimer;
let restoreFocus;
const suits = ["♠", "♥", "♣", "♦", "★"];
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
  share:'<path d="M12 15V4m-4 4 4-4 4 4M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  pencil:'<path d="m14 6 4 4M4 20l4.5-1 11-11a2.8 2.8 0 0 0-4-4l-11 11L4 20Z"/>',
};
const icon = name => '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' + icons[name] + '</svg>';
const escape = value => String(value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
const avatar = index => `<span class="avatar tone${index}" aria-hidden="true">${suits[index]}</span>`;
const back = (action, label = "Accueil") => `<button class="back" data-action="${action}">${icon("back")}${label}</button>`;
const head = (title, desc) => `<div class="page-head"><h1>${title}</h1><p>${desc}</p></div>`;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const signed = value => value > 0 ? "+" + value : value < 0 ? "−" + Math.abs(value) : "0";
const color = value => value > 0 ? "pos" : value < 0 ? "neg" : "";
const totals = game => game.rounds.reduce((values, round) => values.map((value, index) => value + round.values[index]), game.players.map(() => 0));
const ranksFor = scores => scores.map(points => 1 + scores.filter(other => other > points).length);
const ordinal = rank => `${rank}<sup>${rank === 1 ? "er" : "e"}</sup>`;
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
let replaced = false;
const cloud = document.body.dataset.storage === "supabase" ? createCloudStore({
  authorize:window.whistAuth?.getAccessToken,
  onSessionLost:window.whistAuth?.sessionLost,
  read:() => data,
  write(snapshot, meta) {
    if (snapshot !== data) {
      const next = normalize(snapshot);
      replaced ||= canonical(next) !== canonical(data);
      data = next;
    }
    persist({...data,_supabase:meta});
  },
  report(message, action) {
    storageStatus.textContent = message;
    storageMode = action;
    storageAction.hidden = !action;
    storageAction.textContent = action === "resolve" ? "Voir les options" : "Réessayer";
  },
  hasLocal:state => !!(state.active || state.last || state.piccolo || state.history.length ||
    state.groups.length || state.roster.length || Object.keys(state.overrides).length),
  revision:syncMeta?.revision ?? null,
  dirty:syncMeta?.dirty === true,
}) : null;

function persist(snapshot) {
  try { localStorage.setItem(storageKey, JSON.stringify(snapshot)); }
  catch { tell("Le navigateur ne peut pas sauvegarder cette partie."); }
}
function save() {
  if (viewer) return;
  if (cloud) cloud.save();
  else persist(data);
}
function go(next, replace = false) {
  page = next;
  const path = next === "archive" ? "/historique/" + encodeURIComponent(viewedGame.id)
    : next === "profile" ? "/joueurs/" + encodeURIComponent(viewedPlayerId) : pagePaths[next];
  const samePath = window.location.pathname === path;
  if (!samePath || window.location.hash || next === "table") {
    const method = replace || samePath ? "replaceState" : "pushState";
    window.history[method](next === "table" ? {draft} : null, "", path + (replace ? window.location.search : ""));
  }
  render();
  window.scrollTo(0, 0);
  if (!reducedMotion.matches) app.firstElementChild?.animate?.([
    {opacity:.55,transform:"translateY(7px)"}, {opacity:1,transform:"translateY(0)"},
  ], {duration:200,easing:"ease-out"});
  const heading = app.querySelector("h1");
  if (heading) {
    heading.tabIndex = -1;
    heading.focus({preventScroll:true, focusVisible:false});
  }
}
function openPath() {
  const path = window.location.pathname.replace(/\/+$/, "");
  let next = pagesByPath.get(path) ?? "home";
  const detail = /^\/(historique|joueurs)\/([^/]+)$/.exec(path);
  if (detail) {
    let id;
    try { id = decodeURIComponent(detail[2]); } catch {}
    if (detail[1] === "historique") {
      viewedGame = data.history.find(game => game.id === id);
      next = viewedGame ? "archive" : "history";
    } else {
      viewedPlayerId = data.roster.find(player => player.id === id)?.id;
      next = viewedPlayerId ? "profile" : "players";
    }
  }
  if (next === "board" && !data.active) next = "home";
  if (next === "table") {
    const placed = window.history.state?.draft;
    if (placed && validNames(placed.players)) draft = placed;
    if (!validNames(draft?.players)) next = "setup";
  }
  if (next === "setup" && !draft) draft = makeDraft();
  go(next,true);
}
function render() {
  const screens = {watch:watchView, home, setup, table, board, history, archive, rules, groups, players:playersPage, profile:playerProfile, statistics:statisticsPage};
  app.innerHTML = screens[page]();
  document.querySelectorAll("[data-nav]").forEach(button => {
    if (button.dataset.nav === page) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
}
function home() {
  const game = data.active;
  return `<div class="wrap home-screen${game ? " has-game" : ""}">
    <section class="hero" aria-labelledby="home-title">
      <div class="hero-copy"><p class="home-note">Whist à 4 ou 5 joueurs</p><h1 id="home-title">On se fait<br>un <em>whist&nbsp;?</em></h1></div>
      <div class="card-fan" aria-hidden="true">
        <div class="playing-card card-back"><span>A ♥︎</span><b>♥︎</b><span>A ♥︎</span></div>
        <div class="playing-card card-front"><span>A ♣︎</span><b class="club-friend">♣︎<i></i></b><span>A ♣︎</span></div>
      </div>
      ${game ? "" : `<button class="btn primary hero-launch" data-action="new">Nouvelle partie ${icon("arrow")}</button>`}
    </section>
    ${game ? `<section class="home-game surface" aria-labelledby="home-game-title">
      <div class="home-game-heading"><h2 id="home-game-title">Partie en cours</h2><span class="home-turn">Tour ${game.rounds.length + 1}</span></div>
      <ul class="home-game-players" aria-label="Joueurs de la partie">${game.players.map((name,seat) => `<li>${avatar(seat)}<span title="${escape(name)}">${escape(name)}</span></li>`).join("")}</ul>
      <div class="home-game-actions"><button class="btn primary" data-action="resume">Reprendre ${icon("arrow")}</button><button class="btn secondary" data-action="new">Nouvelle partie</button></div>
    </section>` : ""}
    ${homeCards()}
    <nav class="home-shortcuts" aria-label="Ton carnet">
      <a class="shortcut shortcut-players" href="/joueurs" data-action="players"><span class="shortcut-symbol" aria-hidden="true">♣︎</span><span><strong>Joueurs</strong><small>${data.roster.length ? data.roster.length + " joueur" + plural(data.roster.length) : "Ajouter un joueur"}</small></span>${icon("arrow")}</a>
      <a class="shortcut shortcut-history" href="/historique" data-action="history"><span class="shortcut-symbol" aria-hidden="true">♥︎</span><span><strong>Historique</strong><small>${data.history.length ? data.history.length + " partie" + plural(data.history.length) : "Aucune partie"}</small></span>${icon("arrow")}</a>
    </nav>
  </div>`;
}
// What happened last and who leads overall, so the home screen says something between games.
function homeCards() {
  const game = data.history[0];
  if (!game) return "";
  const sums = totals(game);
  const ranks = ranksFor(sums);
  const rows = sums.map((points, seat) => ({points, seat})).sort((a, b) => b.points - a.points);
  const id = escape(game.id);
  const last = `<section class="home-card surface" aria-labelledby="home-last-title">
    <div class="home-card-heading"><h2 id="home-last-title">Dernière partie</h2><small>${formatDate(game.finished)}</small></div>
    <ol class="home-ranking" role="list">${rows.map(({points, seat}) => `<li><span class="home-rank medal${ranks[seat]}">${ranks[seat]}</span><span class="home-rank-name">${escape(game.players[seat])}</span><strong class="${color(points)}">${signed(points)}</strong></li>`).join("")}</ol>
    <a class="text-action" href="/historique/${encodeURIComponent(game.id)}" data-action="view-game" data-value="${id}">Revoir la partie ${icon("arrow")}</a>
  </section>`;
  const general = overallStatistics(data);
  const leaders = data.history.length < 2 ? [] : data.roster.map(player => ({player, record:general.get(player.id)}))
    .filter(item => item.record).sort((a, b) => b.record.wins - a.record.wins || b.record.points - a.record.points).slice(0, 3);
  const podium = leaders.length ? `<section class="home-card surface" aria-labelledby="home-podium-title">
    <div class="home-card-heading"><h2 id="home-podium-title">Classement</h2><small>${data.history.length} parties terminées</small></div>
    <ol class="home-ranking" role="list">${leaders.map(({player, record}, index) => `<li><span class="home-rank medal${index + 1}">${index + 1}</span><span class="home-rank-name">${escape(player.nickname)}<small>${record.wins} victoire${plural(record.wins)}</small></span><strong class="${color(record.points)}">${signed(record.points)}</strong></li>`).join("")}</ol>
    <a class="text-action" href="/classements" data-action="statistics">Tous les classements ${icon("arrow")}</a>
  </section>` : "";
  return `<div class="home-cards">${last}${podium}</div>`;
}
function setup() {
  const count = draft.players.length;
  return `<section class="wrap narrow page setup-page">${back("home")}${head("Qui joue ?", "Un prénom ou un pseudo pour chacun.")}
    <form id="setup-form">
      <fieldset class="player-count"><legend>Nombre de joueurs</legend><div class="count-options">
        ${[4, 5].map(size => `<label><input type="radio" name="size" value="${size}" ${count === size ? "checked" : ""}><span>${size} joueurs</span></label>`).join("")}
      </div>${count === 5 ? '<p class="hint">Le joueur après le donneur est mort à chaque donne.</p>' : ""}</fieldset>
      <div class="setup-grid">${draft.players.map((name, index) => `<div class="player-input surface">
        ${avatar(index)}
        <label><span>Joueur ${index + 1}</span><input class="player-name" name="player${index}" maxlength="24"
          placeholder="Prénom ou surnom" autocomplete="off" autocapitalize="words" autocorrect="off" spellcheck="false"
          role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="player-suggestions-${index}"
          enterkeyhint="${index < count - 1 ? "next" : "go"}" required value="${escape(name)}"></label>
        <div class="player-suggestions" role="listbox" aria-label="Joueurs proposés" id="player-suggestions-${index}" hidden></div>
      </div>`).join("")}</div>
      <p class="hint">Déjà venu ? Tape le début de son pseudo. Les nouveaux joueurs sont ajoutés au départ.</p>
      <p class="error" id="setup-error" hidden>Choisis un joueur différent à chaque place, y compris pour les anciens pseudos.</p>
      <div class="page-actions"><button class="quiet" type="button" data-action="groups">${icon("users")} Groupes de joueurs</button><button class="btn primary" type="submit">Placer les joueurs ${icon("arrow")}</button></div>
    </form></section>`;
}
function table() {
  const {dealer, dead, first} = rolesFor(draft);
  return `<section class="wrap narrow page">${back("setup", "Prénoms")}${head("À table", "Mets les joueurs dans l’ordre et choisis qui distribue.")}
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
function watchView() {
  if (data.active) return gameView(data.active, false);
  if (data.history[0]) return gameView(data.history[0], true);
  return `<section class="wrap narrow page">${head("Suivi en direct", "Les scores de la table, mis à jour tout seuls.")}${empty("♣", "Aucune partie en cours", "Les scores apparaîtront ici dès qu’une partie commence.")}</section>`;
}
function archive() {return gameView(viewedGame, true);}
function scoreTile(name, seat, points, rank, roles) {
  let role = "";
  let label = "";
  if (seat === roles?.dealer) { role = "dealer"; label = "Donneur"; }
  else if (seat === roles?.dead) { role = "pause"; label = "Mort"; }
  else if (seat === roles?.first) { role = "first"; label = "1er à parler"; }
  return `<article class="score-tile surface tone${seat}" ${role ? `data-role="${role}"` : ""}>
    <div class="tile-player">${avatar(seat)}<span class="tile-name" title="${escape(name)}">${escape(name)}</span></div>
    <strong class="tile-score ${color(points)}">${signed(points)}</strong>
    <span class="tile-rank">${ordinal(rank)}</span>
    ${roles ? `<div class="tile-role">${role ? `<span>${icon(role)}${label}</span>` : ""}</div>` : ""}
  </article>`;
}
function gameView(game, finished) {
  const sums = totals(game);
  const ranks = ranksFor(sums);
  const roles = finished ? null : rolesFor(game, game.rounds.length);
  const leaders = game.players.filter((_, index) => ranks[index] === 1);
  const heading = finished ? "Partie terminée" : "Tour " + (game.rounds.length + 1);
  return `<section class="board-hero"><div class="wrap"><div class="board-nav">
    ${viewer ? '<span class="live-badge"><i aria-hidden="true"></i>Suivi en direct</span>' : finished ? `${back("history", "Historique")}<button class="board-cancel" type="button" data-action="delete-game">Supprimer la partie</button>` : `${back("home")}<button class="board-cancel" type="button" data-action="cancel-game">Annuler la partie</button>`}
  </div><div class="board-top">
    <div><span class="eyebrow">${finished ? formatDate(game.finished) : "Feuille de score, " + game.players.length + " joueurs"}</span><h1>${heading}</h1></div>
    ${finished ? `<div class="board-leader">${icon("scores")}<span>${leaders.length > 1 ? "En tête ex æquo" : "En tête"}<strong>${leaders.map(escape).join(", ")}</strong></span></div>` : '<div class="board-emblem" aria-hidden="true"><span>♦</span><span>♠</span></div>'}
  </div></div></section>
  <section class="wrap board-body" data-player-count="${game.players.length}">
    <div class="round-heading score-heading"><h2>Scores cumulés</h2><small>Points</small></div>
    <div class="score-tiles">${game.players.map((name, seat) => scoreTile(name, seat, sums[seat], ranks[seat], roles)).join("")}</div>
    ${scoreChart(game)}
    <div class="round-heading"><h2>Donnes</h2><small>${game.rounds.length} au total</small></div>
    ${game.rounds.length ? roundTable(game) : empty("♣", "À vous de jouer !", "Après la première donne, ajoute le score ici.")}
    ${finished || viewer ? "" : `<div class="board-actions"><button class="btn primary" data-action="add-score">${icon("plus")} Ajouter un score</button><button class="btn secondary" data-action="finish" ${game.rounds.length ? "" : "disabled"}>Terminer la partie</button></div>`}
    ${finished && !viewer ? `<div class="board-actions share-actions"><button class="btn primary" data-action="share-game">${icon("share")} Partager le résultat</button></div>` : ""}
  </section>`;
}
// Validated together as a categorical palette on the app surface; names are always shown beside them.
// The picture to share keeps these light values; on screen the theme supplies --series-0 to --series-4.
const chartColors = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
const seriesColor = seat => "var(--series-" + seat + ")";
const chartBox = {width:360, height:230, left:36, right:70, top:12, bottom:24};
const shortName = name => name.length > 9 ? name.slice(0, 8) + "…" : name;
function scoreChart(game) {
  chart = null;
  const count = game.rounds.length;
  if (count < 2) return "";
  const series = game.players.map(() => [0]);
  game.rounds.forEach(round => round.values.forEach((value, seat) => series[seat].push(series[seat].at(-1) + value)));
  const {width, height, left, right, top, bottom} = chartBox;
  const values = series.flat();
  const rough = (Math.max(...values) - Math.min(...values) || 1) / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].find(factor => factor * power >= rough) * power;
  const low = Math.floor(Math.min(...values) / step) * step;
  const high = Math.ceil(Math.max(...values) / step) * step;
  const x = index => left + index / count * (width - left - right);
  const y = value => top + (high - value) / (high - low) * (height - top - bottom);
  chart = {game, series, count, x, y};
  const ticks = Array.from({length:Math.round((high - low) / step) + 1}, (_, index) => low + index * step);
  const every = Math.ceil(count / 6);
  // Keep the names at the line ends from sitting on top of each other.
  const ends = series.map((line, seat) => ({seat, at:y(line.at(-1))})).sort((a, b) => a.at - b.at);
  ends.forEach((end, index) => { if (index) end.at = Math.max(end.at, ends[index - 1].at + 12); });
  const overflow = Math.max(0, ends.at(-1).at - (height - bottom + 6));
  ends.forEach(end => { end.at -= overflow; });
  return `<div class="round-heading"><h2>Évolution</h2><small>Points cumulés</small></div>
  <figure class="score-chart surface">
    <ul class="chart-legend" role="list">${game.players.map((name, seat) => `<li><span class="chart-key" style="background:${seriesColor(seat)}"></span>${escape(name)}</li>`).join("")}</ul>
    <div class="chart-plot"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Évolution des points cumulés, donne après donne. Le détail figure dans le tableau des donnes.">
      ${ticks.map(tick => `<line class="${tick === 0 ? "chart-zero" : "chart-grid"}" x1="${left}" x2="${x(count)}" y1="${y(tick)}" y2="${y(tick)}"/><text class="chart-tick" x="${left - 6}" y="${y(tick) + 3.5}" text-anchor="end">${signed(tick)}</text>`).join("")}
      ${Array.from({length:count}, (_, index) => index + 1).filter(round => round % every === 0 || round === count).map(round => `<text class="chart-tick" x="${x(round)}" y="${height - 6}" text-anchor="middle">${round}</text>`).join("")}
      ${series.map((line, seat) => `<polyline class="chart-line" style="stroke:${seriesColor(seat)}" points="${line.map((value, index) => x(index).toFixed(1) + "," + y(value).toFixed(1)).join(" ")}"/>`).join("")}
      <line class="chart-cursor" y1="${top}" y2="${height - bottom}" hidden/>
      ${series.map((line, seat) => `<circle class="chart-dot" data-seat="${seat}" r="4" style="fill:${seriesColor(seat)}" cx="${x(count)}" cy="${y(line.at(-1))}"/>`).join("")}
      ${ends.map(({seat, at}) => `<text class="chart-name" x="${x(count) + 9}" y="${(at + 3.5).toFixed(1)}">${escape(shortName(game.players[seat]))}</text>`).join("")}
    </svg><div class="chart-tip" hidden></div></div>
  </figure>`;
}
function moveChartCursor(index) {
  const figure = app.querySelector(".score-chart");
  if (!chart || !figure) return;
  const cursor = figure.querySelector(".chart-cursor");
  const tip = figure.querySelector(".chart-tip");
  const at = index ?? chart.count;
  cursor.toggleAttribute("hidden", index === null);
  tip.hidden = index === null;
  cursor.setAttribute("x1", chart.x(at));
  cursor.setAttribute("x2", chart.x(at));
  figure.querySelectorAll(".chart-dot").forEach(dot => {
    dot.setAttribute("cx", chart.x(at));
    dot.setAttribute("cy", chart.y(chart.series[dot.dataset.seat][at]));
  });
  if (index === null) return;
  const rows = chart.series.map((line, seat) => ({seat, points:line[index]})).sort((a, b) => b.points - a.points);
  tip.innerHTML = `<strong>${index ? "Après la donne " + index : "Départ"}</strong>${rows.map(({seat, points}) => `<span><i style="background:${seriesColor(seat)}"></i>${escape(chart.game.players[seat])}<b>${signed(points)}</b></span>`).join("")}`;
  const share = chart.x(index) / chartBox.width;
  tip.style.left = share < .5 ? "calc(" + share * 100 + "% + 10px)" : "auto";
  tip.style.right = share < .5 ? "auto" : "calc(" + (1 - share) * 100 + "% + 10px)";
}
function followChart(event) {
  const plot = event.target.closest?.(".chart-plot svg");
  if (!plot || !chart) return;
  const box = plot.getBoundingClientRect();
  const position = (event.clientX - box.left) / box.width * chartBox.width;
  const index = Math.round((position - chartBox.left) / (chart.x(chart.count) - chartBox.left) * chart.count);
  moveChartCursor(Math.min(chart.count, Math.max(0, index)));
}
app.addEventListener("pointermove", followChart);
app.addEventListener("pointerdown", followChart);
app.addEventListener("pointerleave", event => {
  if (event.target.matches?.(".chart-plot svg") && event.pointerType === "mouse") moveChartCursor(null);
}, true);

function shareText(game) {
  const sums = totals(game);
  const ranks = ranksFor(sums);
  const lines = sums.map((points, seat) => ({points, seat})).sort((a, b) => b.points - a.points)
    .map(({points, seat}) => ranks[seat] + (ranks[seat] === 1 ? "er" : "e") + " " + game.players[seat] + " " + signed(points));
  return "Whist du " + formatDate(game.finished) + "\n" + lines.join("\n") + "\n" + game.rounds.length + " donne" + plural(game.rounds.length);
}
// The highest score a declarer took in a single round, for the picture's closing line.
function bestRound(game) {
  let best = null;
  game.rounds.forEach(round => round.entries.forEach(({seat}) => {
    if (round.values[seat] > (best?.points ?? 0)) best = {seat, points:round.values[seat], contract:byId[round.contract]?.label};
  }));
  return best;
}
function shareImage(game) {
  const sums = totals(game);
  const ranks = ranksFor(sums);
  const rows = sums.map((points, seat) => ({points, seat})).sort((a, b) => b.points - a.points);
  const winners = rows.filter(row => ranks[row.seat] === 1);
  const count = game.rounds.length;
  const feat = bestRound(game);
  const width = 1080;
  const listTop = 640;
  const listHeight = 44 + rows.length * 122;
  const chartTop = listTop + listHeight + 32;
  const chartHeight = count > 1 ? 400 : 0;
  const featTop = chartTop + (chartHeight ? chartHeight + 32 : 0);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = featTop + (feat ? 190 : 40);
  const pen = canvas.getContext("2d");
  const font = (size, weight = 700, family = "system-ui, -apple-system, sans-serif") => { pen.font = weight + " " + size + "px " + family; };
  const display = 'ui-rounded, "Avenir Next", system-ui, -apple-system, sans-serif';
  const fit = (text, room) => {
    while (text.length > 1 && pen.measureText(text).width > room) text = text.slice(0, -2) + "…";
    return text;
  };
  const panel = (top, height) => {
    pen.fillStyle = "#fffaf1";
    pen.beginPath();
    pen.roundRect(56, top, width - 112, height, 40);
    pen.fill();
  };

  // Felt table with the faint diagonal weave of the home screen.
  const felt = pen.createLinearGradient(0, 0, width, canvas.height);
  felt.addColorStop(0, "#2f5d47");
  felt.addColorStop(1, "#17322a");
  pen.fillStyle = felt;
  pen.fillRect(0, 0, width, canvas.height);
  pen.strokeStyle = "#ffffff09";
  pen.lineWidth = 2;
  for (let offset = -canvas.height; offset < width; offset += 26) {
    pen.beginPath();
    pen.moveTo(offset, 0);
    pen.lineTo(offset + canvas.height, canvas.height);
    pen.stroke();
  }
  pen.strokeStyle = "#d6e2a540";
  pen.lineWidth = 3;
  pen.beginPath();
  pen.roundRect(24, 24, width - 48, canvas.height - 48, 52);
  pen.stroke();

  pen.textBaseline = "alphabetic";
  pen.fillStyle = "#f6ca69";
  font(38, 750);
  pen.fillText("♠  Carnet de Whist", 84, 122);
  pen.fillStyle = "#ecdfc5";
  font(32, 500);
  pen.textAlign = "right";
  pen.fillText(formatDate(game.finished), width - 84, 122);
  pen.textAlign = "left";

  // Two fanned aces, as on the home screen.
  const card = (x, y, angle, paper, ink, suit) => {
    pen.save();
    pen.translate(x, y);
    pen.rotate(angle * Math.PI / 180);
    pen.shadowColor = "#0d1f1870";
    pen.shadowBlur = 30;
    pen.shadowOffsetY = 14;
    pen.fillStyle = paper;
    pen.beginPath();
    pen.roundRect(-112, -158, 224, 316, 26);
    pen.fill();
    pen.shadowColor = "transparent";
    pen.fillStyle = ink;
    pen.textAlign = "center";
    font(40, 800, display);
    pen.fillText("A", -74, -98);
    font(34, 700);
    pen.fillText(suit, -74, -60);
    font(140, 700);
    pen.fillText(suit, 0, 52);
    pen.restore();
  };
  card(822, 372, -13, "#eda58d", "#8f2f27", "♥");
  card(900, 396, 9, "#fff6dc", "#28533f", "♣");

  pen.fillStyle = "#ecdfc5";
  font(30, 700);
  pen.letterSpacing = "6px";
  pen.fillText(winners.length > 1 ? "VAINQUEURS EX ÆQUO" : "VAINQUEUR", 86, 250);
  pen.letterSpacing = "0px";
  pen.fillStyle = "#f6ca69";
  let size = 190;
  const champion = winners.map(row => game.players[row.seat]).join(" & ");
  do { font(size, 800, display); size -= 10; } while (size > 70 && pen.measureText(champion).width > 590);
  pen.fillText(fit(champion, 590), 80, 420);
  pen.fillStyle = "#fff9e9";
  font(64, 800, display);
  const lead = signed(winners[0].points) + " point" + plural(Math.abs(winners[0].points));
  pen.fillText(lead, 84, 512);
  pen.fillStyle = "#ecdfc5";
  font(32, 500);
  pen.fillText(count + " donne" + plural(count) + " · " + game.players.length + " joueurs", 86, 568);

  // Final ranking.
  panel(listTop, listHeight);
  const medals = [["#f6ca69", "#1b392d"], ["#dfe3dc", "#23332b"], ["#ecc9a9", "#5a3018"]];
  rows.forEach(({points, seat}, index) => {
    const middle = listTop + 22 + index * 122 + 61;
    if (index) {
      pen.strokeStyle = "#ded1b9";
      pen.lineWidth = 2;
      pen.beginPath();
      pen.moveTo(96, middle - 61);
      pen.lineTo(width - 96, middle - 61);
      pen.stroke();
    }
    const [fill, ink] = medals[ranks[seat] - 1] ?? ["#fffaf1", "#5d5f50"];
    pen.fillStyle = fill;
    pen.beginPath();
    pen.arc(140, middle, 40, 0, Math.PI * 2);
    pen.fill();
    if (ranks[seat] > 3) {
      pen.strokeStyle = "#ded1b9";
      pen.lineWidth = 3;
      pen.stroke();
    }
    pen.fillStyle = ink;
    pen.textAlign = "center";
    font(42, 800, display);
    pen.fillText(ranks[seat], 140, middle + 15);
    pen.fillStyle = chartColors[seat];
    pen.beginPath();
    pen.roundRect(206, middle - 24, 12, 48, 6);
    pen.fill();
    const score = signed(points);
    font(64, 800, display);
    pen.fillStyle = points > 0 ? "#236044" : points < 0 ? "#a13e34" : "#23332b";
    pen.textAlign = "right";
    pen.fillText(score, width - 100, middle + 22);
    const room = width - 100 - pen.measureText(score).width - 40 - 244;
    pen.fillStyle = "#23332b";
    pen.textAlign = "left";
    font(54, 750, display);
    pen.fillText(fit(game.players[seat], room), 244, middle + 19);
  });

  // How the scores moved, in the same colours as the bars beside the names.
  if (chartHeight) {
    panel(chartTop, chartHeight);
    pen.fillStyle = "#5d5f50";
    font(30, 650);
    pen.fillText("Évolution des scores", 100, chartTop + 62);
    const series = game.players.map(() => [0]);
    game.rounds.forEach(round => round.values.forEach((value, seat) => series[seat].push(series[seat].at(-1) + value)));
    const values = series.flat();
    const low = Math.min(...values);
    const high = Math.max(...values);
    const left = 104, right = width - 112, top = chartTop + 104, bottom = chartTop + chartHeight - 48;
    const x = index => left + index / count * (right - left);
    const y = value => top + (high - value) / (high - low || 1) * (bottom - top);
    pen.strokeStyle = "#5d5f5080";
    pen.lineWidth = 2;
    pen.setLineDash([8, 10]);
    pen.beginPath();
    pen.moveTo(left, y(0));
    pen.lineTo(right, y(0));
    pen.stroke();
    pen.setLineDash([]);
    pen.lineJoin = "round";
    pen.lineCap = "round";
    // Draw the winner last so the leading line stays on top.
    [...rows].reverse().forEach(({seat}) => {
      pen.strokeStyle = chartColors[seat];
      pen.lineWidth = 7;
      pen.beginPath();
      series[seat].forEach((value, index) => pen[index ? "lineTo" : "moveTo"](x(index), y(value)));
      pen.stroke();
      pen.fillStyle = chartColors[seat];
      pen.strokeStyle = "#fffaf1";
      pen.lineWidth = 5;
      pen.beginPath();
      pen.arc(x(count), y(series[seat].at(-1)), 12, 0, Math.PI * 2);
      pen.fill();
      pen.stroke();
    });
  }

  if (feat) {
    pen.textAlign = "center";
    pen.fillStyle = "#f6ca69";
    font(28, 700);
    pen.letterSpacing = "5px";
    pen.fillText("LE COUP DE LA PARTIE", width / 2, featTop + 54);
    pen.letterSpacing = "0px";
    pen.fillStyle = "#fff9e9";
    font(44, 750, display);
    pen.fillText(fit(game.players[feat.seat] + " · " + (feat.contract ?? "Contrat") + " · " + signed(feat.points), width - 180), width / 2, featTop + 116);
  }
  return new Promise(resolve => canvas.toBlob(blob => resolve(blob && new File([blob], "whist.png", {type:"image/png"})), "image/png"));
}
async function shareGame(game) {
  const text = shareText(game);
  try {
    const file = await shareImage(game).catch(() => null);
    if (file && navigator.canShare?.({files:[file]})) await navigator.share({files:[file], text});
    else if (navigator.share) await navigator.share({text});
    else {
      await navigator.clipboard.writeText(text);
      tell("Résultat copié, prêt à coller.");
    }
  } catch (error) {
    if (error?.name === "AbortError") return;
    try {
      await navigator.clipboard.writeText(text);
      tell("Résultat copié, prêt à coller.");
    } catch { tell("Le partage n’est pas disponible sur cet appareil."); }
  }
}
function roundTable(game) {
  return `<div class="surface score-table-wrap"><table class="score-table" aria-label="Points par donne"><thead><tr><th scope="col">Contrat</th>${game.players.map((name, seat) => `<th scope="col">${avatar(seat)}<span>${escape(name)}</span></th>`).join("")}</tr></thead>
  <tbody>${game.rounds.map((round, index) => {
    const {dead} = rolesFor(game, index);
    const played = round.entries.map(entry => {
      const name = escape(game.players[entry.seat]);
      if (byId[round.contract].outcomeOnly) {
        const won = declarationWon(byId[round.contract], entry, round.entries.length === 2 ? entry.tricks : round.tricks);
        return name + ", " + (won ? "Gagné" : "Perdu");
      }
      return round.tricks === null ? name + " (" + entry.tricks + ")" : name;
    }).join(" / ");
    const result = byId[round.contract].outcomeOnly || round.tricks === null ? played : played + ", " + round.tricks + " pli" + plural(round.tricks);
    const name = escape(byId[round.contract].label);
    const editLabel = `Modifier le tour ${index + 1}`;
    const summary = `${name}${round.doubled ? " ×2" : ""}<small>Tour ${index + 1}, ${result}</small>`;
    const first = viewer ? `<div class="score-edit">${summary}</div>`
      : `<button class="score-edit" data-action="edit-score" data-value="${index}" aria-label="${editLabel}, ${name}" title="${editLabel}">${icon("pencil")} ${summary}</button>`;
    return `<tr><td>${first}</td>${round.values.map((value, seat) => `<td class="${seat === dead ? "dead-cell" : color(value)}">${signed(value)}${seat === dead ? "<small>Mort</small>" : ""}</td>`).join("")}</tr>`;
  }).join("")}</tbody></table></div>`;
}
function history() {
  return `<section class="wrap narrow page">${back("home")}${head("Historique", "Retrouve le classement et les donnes de tes parties terminées.")}
    ${data.history.length ? `<div class="list">${data.history.map(game => `<article class="list-item surface"><div><strong>${game.players.map(escape).join(", ")}</strong><small>${formatDate(game.finished)}, ${game.rounds.length} donne${plural(game.rounds.length)}</small></div><a class="btn secondary" href="/historique/${encodeURIComponent(game.id)}" data-action="view-game" data-value="${escape(game.id)}">Voir ${icon("arrow")}</a></article>`).join("")}</div>` : empty("♥", "Aucune partie terminée", "Tes parties apparaîtront ici à la fin du jeu.")}
  </section>`;
}
function groups() {
  return `<section class="wrap narrow page">${draft ? back("setup", "Prénoms") : back("home")}${head("Groupes de joueurs", "Retrouve tes tables habituelles sans ressaisir les noms.")}
    ${data.groups.length ? `<div class="list">${data.groups.map((group, index) => `<article class="list-item surface"><div><strong>${escape(group.name)}</strong><small>${group.players.map(escape).join(", ")}</small></div><button class="btn secondary" data-action="use-group" data-value="${index}">Choisir ${icon("arrow")}</button></article>`).join("")}</div>` : empty("♦", "Aucun groupe enregistré", "Tu peux enregistrer les joueurs que tu viens de saisir ou ceux de ta dernière partie.")}
    <div class="page-actions">${data.last ? `<button class="btn secondary" data-action="last-group">Reprendre les derniers joueurs</button>` : ""}<button class="btn primary" data-action="save-group" ${validNames(draft?.players) || data.last ? "" : "disabled"}>Enregistrer un groupe</button></div>
  </section>`;
}
function playerCards(query = "") {
  const players = query.trim() ? matchingPlayers(data.roster, query) : [...data.roster].sort((a,b) => a.nickname.localeCompare(b.nickname,"fr-BE"));
  return players.length ? `<div class="list">${players.map(player => `<article class="list-item surface"><div><strong>${escape(player.nickname)}</strong><small>${player.aliases.length ? "Avant, " + player.aliases.map(escape).join(", ") : "Joueur enregistré"}</small></div><a class="btn secondary" href="/joueurs/${encodeURIComponent(player.id)}" data-action="view-player" data-value="${escape(player.id)}">Voir la fiche ${icon("arrow")}</a></article>`).join("")}</div>`
    : empty("♠", "Aucun joueur", query.trim() ? "Aucun pseudo ne correspond à ta recherche." : "Ajoute ton premier joueur. Les autres suivront.");
}
function playersPage() {
  return `<section class="wrap narrow page">${back("home")}${head("Joueurs", "Les habitués et ceux qui viennent pour la première fois.")}
    <div class="page-actions roster-actions"><button class="btn primary" data-action="new-player">${icon("plus")} Ajouter un joueur</button><button class="btn secondary" data-action="statistics">${icon("scores")} Classements</button><button class="btn secondary" data-action="groups">${icon("users")} Groupes</button></div>
    ${data.roster.length ? '<button class="quiet roster-delete" data-action="clear-players">Vider le répertoire</button>' : ""}
    <label class="roster-search">Rechercher un pseudo<input id="roster-search" type="search" autocomplete="off" placeholder="Ex. KDE" maxlength="24"></label>
    <div id="roster-list">${playerCards()}</div>
  </section>`;
}
const successRate = record => Math.round(record.wins / record.attempts * 100) + " %";
function playerProfile() {
  const player = data.roster.find(item => item.id === viewedPlayerId);
  const stats = playerStatistics(data,player.id);
  const records = Object.entries(stats.contracts);
  return `<section class="wrap narrow page">${back("players","Joueurs")}${head(escape(player.nickname),"Ses contrats, ses points et son taux de réussite.")}
    <div class="page-actions roster-actions"><button class="btn secondary" data-action="edit-player" data-value="${escape(player.id)}">Modifier le pseudo</button><button class="btn secondary" data-action="statistics">${icon("scores")} Classements</button><button class="quiet roster-delete" data-action="delete-player" data-value="${escape(player.id)}">Supprimer le joueur</button></div>
    ${player.aliases.length ? `<p class="hint">Avant, ${player.aliases.map(escape).join(", ")}</p>` : ""}
    <div class="player-metrics"><article class="surface"><strong>${stats.completedGames}</strong><span>Parties terminées</span></article><article class="surface"><strong>${stats.roundsPlayed}</strong><span>Donnes jouées</span></article><article class="surface"><strong>${records.reduce((total,[,record]) => total + record.attempts,0)}</strong><span>Contrats annoncés</span></article></div>
    <p class="hint">Les donnes de la partie en cours sont incluses. Les donnes où le joueur est mort sont exclues.</p>
    ${records.length ? `<div class="rule-table-wrap surface"><table class="rule-table stats-table" aria-label="Résultats par contrat"><thead><tr><th>Contrat</th><th>Gagnés</th><th>Perdus</th><th>Réussite</th><th>Points</th></tr></thead><tbody>${records.map(([id,record]) => `<tr><th scope="row">${escape(byId[id].label)}<small>${record.attempts} tentative${plural(record.attempts)}</small></th><td>${record.wins}</td><td>${record.losses}</td><td>${successRate(record)}</td><td class="${color(record.points)}">${signed(record.points)}</td></tr>`).join("")}</tbody></table></div>` : empty("♠","Aucun contrat joué","Ses résultats apparaîtront après sa première annonce.")}
  </section>`;
}
const average = record => signed(Math.round(record.points / record.games * 10) / 10).replace(".", ",");
function statisticsPage() {
  const overall = statsContract === "all";
  const order = overall ? overallOrder : statsOrder;
  const byName = (a, b) => a.player.nickname.localeCompare(b.player.nickname, "fr-BE");
  const general = overallStatistics(data);
  const ranking = data.roster.map(player => ({player,
    record:overall ? general.get(player.id) : playerStatistics(data, player.id).contracts[statsContract]}))
    .filter(item => item.record).sort((a, b) => {
      const value = record => order === "rate" ? record.wins / record.attempts
        : order === "average" ? record.points / record.games : record[order];
      return value(b.record) - value(a.record) || (overall ? b.record.games - a.record.games : b.record.attempts - a.record.attempts) || byName(a, b);
    });
  const orders = overall
    ? [["wins","Plus de victoires"],["points","Plus de points"],["average","Meilleure moyenne par partie"],["games","Plus de parties jouées"]]
    : [["wins","Plus de contrats gagnés"],["losses","Plus de contrats perdus"],["rate","Meilleur taux de réussite"]];
  const who = ({player}) => `<button class="text-action" data-action="view-player" data-value="${escape(player.id)}">${escape(player.nickname)}</button>`;
  const table = overall
    ? `<table class="rule-table stats-table" aria-label="Classement général"><thead><tr><th>Joueur</th><th>Victoires</th><th>Points</th><th>Moyenne</th></tr></thead><tbody>${ranking.map(item => `<tr><th scope="row">${who(item)}<small>${item.record.games} partie${plural(item.record.games)}</small></th><td>${item.record.wins}</td><td class="${color(item.record.points)}">${signed(item.record.points)}</td><td class="${color(item.record.points)}">${average(item.record)}</td></tr>`).join("")}</tbody></table>`
    : `<table class="rule-table stats-table" aria-label="Classement par contrat"><thead><tr><th>Joueur</th><th>Gagnés</th><th>Perdus</th><th>Réussite</th></tr></thead><tbody>${ranking.map(item => `<tr><th scope="row">${who(item)}<small>${item.record.attempts} tentative${plural(item.record.attempts)}</small></th><td>${item.record.wins}</td><td>${item.record.losses}</td><td>${successRate(item.record)}</td></tr>`).join("")}</tbody></table>`;
  return `<section class="wrap narrow page">${back("players","Joueurs")}${head("Classements","Qui gagne le plus ? Qui réussit ses misères ?")}
    <div class="stats-filters"><label>Classement<select id="stats-contract"><option value="all" ${overall ? "selected" : ""}>Général, toutes les parties</option>${contracts.map(contract => `<option value="${contract.id}" ${statsContract === contract.id ? "selected" : ""}>${escape(contract.label)}</option>`).join("")}</select></label>
    <label>Classer par<select id="stats-order">${orders.map(([value,label]) => `<option value="${value}" ${order === value ? "selected" : ""}>${label}</option>`).join("")}</select></label></div>
    <p class="hint">${overall ? "Seules les parties terminées comptent. Une victoire est une première place, ex æquo compris. La moyenne est le nombre de points par partie." : "Le taux de réussite porte uniquement sur les annonces de chaque joueur. Le nombre de tentatives permet de comparer leur expérience."}</p>
    ${ranking.length ? `<div class="rule-table-wrap surface">${table}</div>` : overall ? empty("♣","Aucune partie terminée","Le classement apparaîtra après la première partie terminée.") : empty("♣","Aucune annonce pour ce contrat","Personne n’a encore tenté ce contrat.")}
  </section>`;
}
function editPlayer(id = "") {
  const player = data.roster.find(item => item.id === id);
  showDialog(`${dialogHead(player ? "Modifier le pseudo" : "Nouveau joueur")}<form id="player-form">
    <div class="dialog-main"><input type="hidden" name="playerId" value="${escape(id)}"><label>Pseudo<input name="nickname" required maxlength="24" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="Ex. KDE" value="${escape(player?.nickname ?? "")}"></label>
    <p class="hint">${player ? "Ses parties restent reliées à sa fiche. Son ancien pseudo permettra aussi de le retrouver." : "Le joueur pourra être sélectionné dans tes prochaines parties."}</p><p class="error" role="alert" hidden>Ce pseudo est déjà utilisé par un autre joueur.</p></div>
    <div class="dialog-actions"><button type="button" class="btn secondary" data-action="close">Annuler</button><button type="submit" class="btn primary">Enregistrer</button></div></form>`);
  dialog.querySelector('[name="nickname"]')?.focus();
}
function draftPlayerIds(names = draft.players) {
  return names.map((name,index) => {
    const selected = data.roster.find(player => player.id === draft.playerIds[index]);
    return selected && [selected.nickname,...selected.aliases].some(alias => playerKey(alias) === playerKey(name))
      ? selected.id : findPlayer(data.roster,name)?.id ?? null;
  });
}
function updateSuggestions(input) {
  const index = Number(input.name.slice(6));
  const list = app.querySelector("#player-suggestions-" + index);
  const selected = new Set(draftPlayerIds().filter((_,seat) => seat !== index));
  const matches = matchingPlayers(data.roster,input.value).filter(player => !selected.has(player.id) && playerKey(player.nickname) !== playerKey(input.value)).slice(0,6);
  list.innerHTML = matches.map(player => `<button type="button" role="option" aria-selected="false" data-action="select-player" data-value="${escape(player.id)}" data-seat="${index}"><strong>${escape(player.nickname)}</strong>${player.aliases.length ? `<small>${player.aliases.map(escape).join(", ")}</small>` : ""}</button>`).join("");
  list.hidden = !matches.length;
  input.setAttribute("aria-expanded",String(!!matches.length));
}
const ruleValue = (contract, field) => data.overrides[contract.id]?.[field] ?? contract[field];
function ruleInput(items, fields, sign, label) {
  const name = items.map(item => item.id).join(",") + ":" + fields.join(",");
  const disabled = items[0].id === "piccolo" && !data.piccolo ? "disabled" : "";
  return `<label class="rule-input"><span aria-hidden="true">${sign}</span><input aria-label="${label}" type="number" min="0" max="9999" step="1" inputmode="numeric" required ${disabled} name="${name}" value="${ruleValue(items[0], fields[0])}"></label>`;
}
function ruleRow(contract) {
  const {label, target, bonus, id} = contract;
  const base = ruleInput([contract], ["win"], "+", label + ", Gagné");
  const loss = ruleInput([contract], ["loss"], "−", label + ", Perdu");
  const step = bonus == null ? "" : ruleInput([contract], ["bonus"], "+", label + ", Pli en plus") +
    ruleInput([contract], ["penalty"], "−", label + ", Pli manquant");
  const goal = target === 0 ? "Pas de pli" : target + " pli" + plural(target);
  return `<tr class="${id === "piccolo" ? "piccolo-row" : ""}"><th scope="row">${label}<small>${goal}</small></th><td>${base}</td><td>${step}</td><td>${loss}</td></tr>`;
}
function capotRow(label, items) {
  return `<tr><th scope="row">${label}<small>13 plis</small></th><td>${ruleInput(items, ["capot"], "+", label + ", Points")}</td><td></td><td></td></tr>`;
}
function rules() {
  const duos = contracts.filter(contract => contract.mode === "duo");
  const duoCapots = duos.every(contract => ruleValue(contract, "capot") === ruleValue(duos[0], "capot"))
    ? capotRow("Capot", duos)
    : duos.map(contract => capotRow("Capot, " + contract.label, [contract])).join("");
  const groups = [
    duos.map(ruleRow).join("") + duoCapots,
    contracts.filter(contract => contract.mode === "solo").map(ruleRow).join("") +
      ruleRow(byId.trou) + capotRow("Capot sur trou", [byId.trou]) +
      [byId.small, byId.solo8small, byId.piccolo].map(ruleRow).join(""),
    [byId.ab9, byId.ab10, byId.ab11, byId.large, byId.largetrou, byId.smallslam, byId.slam].map(ruleRow).join(""),
  ];
  return `<section class="wrap narrow page">${back("rules-back", "Retour")}${head("Barème", "Modifie la grille de points pour tes prochaines parties.")}
    <form class="rule-list" id="rules-form">
    <div class="rule-option surface">
      <label for="piccolo"><strong>Piccolo</strong><small>Contrat à exactement un pli.</small></label>
      <input type="checkbox" role="switch" id="piccolo" name="piccolo" ${data.piccolo ? "checked" : ""}>
    </div>
    <p class="body-copy">Les points s’appliquent à chaque joueur du duo ou au déclarant en solo. « Gagné » et « Perdu » sont les points de base. « Par pli » ajoute + pour chaque pli en plus d’un contrat gagné, et − pour chaque pli manquant d’un contrat perdu. Pour un Solo 6, 7 ou 8, les bonus s’arrêtent au huitième pli.</p>
    <div class="rule-table-wrap surface"><table class="rule-table" aria-label="Grille de points">
      <thead><tr><th scope="col">Contrat</th><th scope="col">Gagné</th><th scope="col">Par pli</th><th scope="col">Perdu</th></tr></thead>
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
function dialogHead(title) {
  return `<header class="dialog-head"><div><h2 id="dialog-title">${title}</h2></div><button class="dialog-close" data-action="close" aria-label="Fermer">×</button></header>`;
}
dialog.addEventListener("close", () => {
  if (restoreFocus?.isConnected) restoreFocus.focus();
  restoreFocus = null;
});
function ask(title, copy, action, label, dismissLabel = "Annuler") {
  showDialog(`${dialogHead(title)}<div class="dialog-main"><p class="body-copy">${copy}</p></div><div class="dialog-actions"><button class="btn secondary" data-action="close">${dismissLabel}</button><button class="btn primary" data-action="${action}">${label}</button></div>`);
}
function openScore(index = null) {
  const game = page === "archive" ? viewedGame : data.active;
  const round = index === null ? null : game?.rounds[index];
  if (!game || (index !== null && !round)) return;
  score = round ? {game, index, mode:byId[round.contract].mode, contract:round.contract, entries:round.entries.map(entry => ({...entry})), tricks:round.tricks, doubled:round.doubled, rules:{...round.rules}}
    : {game, index, mode:"duo", contract:null, entries:[], tricks:null, doubled:false, rules:null};
  if (round && byId[round.contract].outcomeOnly) {
    score.entries = round.entries.map(entry => ({seat:entry.seat,
      won:declarationWon(byId[round.contract], entry, round.entries.length === 2 ? entry.tricks : round.tricks)}));
    score.tricks = null;
  }
  renderScore();
}
function scoreValues() {
  const game = score.game;
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
  return calculateRound(game, score.index ?? game.rounds.length, contract, score.entries, score.tricks, score.doubled, score.rules ?? game.overrides?.[contract.id]);
}
function trickPicker(selected, max, target, seat = "all") {
  return `<div class="tricks">${Array.from({length:max + 1}, (_, n) => `<button aria-label="${n} pli${plural(n)}${seat === "all" ? "" : " pour " + escape(score.game.players[seat])}" aria-pressed="${n === selected}" class="${n === target ? "target" : ""}" data-action="tricks" data-value="${n}" data-seat="${seat}">${n}</button>`).join("")}</div>`;
}
function outcomePicker(entry) {
  const name = escape(score.game.players[entry.seat]);
  return `<div class="trick-row"><p class="hint">${name}</p><div class="toggle outcome-picker" role="group" aria-label="Résultat de ${name}">${[true,false].map(won => `<button aria-pressed="${entry.won === won}" data-action="outcome" data-value="${Number(won)}" data-seat="${entry.seat}">${won ? "Gagné" : "Perdu"}</button>`).join("")}</div></div>`;
}
function scoreStandings(game) {
  const sums = totals(game);
  const ranks = ranksFor(sums);
  const ranking = sums.map((points, seat) => ({points, seat})).sort((a, b) => b.points - a.points);
  return `<section class="score-standings" aria-labelledby="score-standings-title">
    <h3 id="score-standings-title">Classement actuel</h3>
    <ul role="list">${ranking.map(({points, seat}) => {
      const name = escape(game.players[seat]);
      return `<li><span class="score-standings-name" title="${name}">${name}</span><span class="score-standings-line"><span class="score-rank">${ordinal(ranks[seat])}</span><strong class="${color(points)}">${signed(points)}</strong></span></li>`;
    }).join("")}</ul>
  </section>`;
}
function renderScore() {
  const game = score.game;
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
  const playerHint = contract?.multiple ? "Qui tente le coup ? Un ou deux joueurs." : contract?.players === 2 ? "Qui joue ensemble ?" : contract ? "Qui tente le coup ?" : "Choisis d’abord l’annonce";
  showDialog(`${dialogHead((score.index === null ? "Les points du tour " : "Modifier le tour ") + (index + 1))}
    ${scoreStandings(game)}
    <div class="dialog-main score-entry">${roleStrip(game, index)}
      <div class="entry-grid">
      <fieldset><legend>Contrat</legend><div class="mode-tabs">${Object.entries(modes).map(([key, mode]) => `<button aria-pressed="${key === score.mode}" data-action="mode" data-value="${key}"><span aria-hidden="true">${mode.suit}</span>${mode.name}</button>`).join("")}</div>
      <div class="chips" data-mode="${score.mode}">${contracts.filter(item => item.mode === score.mode && (item.id !== "piccolo" || game.piccolo)).map(item => `<button aria-pressed="${item.id === score.contract}" data-action="contract" data-value="${item.id}">${item.label}</button>`).join("")}</div>
      <p class="suit-order"><span>Ordre des couleurs</span><span class="suit-rank" role="img" aria-label="De la plus forte à la moins forte : cœur, carreau, trèfle, pique">${[["♥","Cœur",true],["♦","Carreau",true],["♣","Trèfle"],["♠","Pique"]].map(([suit, name, red]) => `<b class="${red ? "red-suit" : ""}">${suit}</b> ${name}`).join('<i aria-hidden="true">›</i>')}</span></p></fieldset>
      <fieldset><legend>Qui joue ?</legend><p class="hint player-hint">${playerHint}</p><div class="pick-players">
      ${game.players.map((name, seat) => seat === dead ? "" : `<button ${contract ? "" : "disabled"} aria-label="${escape(name)}" aria-pressed="${score.entries.some(entry => entry.seat === seat)}" data-action="player" data-value="${seat}">${avatar(seat)}<span class="pick-name">${escape(name)}</span></button>`).join("")}</div></fieldset>
      </div>
      ${contract ? `<fieldset><legend>${contract.outcomeOnly ? "Résultat du contrat" : "Plis gagnés"}</legend>${contract.outcomeOnly
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
  return [4, 5].includes(names?.length) && names.every(name => name.trim()) &&
    new Set(names.map(name => findPlayer(data.roster,name)?.id ?? "name:" + playerKey(name))).size === names.length;
}
function makeDraft(names = ["", "", "", ""], ids = []) {
  const players = names.map((name,index) => data.roster.find(player => player.id === ids[index]) ?? findPlayer(data.roster,name));
  return {players:names.map((name,index) => players[index]?.nickname ?? name),playerIds:players.map(player => player?.id ?? null), dealer:0};
}
function newDraft(names, ids) {
  draft = makeDraft(names,ids);
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
function animateScoreChanges(before, after) {
  if (reducedMotion.matches || !window.requestAnimationFrame) return;
  app.querySelectorAll(".tile-score").forEach((label, seat) => {
    if (before[seat] === after[seat]) return;
    label.animate?.([{transform:"scale(1)"},{transform:"scale(1.13)",offset:.45},{transform:"scale(1)"}],
      {duration:380,easing:"ease-out"});
    const start = performance.now();
    function tick(now) {
      if (!label.isConnected) return;
      const progress = Math.min(1, (now - start) / 360);
      label.textContent = signed(Math.round(before[seat] + (after[seat] - before[seat]) * progress));
      if (progress < 1) window.requestAnimationFrame(tick);
    }
    window.requestAnimationFrame(tick);
  });
}
function celebrateGame() {
  if (reducedMotion.matches) return;
  const burst = document.createElement("div");
  burst.className = "suit-burst";
  burst.setAttribute("aria-hidden", "true");
  for (let index = 0; index < 15; index++) {
    const piece = document.createElement("span");
    piece.textContent = suits[index % 4];
    piece.style.setProperty("--left", 8 + index * 6 + "%");
    piece.style.setProperty("--delay", (index % 5) * 45 + "ms");
    piece.style.setProperty("--spin", (index % 2 ? -1 : 1) * (55 + index * 12) + "deg");
    burst.append(piece);
  }
  document.body.append(burst);
  setTimeout(() => burst.remove(), 1600);
}
function recordScore() {
  const values = scoreValues();
  if (!values) return;
  const {game, index, contract, entries, tricks, doubled} = score;
  const before = totals(game);
  const rules = {...(score.rules ?? game.overrides?.[contract])};
  const round = {contract, entries, tricks:byId[contract].target === 0 && entries.length === 2 ? null : tricks, doubled, rules, values};
  if (index === null) game.rounds.push(round);
  else game.rounds[index] = round;
  save();
  dialog.close();
  render();
  animateScoreChanges(before, totals(game));
  const button = app.querySelector(index === null ? '[data-action="add-score"]' : '[data-action="edit-score"][data-value="' + index + '"]');
  button?.focus({preventScroll:true});
  if (index === null) button?.scrollIntoView({block:"nearest"});
  tell(index === null ? "C’est noté !" : "Voilà, c’est corrigé.");
}
function launchGame() {
  const playerIds = draftPlayerIds().map((id,index) => id ?? registerPlayer(data.roster,draft.players[index]).id);
  data.active = {players:[...draft.players], playerIds, dealer:draft.dealer, rounds:[], scoringVersion:2, overrides:data.overrides, piccolo:data.piccolo};
  data.last = [...draft.players];
  data.lastPlayerIds = [...playerIds];
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
  "view-game"(id) { viewedGame = data.history.find(game => game.id === id); go("archive"); },
  rules() { if (page !== "rules") fromRules = page; go("rules"); },
  "rules-back"() { go(fromRules); },
  "reset-rules"() { ask("Rétablir le barème ?", "Les nouvelles parties utiliseront le barème par défaut.", "confirm-reset", "Rétablir"); },
  "confirm-reset"() { data.overrides = {}; data.piccolo = false; save(); dialog.close(); render(); tell("Barème rétabli."); },
  setup() { swap = null; go("setup"); },
  dealer(value) { draft.dealer = Number(value); window.history.replaceState({draft}, ""); render(); app.querySelector('[data-action="dealer"][data-value="' + value + '"]')?.focus(); },
  swap(value) {
    const seat = Number(value);
    if (swap === null) swap = seat;
    else {
      if (swap !== seat) {
        [draft.players[swap], draft.players[seat]] = [draft.players[seat], draft.players[swap]];
        [draft.playerIds[swap], draft.playerIds[seat]] = [draft.playerIds[seat], draft.playerIds[swap]];
      }
      swap = null;
    }
    window.history.replaceState({draft}, "");
    render();
    app.querySelector('[data-action="swap"][data-value="' + value + '"]')?.focus();
  },
  start() {
    if (data.active) ask("Remplacer la partie en cours ?", "Cette action efface les donnes de la partie en cours.", "confirm-start", "Remplacer et lancer");
    else launchGame();
  },
  "confirm-start"() { launchGame(); },
  groups() { go("groups"); },
  players() { go("players"); },
  "view-player"(id) { viewedPlayerId = id; go("profile"); },
  statistics() { go("statistics"); },
  "new-player"() { editPlayer(); },
  "edit-player"(id) { editPlayer(id); },
  "delete-player"(id) {
    playerToDelete = id;
    const player = data.roster.find(item => item.id === id);
    ask("Supprimer " + escape(player.nickname) + " ?", "Ce joueur sera retiré du répertoire, des suggestions et des classements. Ses anciennes parties resteront consultables avec leurs scores.", "confirm-delete-player", "Supprimer le joueur");
  },
  "confirm-delete-player"() {
    data.roster = data.roster.filter(player => player.id !== playerToDelete);
    playerToDelete = null;
    viewedPlayerId = null;
    save();
    dialog.close();
    go("players");
    tell("Joueur supprimé du répertoire.");
  },
  "clear-players"() {
    ask("Vider le répertoire ?", "Toutes les fiches joueurs seront retirées du répertoire, des suggestions et des classements. Les anciennes parties et leurs scores resteront consultables.", "confirm-clear-players", "Vider le répertoire");
  },
  "confirm-clear-players"() {
    data.roster = [];
    viewedPlayerId = null;
    save();
    dialog.close();
    go("players");
    tell("Le répertoire est vide.");
  },
  "select-player"(id,seat) {
    const index = Number(seat);
    const player = data.roster.find(item => item.id === id);
    draft.players[index] = player.nickname;
    draft.playerIds[index] = player.id;
    const input = app.querySelector('[name="player' + index + '"]');
    input.value = player.nickname;
    app.querySelector("#player-suggestions-" + index).hidden = true;
    input.setAttribute("aria-expanded","false");
    input.focus({preventScroll:true});
  },
  "use-group"(value) { const group = data.groups[Number(value)]; newDraft(group.players,group.playerIds); },
  "last-group"() { newDraft(data.last,data.lastPlayerIds); },
  "save-group"() {
    showDialog(`${dialogHead("Enregistrer un groupe")}<form id="group-form">
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
  "cancel-game"() {
    ask("Annuler la partie ?", "Cette partie et ses scores seront effacés.", "confirm-cancel-game", "Oui, annuler la partie", "Garder la partie");
  },
  "confirm-cancel-game"() {
    if (page !== "board" || !data.active) return;
    data.active = null;
    save();
    dialog.close();
    go("home", true);
    tell("Partie annulée.");
  },
  "share-game"() { if (viewedGame) void shareGame(viewedGame); },
  "delete-game"() {
    ask("Supprimer cette partie ?", "Elle sera retirée de l’historique, des fiches joueurs et des classements. Cette action est définitive.", "confirm-delete-game", "Supprimer la partie", "Garder la partie");
  },
  "confirm-delete-game"() {
    if (page !== "archive" || !viewedGame) return;
    data.history = data.history.filter(game => game !== viewedGame);
    viewedGame = null;
    save();
    dialog.close();
    go("history", true);
    tell("Partie supprimée.");
  },
  finish() { ask("Terminer la partie ?", "Les scores et les donnes seront consultables dans l’historique.", "confirm-finish", "Terminer la partie"); },
  "confirm-finish"() {
    viewedGame = {...data.active, id:crypto.randomUUID(), finished:Date.now()};
    data.history.unshift(viewedGame);
    data.active = null;
    save();
    dialog.close();
    go("archive");
    celebrateGame();
  },
};
document.addEventListener("click", event => {
  const control = event.target.closest("button[data-action],a[data-action]");
  if (!control || control.disabled || event.defaultPrevented) return;
  if (control.tagName === "A") {
    if (event.button || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    event.preventDefault();
  }
  if (viewer) return;
  actions[control.dataset.action]?.(control.dataset.value, control.dataset.seat);
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
app.addEventListener("focusin", event => {
  if (event.target.matches(".player-name")) updateSuggestions(event.target);
});
function dismissSuggestionsOutside(target) {
  for (const list of app.querySelectorAll(".player-suggestions:not([hidden])")) {
    if (list.parentElement.contains(target)) continue;
    list.hidden = true;
    list.parentElement.querySelector(".player-name").setAttribute("aria-expanded","false");
  }
}
document.addEventListener("focusin", event => dismissSuggestionsOutside(event.target));
document.addEventListener("pointerdown", event => {
  // On touch screens a button tap can blur the field before the click arrives.
  if (event.button === 0 && event.target.closest(".player-suggestions button")) event.preventDefault();
  dismissSuggestionsOutside(event.target);
});
window.visualViewport?.addEventListener("resize", keepPlayerInputVisible);
window.addEventListener("resize", keepPlayerInputVisible);
app.addEventListener("keydown", event => {
  const input = event.target;
  const option = input.closest(".player-suggestions button");
  if (option && ["ArrowDown","ArrowUp","Escape"].includes(event.key)) {
    event.preventDefault();
    const list = option.parentElement;
    if (event.key === "Escape") {
      const field = list.parentElement.querySelector(".player-name");
      field.focus();
      list.hidden = true;
      field.setAttribute("aria-expanded","false");
    } else {
      const options = [...list.querySelectorAll("button")];
      const next = options.indexOf(option) + (event.key === "ArrowDown" ? 1 : -1);
      options[(next + options.length) % options.length].focus();
    }
    return;
  }
  if (input.matches(".player-name")) {
    const list = app.querySelector("#player-suggestions-" + input.name.slice(6));
    if (event.key === "Escape") { list.hidden = true; input.setAttribute("aria-expanded","false"); return; }
    if (event.key === "ArrowDown" && !list.hidden) {
      event.preventDefault();
      list.querySelector("button")?.focus();
      return;
    }
  }
  if (!compactSetup.matches || event.key !== "Enter" || event.isComposing || !input.matches(".player-name")) return;
  event.preventDefault();

  const form = input.form;
  const index = Number(input.name.slice("player".length));
  const next = form.elements.namedItem("player" + (index + 1));
  if (next) next.focus({preventScroll:true});
  else form.requestSubmit();
});
app.addEventListener("input", event => {
  if (event.target.id === "roster-search") {
    app.querySelector("#roster-list").innerHTML = playerCards(event.target.value);
    return;
  }
  if (event.target.form?.id === "setup-form" && event.target.name.startsWith("player")) {
    draft.players[Number(event.target.name.slice(6))] = event.target.value;
    draft.playerIds[Number(event.target.name.slice(6))] = null;
    app.querySelector("#setup-error").hidden = true;
    updateSuggestions(event.target);
  }
});
app.addEventListener("change", event => {
  if (["stats-contract","stats-order"].includes(event.target.id)) {
    const id = event.target.id;
    if (id === "stats-contract") statsContract = event.target.value;
    else if (statsContract === "all") overallOrder = event.target.value;
    else statsOrder = event.target.value;
    render();
    app.querySelector("#" + id).focus({preventScroll:true});
    return;
  }
  if (event.target.form?.id === "setup-form" && event.target.name === "size") {
    const count = Number(event.target.value);
    if (count === 5) {
      draft.players.push(draft.fifthPlayer ?? "");
      draft.playerIds.push(draft.fifthPlayerId ?? null);
    } else {
      draft.fifthPlayer = draft.players.pop();
      draft.fifthPlayerId = draft.playerIds.pop();
    }
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
      draft.playerIds = draftPlayerIds(names);
      draft.players = names.map((name,index) => data.roster.find(player => player.id === draft.playerIds[index])?.nickname ?? name);
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
      render();
      tell("Barème enregistré.");
      break;
    }
    case "player-form": {
      event.preventDefault();
      const nickname = fields.get("nickname").trim();
      const id = fields.get("playerId");
      if (!nickname || nickname.length > 24 || (id ? !renamePlayer(data.roster,id,nickname) : findPlayer(data.roster,nickname))) {
        form.querySelector(".error").hidden = false;
        return;
      }
      if (!id) registerPlayer(data.roster,nickname);
      if (id) {
        const relabel = (names,ids) => names.map((name,index) => ids?.[index] === id ? nickname : name);
        if (data.active) data.active.players = relabel(data.active.players,data.active.playerIds);
        if (data.last) data.last = relabel(data.last,data.lastPlayerIds);
        data.groups.forEach(group => {group.players = relabel(group.players,group.playerIds);});
      }
      save();
      dialog.close();
      go("players");
      tell(id ? "Pseudo mis à jour." : "Joueur enregistré.");
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
      const playerIds = players.map(player => registerPlayer(data.roster,player).id);
      data.groups.push({name, players,playerIds});
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
  openPath();
}

storageAction.addEventListener("click", () => {
  if (storageMode !== "resolve") {
    void reloadCloud();
    return;
  }
  showDialog(`${dialogHead("Deux versions du carnet")}<div class="dialog-main">
    <p class="body-copy">Le carnet en ligne a été modifié depuis un autre appareil et ne correspond plus à celui-ci. Choisis la version à garder.</p>
    <p class="hint">« Garder cet appareil » remplace le carnet en ligne. « Charger la version en ligne » télécharge d’abord une copie de cet appareil, puis la remplace.</p></div>
    <div class="dialog-actions"><button class="btn secondary" data-action="keep-local">Garder cet appareil</button><button class="btn primary" data-action="accept-cloud">Charger la version en ligne</button></div>`);
});
actions["keep-local"] = () => {
  dialog.close();
  void cloud.keepLocal();
};
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

let ready = false;
// Pick up changes made on another device, and send what could not be sent earlier.
async function refreshCloud() {
  if (!ready || document.hidden || cloud.conflicted()) return;
  replaced = false;
  await cloud.load();
  if (!replaced) return;
  if (dialog.open) dialog.close();
  score = null;
  openPath();
  tell("Carnet mis à jour depuis un autre appareil.");
}
function startNavigation() {
  ready = true;
  openPath();
  window.addEventListener("popstate", () => {
    if (dialog.open) dialog.close();
    openPath();
  });
}
if (viewer) {
  page = "watch";
  render();
  window.whistViewer.update = state => {
    const offset = window.scrollY;
    data = normalize(watched(state));
    render();
    window.scrollTo(0, offset);
  };
} else if (cloud) {
  if (window.whistAuth) window.whistAuth.hasUnsaved = cloud.pending;
  const remote = window.whistAuth?.initial ?? null;
  if (syncMeta?.revision == null) {
    // Nothing has ever been synchronised here: wait for the online notebook before showing anything.
    app.innerHTML = '<p class="wrap app-wait">Chargement du carnet…</p>';
    void cloud.load({remote}).then(startNavigation);
  } else {
    // Open at once on the copy kept on this device, then catch up in the background.
    startNavigation();
    replaced = false;
    void cloud.load({remote}).then(() => {
      if (!replaced) return;
      if (dialog.open) dialog.close();
      score = null;
      openPath();
      tell("Carnet mis à jour depuis un autre appareil.");
    });
  }
  window.addEventListener("online", () => {void refreshCloud();});
  document.addEventListener("visibilitychange", () => {void refreshCloud();});
} else startNavigation();
if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
