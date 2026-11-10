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

// Stable legacy IDs make the same old snapshot migrate identically on each device.
export function migratePlayers(state) {
  const roster = (state.roster ?? []).map(player => ({...player, aliases:[...(player.aliases ?? [])]}));
  function link(names, ids = []) {
    return names.map((name, index) => {
      let player = roster.find(item => item.id === ids[index]) ?? findPlayer(roster, name);
      if (!player) {
        player = {id:"legacy:" + encodeURIComponent(playerKey(name)),nickname:name.trim(),aliases:[]};
        roster.push(player);
      }
      return player.id;
    });
  }
  const game = value => value ? {...value,playerIds:link(value.players,value.playerIds)} : null;
  return {...state,roster,active:game(state.active),history:state.history.map(game),
    groups:state.groups.map(group => ({...group,playerIds:link(group.players,group.playerIds)})),
    lastPlayerIds:state.last ? link(state.last,state.lastPlayerIds) : null};
}


export function playerStatistics(state, playerId) {
  const stats = {completedGames:0,roundsPlayed:0,contracts:{}};
  for (const game of [...state.history,...(state.active ? [state.active] : [])]) {
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
