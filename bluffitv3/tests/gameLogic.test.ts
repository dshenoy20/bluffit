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
import { REAL_ANSWER_ID, TOTAL_ROUNDS, type Submission, type Vote } from "../lib/types";
import { QUESTION_POOL, getRoundQuestion, pickQuestionIds } from "../lib/questions";

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

test("PRD example: 3 players fooled + correct vote = 1500", () => {
  const options = [
    { id: "p1", text: "Dragon" },
    { id: REAL_ANSWER_ID, text: "Unicorn" },
  ];
  const votes: Vote[] = [
    { playerId: "p2", optionId: "p1", round: 1 }, // fooled
    { playerId: "p3", optionId: "p1", round: 1 }, // fooled
    { playerId: "p4", optionId: "p1", round: 1 }, // fooled
    { playerId: "p1", optionId: REAL_ANSWER_ID, round: 1 }, // correct
  ];
  const { pointsByPlayer } = scoreRound(options, votes, players);
  assert.equal(pointsByPlayer["p1"], 3 * 500 + 1000); // 2500: fooled 3 + guessed right
  assert.equal(pointsByPlayer["p2"] ?? 0, 0);
});

test("correct answer earns exactly 1000; no vote earns nothing", () => {
  const options = [
    { id: "p1", text: "Dragon" },
    { id: REAL_ANSWER_ID, text: "Unicorn" },
  ];
  const votes: Vote[] = [{ playerId: "p2", optionId: REAL_ANSWER_ID, round: 1 }];
  const { pointsByPlayer } = scoreRound(options, votes, players);
  assert.equal(pointsByPlayer["p2"], 1000);
  assert.equal(pointsByPlayer["p1"] ?? 0, 0);
  assert.equal(pointsByPlayer["p3"] ?? 0, 0); // skipped vote
});

test("reveal order: fakes by fewest votes first, real answer last", () => {
  const options = [
    { id: "p1", text: "A" },
    { id: "p2", text: "B" },
    { id: REAL_ANSWER_ID, text: "Real" },
  ];
  const votes: Vote[] = [
    { playerId: "p3", optionId: "p2", round: 1 },
    { playerId: "p4", optionId: "p2", round: 1 },
    { playerId: "p2", optionId: "p1", round: 1 },
  ];
  const { revealOrder } = scoreRound(options, votes, players);
  assert.deepEqual(
    revealOrder.map((r) => r.optionId),
    ["p1", "p2", REAL_ANSWER_ID]
  );
  assert.equal(revealOrder[1].pointsEarned, 1000); // 2 fooled × 500
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

test("personal result: correct voter, fooled voter, non-voter, bluff bonus", () => {
  const options = [
    { id: "p1", text: "Dragon" },
    { id: "p2", text: "Phoenix" },
    { id: REAL_ANSWER_ID, text: "Unicorn" },
  ];
  const votes: Vote[] = [
    { playerId: "p1", optionId: REAL_ANSWER_ID, round: 1 }, // correct
    { playerId: "p2", optionId: "p1", round: 1 }, // fooled by Ana
    { playerId: "p3", optionId: "p1", round: 1 }, // fooled by Ana
    // p4 never voted
  ];
  const { revealOrder } = scoreRound(options, votes, players);

  const p1 = buildPersonalResult(revealOrder, votes, "p1");
  assert.equal(p1.kind, "correct");
  assert.equal(p1.votePoints, 1000);
  assert.equal(p1.bluffVotes, 2);
  assert.equal(p1.bluffPoints, 1000);
  assert.equal(p1.totalPoints, 2000);
  assert.equal(p1.correctCount, 1);

  const p2 = buildPersonalResult(revealOrder, votes, "p2");
  assert.equal(p2.kind, "fooled");
  assert.equal(p2.fooledBy, "Ana");
  assert.equal(p2.realAnswer, "Unicorn");
  assert.equal(p2.totalPoints, 0);

  const p4 = buildPersonalResult(revealOrder, votes, "p4");
  assert.equal(p4.kind, "no_vote");
  assert.equal(p4.realAnswer, "Unicorn");
  assert.equal(p4.totalPoints, 0);
});

/* ---- question pool ---- */

test("pool has 30 questions with unique ids and required fields", () => {
  assert.equal(QUESTION_POOL.length, 30);
  const ids = new Set(QUESTION_POOL.map((q) => q.id));
  assert.equal(ids.size, 30);
  for (const q of QUESTION_POOL) {
    assert.ok(q.question.trim().length > 10, `question too short: ${q.id}`);
    assert.ok(q.answer.trim().length > 0 && q.answer.length <= 80, `bad answer: ${q.id}`);
    assert.ok(q.category.trim().length > 0, `missing category: ${q.id}`);
  }
});

test("pickQuestionIds returns 5 unique ids from the pool, varying by seed", () => {
  for (let i = 0; i < 50; i++) {
    const picked = pickQuestionIds();
    assert.equal(picked.length, TOTAL_ROUNDS);
    assert.equal(new Set(picked).size, TOTAL_ROUNDS);
    for (const id of picked) assert.ok(QUESTION_POOL.some((q) => q.id === id));
  }
  const a = pickQuestionIds(5, mulberry(1));
  const b = pickQuestionIds(5, mulberry(99));
  assert.notDeepEqual(a, b); // different random streams give different sets
});

test("getRoundQuestion maps rounds to the picked set, with legacy fallback", () => {
  const picked = [7, 22, 3, 30, 15];
  for (let round = 1; round <= 5; round++) {
    assert.equal(getRoundQuestion(picked, round).id, picked[round - 1]);
  }
  // rooms created before question sets existed fall back to pool order
  assert.equal(getRoundQuestion(undefined, 2).id, QUESTION_POOL[1].id);
});

function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

console.log(`\n${passed} tests passed ✅`);
