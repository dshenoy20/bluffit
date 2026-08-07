import {
  collection,
  doc,
  getDoc,
  increment,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentReference,
  type Transaction,
} from "firebase/firestore";
import { getDb } from "./firebase";
import { getRoundQuestion, pickQuestionIds } from "./questions";
import {
  buildVotingOptions,
  generateRoomCode,
  sanitizeName,
  scoreRound,
  validateAnswer,
} from "./gameLogic";
import {
  ANSWER_SECONDS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PRESENCE_TIMEOUT_MS,
  REVEAL_SECONDS,
  ROOM_TTL_MS,
  TOTAL_ROUNDS,
  VOTING_SECONDS,
  type Player,
  type Room,
  type Submission,
  type Vote,
} from "./types";

/* ---------- refs ---------- */

export const roomRef = (code: string) => doc(getDb(), "rooms", code);
export const playerRef = (code: string, uid: string) =>
  doc(getDb(), "rooms", code, "players", uid);
export const playersCol = (code: string) => collection(getDb(), "rooms", code, "players");
export const submissionRef = (code: string, game: number, round: number, uid: string) =>
  doc(getDb(), "rooms", code, "submissions", `${game}_${round}_${uid}`);
export const voteRef = (code: string, game: number, round: number, uid: string) =>
  doc(getDb(), "rooms", code, "votes", `${game}_${round}_${uid}`);
export const statsRef = () => doc(getDb(), "stats", "global");

/** roster lives on the room doc so joins/host logic/scoring need no queries inside transactions */
export interface RoomDoc extends Room {
  roster: Record<string, string>; // uid -> name
}

export class GameError extends Error {}

/* ---------- helpers ---------- */

export function isRoomExpired(room: RoomDoc): boolean {
  const last = room.lastActivity?.toMillis?.() ?? Date.now();
  return Date.now() - last > ROOM_TTL_MS;
}

export function isPlayerConnected(p: Player, now = Date.now()): boolean {
  return p.connected && now - p.lastSeen < PRESENCE_TIMEOUT_MS;
}

/** Effective host: original host if connected, otherwise the oldest connected player. */
export function getEffectiveHostId(room: RoomDoc, players: Player[]): string {
  const host = players.find((p) => p.id === room.hostId);
  if (host && isPlayerConnected(host)) return room.hostId;
  const connected = players
    .filter(isPlayerConnected)
    .sort((a, b) => (a.joinedAt?.toMillis?.() ?? 0) - (b.joinedAt?.toMillis?.() ?? 0));
  return connected[0]?.id ?? room.hostId;
}

async function getRoomTx(tx: Transaction, ref: DocumentReference): Promise<RoomDoc> {
  const snap = await tx.get(ref);
  if (!snap.exists()) throw new GameError("This room no longer exists.");
  const room = snap.data() as RoomDoc;
  if (isRoomExpired(room)) throw new GameError("This room has expired.");
  return room;
}

const touch = { lastActivity: serverTimestamp() };

/* ---------- lobby actions ---------- */

export async function createRoom(uid: string, rawName: string): Promise<string> {
  const name = sanitizeName(rawName);
  if (!name) throw new GameError("Please enter your name.");

  // Try a few codes in case of collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode();
    const ref = roomRef(code);
    const existing = await getDoc(ref);
    // Never reuse a code, even for an expired room — its old
    // player/submission docs would leak into the new game.
    if (existing.exists()) continue;

    await setDoc(ref, {
      roomCode: code,
      hostId: uid,
      phase: "LOBBY",
      currentRound: 1,
      gameCount: 1,
      phaseEndsAt: null,
      votingOptions: [],
      revealOrder: [],
      revealIndex: 0,
      scoredKey: "",
      roster: { [uid]: name },
      createdAt: serverTimestamp(),
      lastActivity: serverTimestamp(),
    });
    await setDoc(playerRef(code, uid), {
      id: uid,
      name,
      score: 0,
      connected: true,
      joinedAt: serverTimestamp(),
      lastSeen: Date.now(),
    });
    void setDoc(statsRef(), { gamesCreated: increment(1) }, { merge: true }).catch(() => {});
    return code;
  }
  throw new GameError("Could not create a room. Please try again.");
}

