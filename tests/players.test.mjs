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

test("the overall ranking counts finished games, first places and points", async () => {
  const {overallStatistics} = await import("../players.mjs");
  const game = (playerIds, ...rounds) => ({players:playerIds, playerIds, rounds:rounds.map(values => ({values}))});
  const stats = overallStatistics({history:[
    game(["a","b","c","d"], [30,-10,-10,-10], [-9,-9,9,9]),
    game(["a","b","c","d","e"], [5,0,5,-5,-5]),
  ], active:game(["a","b","c","d"], [99,-33,-33,-33])});
  assert.deepEqual(stats.get("a"), {games:2, wins:2, points:26});
  assert.deepEqual(stats.get("c"), {games:2, wins:1, points:4});
  assert.deepEqual(stats.get("e"), {games:1, wins:0, points:-5});
});

test("rikiki games have their own ranking and stay out of contract statistics", async () => {
  const {overallStatistics} = await import("../players.mjs");
  const whist = {players:["a","b","c","d"], playerIds:["a","b","c","d"], rounds:[{contract:"ab9", entries:[{seat:0}], tricks:9, values:[30,-10,-10,-10]}]};
  const rikiki = {type:"rikiki", players:["a","b"], playerIds:["a","b"], rounds:[{cards:1, bids:[1,1], tricks:[1,0], values:[12,-2]}]};
  const state = {history:[whist, rikiki], active:null};
  assert.deepEqual(overallStatistics(state).get("a"), {games:1, wins:1, points:30});
  assert.deepEqual(overallStatistics(state, "rikiki").get("b"), {games:1, wins:0, points:-2});
  assert.equal(playerStatistics(state, "a").completedGames, 1);
});
