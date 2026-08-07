import type { Timestamp } from "firebase/firestore";

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;
export const TOTAL_ROUNDS = 5;
export const ANSWER_SECONDS = 60;
export const VOTING_SECONDS = 30;
export const MAX_ANSWER_LENGTH = 80;
export const MAX_NAME_LENGTH = 20;
export const ROOM_TTL_MS = 60 * 60 * 1000; // 1 hour
export const HEARTBEAT_MS = 20_000;
export const PRESENCE_TIMEOUT_MS = 60_000;
export const PHASE_GRACE_MS = 3_000;

/** Special author id for the real answer among voting options. */
export const REAL_ANSWER_ID = "REAL";

export type RoomPhase =
  | "LOBBY"
  | "ANSWER" // question shown + players submit (PRD phases 1+2)
  | "VOTING"
  | "REVEAL"
  | "SCOREBOARD"
  | "FINAL";

export interface VotingOption {
  /** Author playerId, or REAL_ANSWER_ID for the real answer. */
  id: string;
  text: string;
}

export interface RevealItem {
  optionId: string;
  text: string;
  authorName: string; // "The real answer" for REAL
  voterNames: string[];
  pointsEarned: number; // points this answer earned its author this round
  isReal: boolean;
}

export interface Room {
  roomCode: string;
  hostId: string;
  phase: RoomPhase;
  /** 1-based round number. */
  currentRound: number;
  /** Increments on Play Again; namespaces submission/vote doc ids. */
  gameCount: number;
  /** Epoch millis when the current timed phase ends; null for host-controlled phases. */
  phaseEndsAt: number | null;
  votingOptions: VotingOption[];
  revealOrder: RevealItem[];
  revealIndex: number;
  /** Guard against double scoring: `${gameCount}_${round}` of the last scored round. */
  scoredKey: string;
  createdAt: Timestamp;
  lastActivity: Timestamp;
}

export interface Player {
  id: string;
  name: string;
  score: number;
  connected: boolean;
  joinedAt: Timestamp;
  /** Epoch millis of last heartbeat. */
  lastSeen: number;
}

export interface Submission {
  playerId: string;
  answer: string; // trimmed display text; "" = blank submission
  round: number;
}

export interface Vote {
  playerId: string;
  optionId: string; // author playerId or REAL_ANSWER_ID
  round: number;
}

export interface Question {
  id: number;
  question: string;
  answer: string;
}
