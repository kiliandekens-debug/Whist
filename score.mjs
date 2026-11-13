export const modes = {
  duo: {name: "Duo", suit: "♣"},
  solo: {name: "Solo", suit: "♠"},
  misery: {name: "Misère", suit: "♥"},
  other: {name: "Autres", suit: "♦"},
};

export const contracts = [
  ...[5, 5, 7, 9, 15, 20].map((points, index) => {
    const target = index + 8;
    return {
      id: "duo" + target, mode: "duo", label: "Duo " + target, target, players: 2,
      win: points, loss: points, bonus: 2, penalty: 2, capot: 20,
    };
  }),
  ...[9, 12, 18].map((points, index) => {
    const target = index + 6;
    return {
      id: "solo" + target, mode: "solo", label: "Solo " + target, target, players: 1,
      win: points, loss: points, bonus: 3, penalty: 3, maximum: 8,
    };
  }),
  {id:"small", mode:"misery", label:"Petite misère", target:0, players:1, multiple:true, outcomeOnly:true, win:18, loss:21},
  {id:"solo8small", mode:"misery", label:"Solo 8 sur petite misère", target:8, players:1, outcomeOnly:true, win:18, loss:21},
  {id:"large", mode:"misery", label:"Grande misère", target:0, players:1, multiple:true, outcomeOnly:true, win:36, loss:42},
  {id:"largetrou", mode:"misery", label:"Grande misère sur trou", target:0, players:1, multiple:true, outcomeOnly:true, win:42, loss:48},
  {id:"piccolo", mode:"misery", label:"Piccolo", target:1, players:1, exact:true, win:24, loss:24},
  {id:"trou", mode:"other", label:"Trou", target:9, players:2, win:10, loss:10, bonus:3, penalty:3, capot:30},
  {id:"ab9", mode:"other", label:"Abondance", target:9, players:1, win:30, loss:36},
  {id:"ab10", mode:"other", label:"Abondance 10", target:10, players:1, win:33, loss:39},
  {id:"ab11", mode:"other", label:"Abondance 11", target:11, players:1, win:36, loss:42},
  {id:"smallslam", mode:"other", label:"Petit Solo Chelem", target:12, players:1, win:60, loss:72},
  {id:"slam", mode:"other", label:"Solo Chelem", target:13, players:1, win:90, loss:102},
];

export const byId = Object.fromEntries(contracts.map(contract => [contract.id, contract]));
export const seats = [0, 1, 2, 3];

export function declarationWon(contract, entry, tricks) {
  if (contract.outcomeOnly && typeof entry.won === "boolean") return entry.won;
  return contract.target === 0 || contract.exact ? tricks === contract.target : tricks >= contract.target;
}

export function rolesFor({players, dealer: openingDealer, type}, roundIndex = 0) {
  const count = players.length;
  const dealer = (openingDealer + roundIndex) % count;
  // Only whist sits a fifth player out; everyone plays every round of rikiki.
  const dead = type !== "rikiki" && count === 5 ? (dealer + 1) % count : null;
  const first = ((dead ?? dealer) + 1) % count;
  return {dealer, dead, first};
}

export function calculateRound(game, roundIndex, contract, entries, tricks, doubled, overrides) {
  const {dead} = rolesFor(game, roundIndex);
  const active = game.players.map((_, seat) => seat).filter(seat => seat !== dead);
  const declarations = entries.map(entry => ({...entry, seat:active.indexOf(entry.seat)}));
  if (declarations.some(entry => entry.seat === -1)) return null;
  const scores = calculate(contract, declarations, tricks, doubled, overrides, game.scoringVersion);
  return game.players.map((_, seat) => seat === dead ? 0 : scores[active.indexOf(seat)]);
}

