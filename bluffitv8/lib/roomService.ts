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
import { logAnalyticsError } from "./analytics";
import {
  DEFAULT_THEME,
  getRoundQuestion,
  isThemeKey,
  pickQuestionIds,
  type ThemeKey,
} from "./questions";
import {
  buildVotingOptions,
  generateRoomCode,
  sanitizeName,
  scoreRound,
  validateAnswer,
} from "./gameLogic";
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  PRESENCE_TIMEOUT_MS,
  ROOM_TTL_MS,
  DEFAULT_ROUNDS,
  REAL_ANSWER_ID,
  ROUND_OPTIONS,
  VOTING_SECONDS,
  getTotalRounds,
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

export interface RoomSettings {
  theme: ThemeKey;
  totalRounds: number;
}

export async function createRoom(
  uid: string,
  rawName: string,
  settings?: Partial<RoomSettings>
): Promise<string> {
  const name = sanitizeName(rawName);
  if (!name) throw new GameError("Please enter your name.");
  const theme = isThemeKey(settings?.theme) ? settings!.theme! : DEFAULT_THEME;
  const totalRounds = (ROUND_OPTIONS as readonly number[]).includes(
    settings?.totalRounds ?? DEFAULT_ROUNDS
  )
    ? settings?.totalRounds ?? DEFAULT_ROUNDS
    : DEFAULT_ROUNDS;

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
      theme,
      totalRounds,
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
    void setDoc(
      statsRef(),
      {
        roomsCreated: increment(1),
        themeCounts: { [theme]: increment(1) },
        roundsCounts: { [String(totalRounds)]: increment(1) },
      },
      { merge: true }
    ).catch((err) => logAnalyticsError("roomsCreated/themeCounts/roundsCounts", err));
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
    const avatars = { ...(room.avatars ?? {}) };
    delete avatars[uid]; // leaving frees the avatar for others
    const update: Record<string, unknown> = { roster, avatars, ...touch };
    // If the host leaves the lobby, pass host to someone else in the roster.
    if (room.hostId === uid) {
      const next = Object.keys(roster)[0];
      if (next) update.hostId = next;
    }
    tx.update(roomRef(code), update);
    tx.delete(playerRef(code, uid));
  });
}

/**
 * Fully leave a finished game (FINAL screen "Exit"). Unlike a mere
 * disconnect, this removes the player from the roster and frees their avatar,
 * so a host who clicks Play Again afterwards doesn't drag ghost players into
 * the rematch. If the exiting player is the host, the role passes to the
 * earliest-joined remaining player. Outside FINAL/LOBBY it just marks the
 * player disconnected (mid-game rosters must stay intact for scoring).
 */
export async function exitRoom(code: string, uid: string): Promise<void> {
  try {
    await runTransaction(getDb(), async (tx) => {
      const snap = await tx.get(roomRef(code));
      if (!snap.exists()) return;
      const room = snap.data() as RoomDoc;
      if (room.phase !== "FINAL" && room.phase !== "LOBBY") {
        tx.update(playerRef(code, uid), { connected: false });
        return;
      }
      if (!room.roster[uid]) return;
      const roster = { ...room.roster };
      delete roster[uid];
      const avatars = { ...(room.avatars ?? {}) };
      delete avatars[uid];
      const update: Record<string, unknown> = { roster, avatars, ...touch };
      if (room.hostId === uid) {
        const next = Object.keys(roster)[0];
        if (next) update.hostId = next;
      }
      tx.update(roomRef(code), update);
      tx.delete(playerRef(code, uid));
    });
  } catch {
    // Leaving must never trap the player on the screen — fall back to a
    // soft disconnect and let them go.
    await markDisconnected(code, uid);
  }
}

/**
 * Pick (or change) an avatar. Uniqueness is enforced inside a transaction on
 * the room document, so two players racing for the same avatar can never both
 * get it — the second transaction re-reads and fails with a friendly error.
 * Changing avatars implicitly frees the previous one (the map is keyed by uid).
 */
export async function selectAvatar(code: string, uid: string, avatarKey: string): Promise<void> {
  await runTransaction(getDb(), async (tx) => {
    const room = await getRoomTx(tx, roomRef(code));
    if (!room.roster[uid]) throw new GameError("You are not in this room.");
    const avatars = room.avatars ?? {};
    const takenBy = Object.entries(avatars).find(
      ([pid, key]) => key === avatarKey && pid !== uid
    );
    if (takenBy)
      throw new GameError(
        `${room.roster[takenBy[0]] ?? "Another player"} already picked that one!`
      );
    tx.update(roomRef(code), { [`avatars.${uid}`]: avatarKey, ...touch });
  });
}

