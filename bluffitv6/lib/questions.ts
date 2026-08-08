import historyRaw from "@/data/questions/history.json";
import moviesRaw from "@/data/questions/movies.json";
import sportsRaw from "@/data/questions/sports.json";
import englishRaw from "@/data/questions/english.json";
import generalRaw from "@/data/questions/general.json";
import legacyRaw from "@/data/legacy-questions.json";
import { shuffle } from "./gameLogic";
import { DEFAULT_ROUNDS, type Question, type QuestionId } from "./types";

/* ---------------- themes ---------------- */

export type ThemeKey = "random" | "history" | "movies" | "sports" | "english";

export interface ThemeInfo {
  key: ThemeKey;
  emoji: string;
  label: string;
  description: string;
}

export const THEMES: ThemeInfo[] = [
  { key: "random", emoji: "🎲", label: "Random", description: "A balanced mix of everything" },
  { key: "history", emoji: "📜", label: "History", description: "Empires, discoveries & weird history" },
  { key: "movies", emoji: "🎬", label: "Movies & Pop Culture", description: "Hollywood, Bollywood, TV & music" },
  { key: "sports", emoji: "⚽", label: "Sports", description: "Cricket, football, Olympics & F1" },
  { key: "english", emoji: "📖", label: "English", description: "Words, idioms, books & origins" },
];

export const DEFAULT_THEME: ThemeKey = "random";

export function isThemeKey(v: unknown): v is ThemeKey {
  return typeof v === "string" && THEMES.some((t) => t.key === v);
}

/* ---------------- pools ---------------- */

type PoolTheme = Exclude<ThemeKey, "random">;

const POOLS: Record<PoolTheme | "general", Question[]> = {
  history: historyRaw as Question[],
  movies: moviesRaw as Question[],
  sports: sportsRaw as Question[],
  english: englishRaw as Question[],
  general: generalRaw as Question[],
};

/** Legacy pool: pre-themes rooms stored numeric question ids into these. */
const LEGACY: Question[] = (legacyRaw as { id: number; question: string; answer: string }[]).map(
  (q) => ({ id: q.id, question: q.question, answer: q.answer })
);

const ALL_QUESTIONS: Question[] = Object.values(POOLS).flat();

const BY_ID = new Map<QuestionId, Question>([
  ...ALL_QUESTIONS.map((q) => [q.id, q] as const),
  ...LEGACY.map((q) => [q.id, q] as const),
]);

export const QUESTION_POOL_SIZE = ALL_QUESTIONS.length;

/* ---------------- selection ---------------- */

/**
 * Pick `count` unique question ids for a game.
 * A specific theme draws from its own pool. "Random" draws a balanced mix:
 * every pool (including the general pool) is shuffled, then we interleave
 * across pools so no single theme dominates a game.
 */
export function pickQuestionIds(
  theme: ThemeKey = DEFAULT_THEME,
  count: number = DEFAULT_ROUNDS,
  random: () => number = Math.random
): QuestionId[] {
  if (theme !== "random") {
    return shuffle(POOLS[theme].map((q) => q.id), random).slice(0, count);
  }
  // Balanced mix: round-robin across all shuffled pools, then shuffle the result
  // so consecutive rounds don't follow a predictable theme rotation.
  const shuffledPools = Object.values(POOLS).map((pool) =>
    shuffle(pool.map((q) => q.id), random)
  );
  const interleaved: QuestionId[] = [];
  for (let i = 0; interleaved.length < count && i < 200; i++) {
    for (const pool of shuffledPools) {
      if (i < pool.length) interleaved.push(pool[i]);
    }
  }
  return shuffle(interleaved.slice(0, Math.max(count, 0) + 10), random).slice(0, count);
}

export function getQuestionById(id: QuestionId): Question {
  return BY_ID.get(id) ?? ALL_QUESTIONS[0];
}

/**
 * Resolve the question for a 1-based round from the room's picked set.
 * Rooms created before question sets existed fall back to the legacy pool.
 */
export function getRoundQuestion(
  questionIds: QuestionId[] | undefined,
  round: number
): Question {
  const id = questionIds?.[round - 1];
  if (id !== undefined) return getQuestionById(id);
  return LEGACY[(round - 1) % LEGACY.length];
}