export async function joinRoom(code: string, uid: string, rawName: string): Promise<void> {
  const name = sanitizeName(rawName);
  if (!name) throw new GameError("Please enter your name.");

  await runTransaction(getDb(), async (tx) => {
    const room = await getRoomTx(tx, roomRef(code));
    if (room.roster[uid]) {
      // Rejoin: just refresh presence.
      tx.update(playerRef(code, uid), { connected: true, lastSeen: Date.now() });
      return;
    }
    if (room.phase !== "LOBBY")
      throw new GameError("This game is already in progress. Ask the host for a new room once it ends.");
    const count = Object.keys(room.roster).length;
    if (count >= MAX_PLAYERS)
      throw new GameError(`This room is full (${MAX_PLAYERS} players max).`);
    const taken = Object.values(room.roster).map((n) => n.toLowerCase());
    if (taken.includes(name.toLowerCase()))
      throw new GameError("That name is taken in this room. Pick another one.");

    tx.update(roomRef(code), { [`roster.${uid}`]: name, ...touch });
    tx.set(playerRef(code, uid), {
      id: uid,
      name,
      score: 0,
      connected: true,
      joinedAt: serverTimestamp(),
      lastSeen: Date.now(),
    });
  });
}

export async function leaveLobby(code: string, uid: string): Promise<void> {
  await runTransaction(getDb(), async (tx) => {
    const room = await getRoomTx(tx, roomRef(code));
    if (room.phase !== "LOBBY") return;
    const roster = { ...room.roster };
    delete roster[uid];
    const update: Record<string, unknown> = { roster, ...touch };
    // If the host leaves the lobby, pass host to someone else in the roster.
    if (room.hostId === uid) {
      const next = Object.keys(roster)[0];
      if (next) update.hostId = next;
    }
    tx.update(roomRef(code), update);
    tx.delete(playerRef(code, uid));
  });
}

export async function startGame(code: string): Promise<void> {
  await runTransaction(getDb(), async (tx) => {
    const room = await getRoomTx(tx, roomRef(code));
    if (room.phase !== "LOBBY") return; // already started
    if (Object.keys(room.roster).length < MIN_PLAYERS)
      throw new GameError(`You need at least ${MIN_PLAYERS} players to start.`);
    tx.update(roomRef(code), {
      phase: "ANSWER",
      currentRound: 1,
      questionIds: pickQuestionIds(), // fresh random 5 from the pool
      phaseEndsAt: Date.now() + ANSWER_SECONDS * 1000,
      votingOptions: [],
      revealOrder: [],
      revealIndex: 0,
      ...touch,
    });
  });
}

/* ---------- round actions ---------- */

export async function submitAnswer(code: string, uid: string, text: string): Promise<void> {
  await runTransaction(getDb(), async (tx) => {
    const room = await getRoomTx(tx, roomRef(code));
    if (room.phase !== "ANSWER") throw new GameError("Answering time is over.");
    const { currentRound: round, gameCount: game } = room;

    const ownRef = submissionRef(code, game, round, uid);
    const own = await tx.get(ownRef);
    if (own.exists()) throw new GameError("You already submitted an answer.");

    const others: string[] = [];
    for (const pid of Object.keys(room.roster)) {
      if (pid === uid) continue;
      const snap = await tx.get(submissionRef(code, game, round, pid));
      if (snap.exists()) others.push((snap.data() as Submission).answer);
    }

    const real = getRoundQuestion(room.questionIds, round).answer;
    const result = validateAnswer(text, real, others);
    if (!result.ok) throw new GameError(result.reason);

    tx.set(ownRef, {
      playerId: uid,
      answer: result.cleaned,
      round,
      rk: `${game}_${round}`,
    });
    tx.update(roomRef(code), touch);
  });
}

