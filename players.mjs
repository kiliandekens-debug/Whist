import {byId, declarationWon, rolesFor} from "./score.mjs";

export function playerKey(name) {
  return name.normalize("NFKC").trim().toLocaleLowerCase("fr-BE");
}

export function searchKey(name) {
  return playerKey(name).normalize("NFD").replace(/\p{M}/gu, "");
}

export function findPlayer(roster, name) {
  const key = playerKey(name);
  return roster.find(player => [player.nickname, ...player.aliases].some(alias => playerKey(alias) === key));
}

export function matchingPlayers(roster, query) {
  const key = searchKey(query);
  if (!key) return [];
  return roster.filter(player => [player.nickname, ...player.aliases].some(alias => searchKey(alias).startsWith(key)))
    .sort((a, b) => a.nickname.localeCompare(b.nickname, "fr-BE"));
}

export function registerPlayer(roster, nickname) {
  const existing = findPlayer(roster, nickname);
  if (existing) return existing;
  const player = {id:crypto.randomUUID(), nickname:nickname.trim(), aliases:[]};
  roster.push(player);
  return player;
}

export function renamePlayer(roster, id, nickname) {
  const player = roster.find(item => item.id === id);
  const name = nickname.trim();
  const existing = findPlayer(roster, name);
  if (!player || !name || name.length > 24 || (existing && existing.id !== id)) return false;
  if (playerKey(player.nickname) !== playerKey(name)) {
    player.aliases = [...new Set([...player.aliases, player.nickname])].filter(alias => playerKey(alias) !== playerKey(name));
  }
  player.nickname = name;
  return true;
}

// Keep historical identities separate from the editable directory.
export function migratePlayers(state) {
  const roster = (state.rosterVersion === 2 ? state.roster ?? [] : [])
    .map(player => ({...player, aliases:[...(player.aliases ?? [])]}));
  function link(names, ids = []) {
    return names.map((name, index) => ids?.[index] ?? findPlayer(roster,name)?.id ??
      "legacy:" + encodeURIComponent(playerKey(name)));
  }
  const game = value => value ? {...value,playerIds:link(value.players,value.playerIds)} : null;
  return {...state,roster,rosterVersion:2,active:game(state.active),history:state.history.map(game),
    groups:state.groups.map(group => ({...group,playerIds:link(group.players,group.playerIds)})),
    lastPlayerIds:state.last ? link(state.last,state.lastPlayerIds) : null};
}


export function playerStatistics(state, playerId) {
  const stats = {completedGames:0,roundsPlayed:0,contracts:{}};
  for (const game of [...state.history,...(state.active ? [state.active] : [])]) {
    // Contract statistics only make sense for whist.
    if (game.type === "rikiki") continue;
    const seat = game.playerIds.indexOf(playerId);
    if (seat === -1) continue;
    if (game !== state.active) stats.completedGames++;
    game.rounds.forEach((round,index) => {
      if (rolesFor(game,index).dead === seat) return;
      stats.roundsPlayed++;
      const entry = round.entries.find(item => item.seat === seat);
      const contract = byId[round.contract];
      if (!entry || !contract) return;
      const record = stats.contracts[contract.id] ??= {attempts:0,wins:0,losses:0,points:0};
      const tricks = contract.target === 0 && round.entries.length === 2 ? entry.tricks : round.tricks;
      const won = declarationWon(contract,entry,tricks);
      record.attempts++;
      record.wins += Number(won);
      record.losses += Number(!won);
      record.points += round.values[seat];
    });
  }
  return stats;
}

// Finished games only: games played, first places (ties included) and cumulative points.
export function overallStatistics(state, type = "whist") {
  const stats = new Map();
  for (const game of state.history) {
    // Points of different games are not comparable, so each game has its own ranking.
    if ((game.type ?? "whist") !== type) continue;
    const totals = game.players.map((_, seat) => game.rounds.reduce((sum, round) => sum + round.values[seat], 0));
    const best = Math.max(...totals);
    game.playerIds.forEach((id, seat) => {
      const record = stats.get(id) ?? {games:0, wins:0, points:0};
      record.games++;
      record.wins += Number(totals[seat] === best);
      record.points += totals[seat];
      stats.set(id, record);
    });
  }
  return stats;
}

// One player's record in finished games, kept apart for each game since their points differ.
export function playerSummary(state, playerId) {
  const blank = () => ({games:0, wins:0, points:0, best:null, worst:null, rounds:0, exact:0, recent:[]});
  const summary = {whist:blank(), rikiki:blank()};
  for (const game of state.history) {
    const seat = game.playerIds.indexOf(playerId);
    if (seat === -1) continue;
    const record = summary[game.type === "rikiki" ? "rikiki" : "whist"];
    const totals = game.players.map((_, index) => game.rounds.reduce((sum, round) => sum + round.values[index], 0));
    const points = totals[seat];
    const rank = 1 + totals.filter(other => other > points).length;
    record.games++;
    record.wins += Number(rank === 1);
    record.points += points;
    if (record.best === null || points > record.best) record.best = points;
    if (record.worst === null || points < record.worst) record.worst = points;
    if (record.recent.length < 5) record.recent.push({id:game.id, finished:game.finished, points, rank, players:game.players.length});
    if (game.type === "rikiki") for (const round of game.rounds) {
      record.rounds++;
      record.exact += Number(round.bids[seat] === round.tricks[seat]);
    }
  }
  return summary;
}
