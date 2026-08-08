/* Pure-logic tests for BluffIt. Run with: npm test */
import assert from "node:assert/strict";
import {
  buildPersonalResult,
  buildVotingOptions,
  generateRoomCode,
  getWinners,
  normalizeAnswer,
  rankPlayers,
  sanitizeName,
  sanitizeRoomCode,
  scoreRound,
  validateAnswer,
} from "../lib/gameLogic";
import { REAL_ANSWER_ID, DEFAULT_ROUNDS, type Submission, type Vote } from "../lib/types";
import {
  QUESTION_POOL_SIZE,
  THEMES,
  getQuestionById,
  getRoundQuestion,
  pickQuestionIds,
  type ThemeKey,
} from "../lib/questions";
import historyPool from "../data/questions/history.json";
import moviesPool from "../data/questions/movies.json";
import sportsPool from "../data/questions/sports.json";
import englishPool from "../data/questions/english.json";
import generalPool from "../data/questions/general.json";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

/* ---- normalization & validation ---- */

test("normalizeAnswer collapses case, whitespace, punctuation", () => {
  assert.equal(normalizeAnswer("  The  UNICORN. "), "the unicorn");
  assert.equal(normalizeAnswer('"BackRub!"'), "backrub");
});

test("validateAnswer rejects blank, too long, real-answer match, duplicates", () => {
  assert.equal(validateAnswer("", "x", []).ok, false);
  assert.equal(validateAnswer("a".repeat(81), "x", []).ok, false);
  assert.equal(validateAnswer("the unicorn ", "The Unicorn", []).ok, false);
  assert.equal(validateAnswer("Dragon", "Unicorn", ["dragon"]).ok, false);
  const ok = validateAnswer("  A   dragon ", "Unicorn", ["lion"]);
  assert.deepEqual(ok, { ok: true, cleaned: "A dragon" });
});

/* ---- voting options ---- */

test("buildVotingOptions excludes blanks and includes the real answer", () => {
  const subs: Submission[] = [
    { playerId: "p1", answer: "Dragon", round: 1 },
    { playerId: "p2", answer: "", round: 1 }, // blank — timer expired
    { playerId: "p3", answer: "Lion", round: 1 },
  ];
  const opts = buildVotingOptions(subs, "Unicorn", () => 0.5);
  assert.equal(opts.length, 3);
  assert.ok(opts.some((o) => o.id === REAL_ANSWER_ID && o.text === "Unicorn"));
  assert.ok(!opts.some((o) => o.id === "p2"));
});

/* ---- scoring (PRD section 13) ---- */

const players = [
  { id: "p1", name: "Ana" },
  { id: "p2", name: "Ben" },
  { id: "p3", name: "Cal" },
  { id: "p4", name: "Dia" },
];

test("correct votes are ranked by time: 100 / 90 / 80", () => {
  const options = [
    { id: "p4", text: "Dragon" },
    { id: REAL_ANSWER_ID, text: "Unicorn" },
  ];
  const votes: Vote[] = [
    { playerId: "p2", optionId: REAL_ANSWER_ID, round: 1, atMs: 2000 }, // 2nd
    { playerId: "p1", optionId: REAL_ANSWER_ID, round: 1, atMs: 1000 }, // 1st
    { playerId: "p3", optionId: REAL_ANSWER_ID, round: 1, atMs: 3000 }, // 3rd
  ];
  const { pointsByPlayer, correctAwards } = scoreRound(options, votes, players);
  assert.equal(correctAwards["p1"], 100);
  assert.equal(correctAwards["p2"], 90);
  assert.equal(correctAwards["p3"], 80);
  assert.equal(pointsByPlayer["p1"], 100);
  assert.equal(pointsByPlayer["p4"] ?? 0, 0); // uncast bluff, no vote: nothing
});