/**
 * Persistently transfer host to the caller when the current host has
 * disconnected. Transactional: of several clients detecting the dead host at
 * once, exactly one write wins; the others re-read the new (connected) host
 * and abort. The transfer is permanent — a returning old host does NOT
 * reclaim the role.
 */
export async function claimHost(code: string, uid: string): Promise<void> {
  await runTransaction(getDb(), async (tx) => {
    const room = await getRoomTx(tx, roomRef(code));
    if (room.hostId === uid) return; // already host
    if (!room.roster[uid]) return;

    // Abort if the current host is actually still connected.
    const hostSnap = await tx.get(playerRef(code, room.hostId));
    if (hostSnap.exists() && isPlayerConnected(hostSnap.data() as Player)) return;

    // The claimer must be connected...
    const meSnap = await tx.get(playerRef(code, uid));
    if (!meSnap.exists() || !isPlayerConnected(meSnap.data() as Player)) return;
    const myJoin = (meSnap.data() as Player).joinedAt?.toMillis?.() ?? 0;

    // ...and must be the earliest-joined connected player (deterministic
    // uid tie-break), so every client agrees on the single rightful claimer.
    for (const pid of Object.keys(room.roster)) {
      if (pid === uid || pid === room.hostId) continue;
      const snap = await tx.get(playerRef(code, pid));
      if (!snap.exists()) continue;
      const p = snap.data() as Player;
      if (!isPlayerConnected(p)) continue;
      const pJoin = p.joinedAt?.toMillis?.() ?? 0;
      if (pJoin < myJoin || (pJoin === myJoin && pid < uid)) return;
    }

    tx.update(roomRef(code), { hostId: uid, ...touch });
  });
}