export async function castVote(code: string, uid: string, optionId: string): Promise<void> {
  await runTransaction(getDb(), async (tx) => {
    const room = await getRoomTx(tx, roomRef(code));
    if (room.phase !== "VOTING") throw new GameError("Voting time is over.");
    if (optionId === uid) throw new GameError("You can't vote for your own answer.");
    if (!room.votingOptions.some((o) => o.id === optionId))
      throw new GameError("That answer is not available.");
    const { currentRound: round, gameCount: game } = room;
    const ownRef = voteRef(code, game, round, uid);
    const own = await tx.get(ownRef);
    if (own.exists()) throw new GameError("You already voted.");
    tx.set(ownRef, { playerId: uid, optionId, round, rk: `${game}_${round}` });
    tx.update(roomRef(code), touch);
  });
}

/* ---------- phase transitions (any client may drive; transactions make them idempotent) ---------- */

/**
 * Guard for early advancement, evaluated INSIDE the transaction.
 * Before the phase deadline, advancing is only legal if every player who
 * hasn't acted is disconnected. This makes it impossible for a client with
 * stale listener data (e.g. still holding last round's submissions) to skip
 * a phase that has really just begun.
 */
async function assertEarlyAdvanceAllowed(
  tx: Transaction,
  code: string,
  room: RoomDoc,
  missing: string[]
): Promise<boolean> {
  if (room.phaseEndsAt && Date.now() >= room.phaseEndsAt) return true; // timer over
  for (const pid of missing) {
    const snap = await tx.get(playerRef(code, pid));
    if (snap.exists() && isPlayerConnected(snap.data() as Player)) {
      return false; // a connected player still hasn't acted — too early
    }
  }
  return true;
}

/** ANSWER -> VOTING. Fills blanks for players who didn't submit, builds shuffled options. */
export async function advanceFromAnswer(code: string): Promise<void> {
  await runTransaction(getDb(), async (tx) => {
    const room = await getRoomTx(tx, roomRef(code));
    if (room.phase !== "ANSWER") return;
    const { currentRound: round, gameCount: game } = room;

    const submissions: Submission[] = [];
    const missing: string[] = [];
    for (const pid of Object.keys(room.roster)) {
      const snap = await tx.get(submissionRef(code, game, round, pid));
      if (snap.exists()) submissions.push(snap.data() as Submission);
      else missing.push(pid);
    }

    if (!(await assertEarlyAdvanceAllowed(tx, code, room, missing))) return;

    for (const pid of missing) {
      tx.set(submissionRef(code, game, round, pid), {
        playerId: pid,
        answer: "",
        round,
        rk: `${game}_${round}`,
      });
      submissions.push({ playerId: pid, answer: "", round });
    }

    const options = buildVotingOptions(submissions, getRoundQuestion(room.questionIds, round).answer);
    tx.update(roomRef(code), {
      phase: "VOTING",
      votingOptions: options,
      phaseEndsAt: Date.now() + VOTING_SECONDS * 1000,
      ...touch,
    });
  });
}

/** VOTING -> REVEAL. Scores the round exactly once (scoredKey guard). */
export async function advanceFromVoting(code: string): Promise<void> {
  await runTransaction(getDb(), async (tx) => {
    const room = await getRoomTx(tx, roomRef(code));
    if (room.phase !== "VOTING") return;
    const { currentRound: round, gameCount: game } = room;
    const key = `${game}_${round}`;
    if (room.scoredKey === key) return;

    const uids = Object.keys(room.roster);
    const votes: Vote[] = [];
    const playerDocs: { ref: DocumentReference; player: Player }[] = [];
    for (const pid of uids) {
      const vSnap = await tx.get(voteRef(code, game, round, pid));
      if (vSnap.exists()) votes.push(vSnap.data() as Vote);
      const pRef = playerRef(code, pid);
      const pSnap = await tx.get(pRef);
      if (pSnap.exists())
        playerDocs.push({ ref: pRef, player: pSnap.data() as Player });
    }

    // Early advance is only legal if every silent player is disconnected.
    if (room.phaseEndsAt && Date.now() < room.phaseEndsAt) {
      const votedIds = new Set(votes.map((v) => v.playerId));
      const silentConnected = playerDocs.some(
        ({ player }) => !votedIds.has(player.id) && isPlayerConnected(player)
      );
      if (silentConnected) return;
    }

    const names = uids.map((id) => ({ id, name: room.roster[id] }));
    const { pointsByPlayer, revealOrder } = scoreRound(
      room.votingOptions,
      votes,
      names
    );

    for (const { ref, player } of playerDocs) {
      const pts = pointsByPlayer[player.id] ?? 0;
      if (pts > 0) tx.update(ref, { score: player.score + pts });
    }

    tx.update(roomRef(code), {
      phase: "REVEAL",
      revealOrder,
      revealIndex: 0,
      phaseEndsAt: Date.now() + REVEAL_SECONDS * 1000, // personal result screen
      scoredKey: key,
      ...touch,
    });
  });
}