test("bluff points: +10 per fooled player; correct + bluff combine", () => {
  const options = [
    { id: "p1", text: "Dragon" },
    { id: REAL_ANSWER_ID, text: "Unicorn" },
  ];
  const votes: Vote[] = [
    { playerId: "p2", optionId: "p1", round: 1, atMs: 1000 }, // fooled by Ana
    { playerId: "p3", optionId: "p1", round: 1, atMs: 1100 }, // fooled by Ana
    { playerId: "p4", optionId: "p1", round: 1, atMs: 1200 }, // fooled by Ana
    { playerId: "p1", optionId: REAL_ANSWER_ID, round: 1, atMs: 900 }, // correct, 1st
  ];
  const { pointsByPlayer } = scoreRound(options, votes, players);
  assert.equal(pointsByPlayer["p1"], 100 + 30); // correct (1st) + fooled 3 players
  assert.equal(pointsByPlayer["p2"] ?? 0, 0);
});

test("the real answer never generates bluff points for anyone", () => {
  const options = [
    { id: "p1", text: "Dragon" },
    { id: REAL_ANSWER_ID, text: "Unicorn" },
  ];
  // Everyone picks the real answer — only ranked correct points are awarded.
  const votes: Vote[] = [
    { playerId: "p2", optionId: REAL_ANSWER_ID, round: 1, atMs: 1 },
    { playerId: "p3", optionId: REAL_ANSWER_ID, round: 1, atMs: 2 },
    { playerId: "p4", optionId: REAL_ANSWER_ID, round: 1, atMs: 3 },
  ];
  const { pointsByPlayer, revealOrder } = scoreRound(options, votes, players);
  const total = Object.values(pointsByPlayer).reduce((a, b) => a + b, 0);
  assert.equal(total, 100 + 90 + 80); // no author bonus from the real answer
  assert.equal(revealOrder.find((i) => i.isReal)!.pointsEarned, 0);
});

test("8 correct pickers: 100 down to 30; floor never goes below 10", () => {
  const eight = Array.from({ length: 8 }, (_, i) => ({
    id: `q${i}`,
    name: `P${i}`,
  }));
  const options = [{ id: REAL_ANSWER_ID, text: "X" }];
  const votes: Vote[] = eight.map((p, i) => ({
    playerId: p.id,
    optionId: REAL_ANSWER_ID,
    round: 1,
    atMs: i,
  }));
  const { correctAwards } = scoreRound(options, votes, eight);
  assert.deepEqual(
    eight.map((p) => correctAwards[p.id]),
    [100, 90, 80, 70, 60, 50, 40, 30]
  );
});

test("missing timestamps sort last; playerId tie-break is deterministic", () => {
  const options = [{ id: REAL_ANSWER_ID, text: "X" }];
  const votes: Vote[] = [
    { playerId: "p3", optionId: REAL_ANSWER_ID, round: 1 }, // no timestamp
    { playerId: "p1", optionId: REAL_ANSWER_ID, round: 1, atMs: 500 },
    { playerId: "p2", optionId: REAL_ANSWER_ID, round: 1, atMs: 500 }, // tie with p1
  ];
  const { correctAwards } = scoreRound(options, votes, players);
  assert.equal(correctAwards["p1"], 100); // tie broken by playerId
  assert.equal(correctAwards["p2"], 90);
  assert.equal(correctAwards["p3"], 80); // timestamp-less vote ranks last
});

test("reveal order: fakes by fewest votes first, real answer last", () => {
  const options = [
    { id: "p1", text: "A" },
    { id: "p2", text: "B" },
    { id: REAL_ANSWER_ID, text: "Real" },
  ];
  const votes: Vote[] = [
    { playerId: "p3", optionId: "p2", round: 1, atMs: 1 },
    { playerId: "p4", optionId: "p2", round: 1, atMs: 2 },
    { playerId: "p2", optionId: "p1", round: 1, atMs: 3 },
  ];
  const { revealOrder } = scoreRound(options, votes, players);
  assert.deepEqual(
    revealOrder.map((r) => r.optionId),
    ["p1", "p2", REAL_ANSWER_ID]
  );
  assert.equal(revealOrder[1].pointsEarned, 20); // 2 fooled × 10
  assert.equal(revealOrder[2].isReal, true);
});

