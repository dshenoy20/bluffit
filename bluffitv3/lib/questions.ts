import raw from "@/data/questions.json";
import { shuffle } from "./gameLogic";
import { TOTAL_ROUNDS, type Question } from "./types";

export const QUESTION_POOL: Question[] = raw as Question[];

/** Pick N unique question ids at random from the pool (fresh set every game). */
export function pickQuestionIds(
  count: number = TOTAL_ROUNDS,
  random: () => number = Math.random
): number[] {
  return shuffle(QUESTION_POOL.map((q) => q.id), random).slice(0, count);
}

export function getQuestionById(id: number): Question {
  return QUESTION_POOL.find((q) => q.id === id) ?? QUESTION_POOL[0];
}

/**
 * Resolve the question for a 1-based round from the room's picked set.
 * Falls back to the first questions in the pool for rooms created before
 * question sets existed (backward compatibility with live games).
 */
export function getRoundQuestion(
  questionIds: number[] | undefined,
  round: number
): Question {
  const id = questionIds?.[round - 1];
  return id !== undefined ? getQuestionById(id) : QUESTION_POOL[round - 1];
}
