import test from "node:test";
import assert from "node:assert/strict";
import {findPlayer, matchingPlayers, registerPlayer, renamePlayer, migratePlayers, playerStatistics} from "../players.mjs";

test("players are found whatever the case, and searched without accents", () => {
  const roster = [];
  const player = registerPlayer(roster, " Éloïse ");
  assert.equal(player.nickname, "Éloïse");
  assert.equal(registerPlayer(roster, "éloïse"), player);
  assert.equal(findPlayer(roster, "ÉLOÏSE"), player);
  assert.deepEqual(matchingPlayers(roster, "elo"), [player]);
  assert.deepEqual(matchingPlayers(roster, ""), []);
});

test("renaming keeps the old nickname as an alias and refuses duplicates", () => {
  const roster = [];
  const bob = registerPlayer(roster, "Bob");
  const zoe = registerPlayer(roster, "Zoé");
  assert.equal(renamePlayer(roster, bob.id, "Robert"), true);
  assert.deepEqual(bob.aliases, ["Bob"]);
  assert.equal(findPlayer(roster, "bob"), bob);
  assert.equal(renamePlayer(roster, zoe.id, "Bob"), false);
  assert.equal(renamePlayer(roster, zoe.id, ""), false);
});

test("migration links old games to players and statistics count declarations", () => {
  const round = {contract:"ab9", entries:[{seat:0}], tricks:9, values:[30, -10, -10, -10]};
  const lost = {contract:"small", entries:[{seat:0, won:false}], values:[-21, 7, 7, 7]};
  const state = migratePlayers({active:null, groups:[], last:null,
    history:[{players:["Ann","Bea","Cid","Dan"], dealer:0, rounds:[round, lost]}]});
  const [ann] = state.history[0].playerIds;
  assert.equal(ann, "legacy:ann");
  const stats = playerStatistics(state, ann);
  assert.equal(stats.completedGames, 1);
  assert.equal(stats.roundsPlayed, 2);
  assert.deepEqual(stats.contracts.ab9, {attempts:1, wins:1, losses:0, points:30});
  assert.deepEqual(stats.contracts.small, {attempts:1, wins:0, losses:1, points:-21});
});