/* ---- ranking ---- */

test("rankPlayers shares rank on ties (1,1,3)", () => {
  const ranked = rankPlayers([
    { id: "a", name: "Ana", score: 2000 },
    { id: "b", name: "Ben", score: 2000 },
    { id: "c", name: "Cal", score: 500 },
  ]);
  assert.deepEqual(ranked.map((r) => r.rank), [1, 1, 3]);
  assert.equal(getWinners(ranked).length, 2);
});

/* ---- codes & names ---- */

test("room codes avoid ambiguous characters", () => {
  for (let i = 0; i < 200; i++) {
    const code = generateRoomCode();
    assert.equal(code.length, 5);
    assert.ok(!/[01OI]/.test(code), `ambiguous char in ${code}`);
  }
});

test("sanitizers behave", () => {
  assert.equal(sanitizeRoomCode(" ab3-x "), "AB3X");
  assert.equal(sanitizeName("  Dev   Anand  "), "Dev Anand");
  assert.equal(sanitizeName("x".repeat(50)).length, 20);
});

/* ---- personal round results (reveal screen) ---- */

test("simulated 3+ player round: personal results, ranks, and totals", () => {
  const options = [
    { id: "p1", text: "Dragon" },
    { id: "p2", text: "Phoenix" },
    { id: REAL_ANSWER_ID, text: "Unicorn" },
  ];
  const votes: Vote[] = [
    { playerId: "p3", optionId: REAL_ANSWER_ID, round: 1, atMs: 500 }, // correct, 1st
    { playerId: "p1", optionId: REAL_ANSWER_ID, round: 1, atMs: 900 }, // correct, 2nd
    { playerId: "p2", optionId: "p1", round: 1, atMs: 700 }, // fooled by Ana
    // p4 never voted
  ];
  const { revealOrder, correctAwards, pointsByPlayer } = scoreRound(
    options,
    votes,
    players
  );

  // Ana: correct 2nd (+90) and her bluff fooled Ben (+10) = 100
  const p1 = buildPersonalResult(revealOrder, votes, "p1", correctAwards);
  assert.equal(p1.kind, "correct");
  assert.equal(p1.votePoints, 90);
  assert.equal(p1.correctRank, 2);
  assert.equal(p1.bluffVotes, 1);
  assert.equal(p1.bluffPoints, 10);
  assert.equal(p1.totalPoints, 100);
  assert.equal(pointsByPlayer["p1"], 100);

  // Cal: correct 1st (+100)
  const p3 = buildPersonalResult(revealOrder, votes, "p3", correctAwards);
  assert.equal(p3.votePoints, 100);
  assert.equal(p3.correctRank, 1);
  assert.equal(p3.totalPoints, 100);

  // Ben: fooled, no bluff votes = 0
  const p2 = buildPersonalResult(revealOrder, votes, "p2", correctAwards);
  assert.equal(p2.kind, "fooled");
  assert.equal(p2.fooledBy, "Ana");
  assert.equal(p2.realAnswer, "Unicorn");
  assert.equal(p2.totalPoints, 0);

  // Dia: no vote = 0
  const p4 = buildPersonalResult(revealOrder, votes, "p4", correctAwards);
  assert.equal(p4.kind, "no_vote");
  assert.equal(p4.totalPoints, 0);

  // Scores sum consistently
  const sum = Object.values(pointsByPlayer).reduce((a, b) => a + b, 0);
  assert.equal(sum, 100 + 100);
});

/* ---- question pools ---- */

const POOL_FILES: Record<string, { id: string; question: string; answer: string }[]> = {
  history: historyPool,
  movies: moviesPool,
  sports: sportsPool,
  english: englishPool,
  general: generalPool,
};

