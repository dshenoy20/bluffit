import raw from "@/data/questions.json";
import type { Question } from "./types";

export const QUESTIONS: Question[] = raw as Question[];

/** round is 1-based. */
export function getQuestion(round: number): Question {
  return QUESTIONS[round - 1];
}
