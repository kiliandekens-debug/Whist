import test from "node:test";
import assert from "node:assert/strict";
import {contracts, byId, calculate, calculateRound, rolesFor} from "../score.mjs";

const sum = values => values.reduce((total, value) => total + value, 0);

test("every contract gives whole, zero-sum scores", () => {
  for (const version of [1, 2]) for (const contract of contracts) {
    if (version === 1 && contract.id === "piccolo") continue;
    for (let tricks = 0; tricks <= 13; tricks++) for (const doubled of [false, true]) {
      const declarations = contract.players === 2 ? [[{seat:0},{seat:2}]]
        : contract.multiple ? [[{seat:1,won:true}],[{seat:1,won:false}],[{seat:1,won:true},{seat:3,won:false}],
          [{seat:0,won:true},{seat:3,won:true}],[{seat:0,won:false},{seat:3,won:false}]]
        : [[{seat:1,won:tricks >= contract.target}]];
      for (const entries of declarations) {
        const scores = calculate(contract, entries, tricks, doubled, {}, version);
        assert.equal(sum(scores), 0, contract.id);
        assert.ok(scores.every(Number.isInteger), contract.id);
      }
    }
  }
});

test("duo scores follow the barème", () => {
  assert.deepEqual(calculate(byId.duo8, [{seat:0},{seat:1}], 8, false), [5, 5, -5, -5]);
  assert.deepEqual(calculate(byId.duo8, [{seat:0},{seat:1}], 10, false), [9, 9, -9, -9]);
  assert.deepEqual(calculate(byId.duo8, [{seat:0},{seat:1}], 6, false), [-9, -9, 9, 9]);
  assert.deepEqual(calculate(byId.duo8, [{seat:0},{seat:1}], 13, true), [40, 40, -40, -40]);
});

test("solo bonuses stop at the eighth trick", () => {
  assert.deepEqual(calculate(byId.solo6, [{seat:2}], 8, false), [-5, -5, 15, -5]);
  assert.deepEqual(calculate(byId.solo6, [{seat:2}], 11, false), [-5, -5, 15, -5]);
  assert.deepEqual(calculate(byId.solo6, [{seat:2}], 5, false), [4, 4, -12, 4]);
});

test("two misery players are scored separately", () => {
  assert.deepEqual(calculate(byId.small, [{seat:0,won:true},{seat:1,won:false}], null, false), [15, -21, 3, 3]);
  assert.deepEqual(calculate(byId.small, [{seat:0,won:true},{seat:1,won:true}], null, false), [9, 9, -9, -9]);
});

test("overrides replace the default points", () => {
  assert.deepEqual(calculate(byId.ab9, [{seat:0}], 9, false, {win:60}), [60, -20, -20, -20]);
});

test("the dead player of a five-player table scores nothing", () => {
  const game = {players:["a","b","c","d","e"], dealer:0, scoringVersion:2};
  assert.deepEqual(rolesFor(game, 0), {dealer:0, dead:1, first:2});
  assert.deepEqual(calculateRound(game, 0, byId.ab9, [{seat:0}], 9, false, {}), [30, 0, -10, -10, -10]);
  assert.equal(calculateRound(game, 0, byId.ab9, [{seat:1}], 9, false, {}), null);
});

test("games from the first barème keep their scoring", () => {
  const game = {players:["a","b","c","d"], dealer:0, scoringVersion:1};
  assert.deepEqual(calculateRound(game, 0, byId.ab10, [{seat:0}], 10, false, {}), [42, -14, -14, -14]);
});