test("5 themed pools of 100 questions each, globally unique ids, valid fields", () => {
  assert.equal(QUESTION_POOL_SIZE, 500);
  const allIds = new Set<string>();
  for (const [name, pool] of Object.entries(POOL_FILES)) {
    assert.equal(pool.length, 100, `${name} pool should have 100 questions`);
    for (const q of pool) {
      assert.ok(!allIds.has(q.id), `duplicate id across pools: ${q.id}`);
      allIds.add(q.id);
      assert.ok(q.question.trim().length > 10, `question too short: ${q.id}`);
      assert.ok(q.answer.trim().length > 0 && q.answer.length <= 60, `bad answer: ${q.id}`);
    }
  }
});

test("themed picks draw only from their own pool, for every round count", () => {
  const themes: ThemeKey[] = ["history", "movies", "sports", "english"];
  for (const theme of themes) {
    for (const count of [5, 10, 15, 20]) {
      const picked = pickQuestionIds(theme, count);
      assert.equal(picked.length, count);
      assert.equal(new Set(picked).size, count, "no repeats within a game");
      const prefix = POOL_FILES[theme][0].id[0];
      for (const id of picked)
        assert.ok(String(id).startsWith(prefix), `${theme} pick leaked: ${id}`);
    }
  }
});

test("random theme gives a balanced mix across pools", () => {
  const picked = pickQuestionIds("random", 30, mulberry(42));
  assert.equal(picked.length, 30);
  assert.equal(new Set(picked).size, 30);
  const byPrefix = new Map<string, number>();
  for (const id of picked) {
    const p = String(id)[0];
    byPrefix.set(p, (byPrefix.get(p) ?? 0) + 1);
  }
  assert.equal(byPrefix.size, 5, "all five pools represented in a 30-round random game");
  for (const [prefix, n] of byPrefix) {
    assert.ok(n >= 3 && n <= 10, `pool ${prefix} unbalanced: ${n}/30`);
  }
});

test("default pick: 5 unique ids, varying by seed", () => {
  const picked = pickQuestionIds();
  assert.equal(picked.length, DEFAULT_ROUNDS);
  assert.equal(new Set(picked).size, DEFAULT_ROUNDS);
  const a = pickQuestionIds("random", 5, mulberry(1));
  const b = pickQuestionIds("random", 5, mulberry(99));
  assert.notDeepEqual(a, b);
});

test("getRoundQuestion maps rounds to picks; legacy numeric ids and fallback still work", () => {
  const picked = ["h3", "m10", "s5", "e20", "g7"];
  for (let round = 1; round <= 5; round++) {
    assert.equal(getRoundQuestion(picked, round).id, picked[round - 1]);
  }
  // legacy rooms stored numeric ids from the old 30-question pool
  assert.equal(getQuestionById(2).answer, "The strawberry");
  assert.equal(getRoundQuestion([2, 5, 9], 2).id, 5);
  // rooms with no question set at all fall back to the legacy pool order
  assert.ok(getRoundQuestion(undefined, 2).question.length > 0);
});

test("theme metadata: 5 themes with emoji and descriptions", () => {
  assert.equal(THEMES.length, 5);
  assert.deepEqual(
    THEMES.map((t) => t.key),
    ["random", "history", "movies", "sports", "english"]
  );
});

function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---- avatars ---- */

import { AVATARS, isAvatarKey } from "../lib/avatarData";

test("exactly 8 avatars, unique keys and labels", () => {
  assert.equal(AVATARS.length, 8);
  assert.equal(new Set(AVATARS.map((a) => a.key)).size, 8);
  assert.equal(new Set(AVATARS.map((a) => a.label)).size, 8);
  assert.ok(isAvatarKey("ninja"));
  assert.ok(!isAvatarKey("dragon"));
});

test("leaderboard delta math: previous score = total - round points, round 1 from 0", () => {
  // mirrors ScoreRow: from = max(0, score - delta)
  const from = (score: number, delta: number) => Math.max(0, score - delta);
  assert.equal(from(130, 130), 0); // round 1
  assert.equal(from(250, 40), 210); // later round
  assert.equal(from(90, 0), 90); // no points this round -> no movement
});

console.log(`\n${passed} tests passed ✅`);