/** REVEAL -> SCOREBOARD, automatic after the personal-result screen. */
export async function advanceFromReveal(code: string): Promise<void> {
  await runTransaction(getDb(), async (tx) => {
    const room = await getRoomTx(tx, roomRef(code));
    if (room.phase !== "REVEAL") return;
    tx.update(roomRef(code), { phase: "SCOREBOARD", phaseEndsAt: null, ...touch });
  });
}

/** SCOREBOARD -> next round's ANSWER, or FINAL after round 5. Host-controlled. */
export async function continueFromScoreboard(code: string): Promise<void> {
  await runTransaction(getDb(), async (tx) => {
    const room = await getRoomTx(tx, roomRef(code));
    if (room.phase !== "SCOREBOARD") return;
    if (room.currentRound < TOTAL_ROUNDS) {
      tx.update(roomRef(code), {
        phase: "ANSWER",
        currentRound: room.currentRound + 1,
        phaseEndsAt: Date.now() + ANSWER_SECONDS * 1000,
        votingOptions: [],
        revealOrder: [],
        revealIndex: 0,
        ...touch,
      });
    } else {
      tx.update(roomRef(code), { phase: "FINAL", phaseEndsAt: null, ...touch });
      tx.set(statsRef(), { gamesCompleted: increment(1) }, { merge: true });
    }
  });
}

/** FINAL -> round 1 ANSWER with scores reset. Host-controlled. */
export async function playAgain(code: string): Promise<void> {
  await runTransaction(getDb(), async (tx) => {
    const room = await getRoomTx(tx, roomRef(code));
    if (room.phase !== "FINAL") return;
    const playerRefs: DocumentReference[] = [];
    for (const pid of Object.keys(room.roster)) {
      const pRef = playerRef(code, pid);
      const snap = await tx.get(pRef);
      if (snap.exists()) playerRefs.push(pRef);
    }
    for (const pRef of playerRefs) tx.update(pRef, { score: 0 });
    tx.update(roomRef(code), {
      phase: "ANSWER",
      currentRound: 1,
      gameCount: room.gameCount + 1,
      questionIds: pickQuestionIds(), // fresh random 5 for the rematch
      phaseEndsAt: Date.now() + ANSWER_SECONDS * 1000,
      votingOptions: [],
      revealOrder: [],
      revealIndex: 0,
      scoredKey: "",
      ...touch,
    });
  });
}

/* ---------- presence & stats ---------- */

export async function heartbeat(code: string, uid: string): Promise<void> {
  await updateDoc(playerRef(code, uid), {
    connected: true,
    lastSeen: Date.now(),
  }).catch(() => {});
}

export async function markDisconnected(code: string, uid: string): Promise<void> {
  await updateDoc(playerRef(code, uid), { connected: false }).catch(() => {});
}

const VISITOR_KEY = "bluffit:visited";

/** Count each browser once as a visitor. */
export async function bumpVisitorCount(): Promise<void> {
  try {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(VISITOR_KEY)) return;
    window.localStorage.setItem(VISITOR_KEY, "1");
    await setDoc(statsRef(), { visitors: increment(1) }, { merge: true });
  } catch {
    /* stats must never break the game */
  }
}