// Keep the first barème available for games started before the update.
const legacyPoints = {
  small:18, solo8small:27, large:36, largetrou:42, trou:16,
  ab9:30, ab10:42, ab11:60, smallslam:120, slam:200,
};
function legacyRules(contract) {
  const {mode, target, id} = contract;
  if (mode === "duo") {
    const base = 8 + (target - 8) * 3;
    return {win:base, loss:base, bonus:3, penalty:3, capot:30};
  }
  if (mode === "solo") {
    const base = 12 + (target - 6) * 3;
    return {win:base, loss:base};
  }
  return {win:legacyPoints[id], loss:legacyPoints[id], bonus:0, penalty:0};
}

export function calculate(contract, entries, tricks, doubled, overrides = {}, version = 2) {
  const previousRules = version === 1 ? legacyRules(contract) : {};
  const {target, win, loss, bonus = 0, penalty = 0, capot, maximum = 13} = {...contract, ...previousRules, ...overrides};
  const scores = seats.map(() => 0);
  const factor = doubled ? 2 : 1;
  if (contract.players === 2) {
    const points = tricks >= target
      ? (tricks === 13 && capot != null ? capot : win + (tricks - target) * bonus)
      : -(loss + (target - tricks) * penalty);
    if (!points) return scores;
    return scores.map((_, index) => points * factor * (entries.some(entry => entry.seat === index) ? 1 : -1));
  }
  if (target === 0 && entries.length === 2) {
    const [first, second] = entries;
    const firstWon = declarationWon(contract, first, first.tricks);
    const secondWon = declarationWon(contract, second, second.tricks);
    const bothWon = firstWon && secondWon;
    const bothLost = !firstWon && !secondWon;
    const winPer = Math.floor(win / 2);
    const lossPer = Math.floor(loss / 2);
    if (bothWon || bothLost) {
      const points = (bothWon ? winPer : -lossPer) * factor;
      if (!points) return scores;
      return scores.map((_, index) => entries.some(entry => entry.seat === index) ? points : -points);
    }
    const winner = firstWon ? first : second;
    const loser = winner === first ? second : first;
    const wonPoints = win - Math.floor(win / 6);
    const lostPoints = version === 1 ? wonPoints + 2 * Math.floor(loss / 6) : loss;
    const difference = lostPoints - wonPoints;
    const defenders = seats.filter(seat => seat !== winner.seat && seat !== loser.seat);
    scores[winner.seat] = wonPoints * factor;
    scores[loser.seat] = -lostPoints * factor;
    scores[defenders[0]] = Math.floor(difference / 2) * factor;
    scores[defenders[1]] = Math.ceil(difference / 2) * factor;
    return scores.map(value => value || 0);
  }
  const won = declarationWon({...contract,target}, entries[0], tricks);
  const scoredTricks = contract.outcomeOnly ? target : tricks;
  const points = won ? win + Math.max(0, Math.min(maximum, scoredTricks) - target) * bonus
    : -(loss + Math.max(0, target - scoredTricks) * penalty);
  const declarer = entries[0].seat;
  scores[declarer] = points * factor;
  const split = Math.floor(Math.abs(points) / 3);
  const remainder = Math.abs(points) % 3;
  for (let offset = 1; offset <= 3; offset++) {
    scores[(declarer + offset) % 4] = (split + Number(offset <= remainder)) * factor * -Math.sign(points);
  }
  return scores.map(value => value || 0);
}

// Rikiki: each player announces a number of tricks, and is paid for hitting it exactly.
export const rikikiDefaults = {success:10, trick:2, miss:2};

// The number of cards dealt in each round, e.g. 1, 2, 3, 2, 1.
export function rikikiPlan(min, max, shape = "updown") {
  const up = Array.from({length:max - min + 1}, (_, index) => min + index);
  const down = [...up].reverse();
  if (shape === "up") return up;
  if (shape === "downup") return [...down, ...up.slice(1)];
  return [...up, ...down.slice(1)];
}

export function rikikiPoints(bid, made, rules = rikikiDefaults) {
  return bid === made ? rules.success + rules.trick * made : -rules.miss * Math.abs(bid - made);
}