export async function startGame(code: string): Promise<void> {
  await runTransaction(getDb(), async (tx) => {
    const room = await getRoomTx(tx, roomRef(code));
    if (room.phase !== "LOBBY") return; // already started
    if (Object.keys(room.roster).length < MIN_PLAYERS)
      throw new GameError(`You need at least ${MIN_PLAYERS} players to start.`);
    const theme = isThemeKey(room.theme) ? room.theme : DEFAULT_THEME;
    tx.update(roomRef(code), {
      phase: "ANSWER",
      currentRound: 1,
      questionIds: pickQuestionIds(theme, getTotalRounds(room)),
      gameStartedAt: Date.now(),
      roundPoints: {},
      phaseEndsAt: null, // answer phase is untimed: waits for all connected players
      votingOptions: [],
      revealOrder: [],
      revealIndex: 0,
      ...touch,
    });
    tx.set(statsRef(), { gamesStarted: increment(1) }, { merge: true });
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
    tx.set(ownRef, {
      playerId: uid,
      optionId,
      round,
      rk: `${game}_${round}`,
      at: serverTimestamp(), // ranks correct votes: earlier pick = more points
    });
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

interface QuestionRoundStats {
  qDocId: string;
  totalVotes: number;
  correctPicks: number;
  playersFooled: number;
  pointsGenerated: number;
}

/** VOTING -> REVEAL. Scores the round exactly once (scoredKey guard). */
export async function advanceFromVoting(code: string): Promise<void> {
  const qStats = await runTransaction<QuestionRoundStats | null>(getDb(), async (tx) => {
    const room = await getRoomTx(tx, roomRef(code));
    if (room.phase !== "VOTING") return null;
    const { currentRound: round, gameCount: game } = room;
    const key = `${game}_${round}`;
    if (room.scoredKey === key) return null;

    const uids = Object.keys(room.roster);
    const votes: Vote[] = [];
    const playerDocs: { ref: DocumentReference; player: Player }[] = [];
    for (const pid of uids) {
      const vSnap = await tx.get(voteRef(code, game, round, pid));
      if (vSnap.exists()) {
        const raw = vSnap.data() as Vote & { at?: { toMillis?: () => number } };
        votes.push({ ...raw, atMs: raw.at?.toMillis?.() ?? raw.atMs });
      }
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
      if (silentConnected) return null;
    }

    const names = uids.map((id) => ({ id, name: room.roster[id] }));
    const { pointsByPlayer, correctAwards, revealOrder } = scoreRound(
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
      correctAwards,
      roundPoints: pointsByPlayer, // leaderboard "+X this round" deltas
      revealIndex: 0,
      phaseEndsAt: null, // results stay up until the host clicks "Show Leaderboard"
      scoredKey: key,
      ...touch,
    });

    // Compute per-question analytics but return them for a post-commit write:
    // the write is NOT part of this transaction, so a permission problem on
    // questionStats (e.g. rules not published) can never block the game.
    const qid = getRoundQuestion(room.questionIds, round).id;
    const correctPicks = votes.filter((v) => v.optionId === REAL_ANSWER_ID).length;
    return {
      qDocId: typeof qid === "number" ? `legacy_${qid}` : String(qid),
      totalVotes: votes.length,
      correctPicks,
      playersFooled: votes.length - correctPicks,
      pointsGenerated: Object.values(pointsByPlayer).reduce((a, b) => a + b, 0),
    };
  });

  // Exactly one client wins the VOTING->REVEAL transition (scoredKey guard),
  // and only that client receives a non-null payload — so this still writes
  // exactly once per round. Best effort, loudly logged on failure.
  if (qStats) {
    try {
      await setDoc(
        doc(getDb(), "questionStats", qStats.qDocId),
        {
          timesPlayed: increment(1),
          totalVotes: increment(qStats.totalVotes),
          correctPicks: increment(qStats.correctPicks),
          playersFooled: increment(qStats.playersFooled),
          pointsGenerated: increment(qStats.pointsGenerated),
        },
        { merge: true }
      );
    } catch (err) {
      logAnalyticsError(`questionStats/${qStats.qDocId}`, err);
    }
  }
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
    const finalRound = room.currentRound >= getTotalRounds(room);
    // All reads must precede writes in a transaction; read stats now if we
    // need the current max-consecutive-games value for the FINAL branch.
    const prevMaxConsecutive = finalRound
      ? ((await tx.get(statsRef())).data()?.maxConsecutiveGamesInARoom as number) ?? 0
      : 0;
    if (!finalRound) {
      tx.update(roomRef(code), {
        phase: "ANSWER",
        currentRound: room.currentRound + 1,
        roundPoints: {},
      phaseEndsAt: null, // answer phase is untimed: waits for all connected players
        votingOptions: [],
        revealOrder: [],
        revealIndex: 0,
        ...touch,
      });
    } else {
      tx.update(roomRef(code), { phase: "FINAL", phaseEndsAt: null, ...touch });
      // Game-completion analytics (inside the same idempotent transition).
      const duration = room.gameStartedAt ? Date.now() - room.gameStartedAt : 0;
      tx.set(
        statsRef(),
        {
          gamesCompleted: increment(1),
          ...(room.gameCount === 1 ? { roomsCompleted: increment(1) } : {}),
          ...(room.gameCount > 1 ? { backToBackGamesCompleted: increment(1) } : {}),
          ...(duration > 0 ? { totalGameDurationMs: increment(duration) } : {}),
          totalPlayersInCompletedGames: increment(Object.keys(room.roster).length),
          ...(room.gameCount > prevMaxConsecutive
            ? { maxConsecutiveGamesInARoom: room.gameCount }
            : {}),
        },
        { merge: true }
      );
    }
  });
}

/** FINAL -> round 1 ANSWER with scores reset. Host-controlled; host may pick a new round count. */
export async function playAgain(code: string, newTotalRounds?: number): Promise<void> {
  await runTransaction(getDb(), async (tx) => {
    const room = await getRoomTx(tx, roomRef(code));
    if (room.phase !== "FINAL") return;
    const totalRounds = (ROUND_OPTIONS as readonly number[]).includes(newTotalRounds ?? -1)
      ? (newTotalRounds as number)
      : getTotalRounds(room);
    const playerRefs: DocumentReference[] = [];
    for (const pid of Object.keys(room.roster)) {
      const pRef = playerRef(code, pid);
      const snap = await tx.get(pRef);
      if (snap.exists()) playerRefs.push(pRef);
    }
    for (const pRef of playerRefs) tx.update(pRef, { score: 0 });
    const theme = isThemeKey(room.theme) ? room.theme : DEFAULT_THEME;
    tx.set(
      statsRef(),
      { playAgainClicks: increment(1), gamesStarted: increment(1) },
      { merge: true }
    );
    tx.update(roomRef(code), {
      phase: "ANSWER",
      currentRound: 1,
      gameCount: room.gameCount + 1,
      gameStartedAt: Date.now(),
      totalRounds,
      questionIds: pickQuestionIds(theme, totalRounds), // fresh set for the rematch
      roundPoints: {},
      phaseEndsAt: null, // answer phase is untimed: waits for all connected players
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

/* Visitor/session counting lives in lib/analytics.ts (AnalyticsTracker in the root layout). */
