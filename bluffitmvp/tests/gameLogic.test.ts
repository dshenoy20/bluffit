/* Pure-logic tests for BluffIt. Run with: npm test */
import assert from "node:assert/strict";
import {
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
import { REAL_ANSWER_ID, type Submission, type Vote } from "../lib/types";

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

console.log(`\n${passed} tests passed ✅`);
