"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
  doc,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { getDb, ensureSignedIn } from "./firebase";
import {
  advanceFromAnswer,
  advanceFromVoting,
  claimHost,
  getEffectiveHostId,
  heartbeat,
  isPlayerConnected,
  markDisconnected,
  playersCol,
  roomRef,
  type RoomDoc,
} from "./roomService";
import {
  HEARTBEAT_MS,
  PHASE_GRACE_MS,
  type Player,
  type Submission,
  type Vote,
} from "./types";

/* ---------- auth ---------- */

export function useAuthUser() {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    ensureSignedIn()
      .then(setUser)
      .catch(() => setError("Could not connect. Check your internet and refresh."));
  }, []);
  return { user, error };
}

/* ---------- 1-second tick (drives countdowns and presence freshness) ---------- */

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/* ---------- room state ---------- */

export interface RoomState {
  room: RoomDoc | null;
  players: Player[];
  submissions: Submission[]; // current round only
  votes: Vote[]; // current round only
  loading: boolean;
  missing: boolean;
}

export function useRoomState(code: string): RoomState {
  const [room, setRoom] = useState<RoomDoc | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  // Submissions/votes are TAGGED with the round key (`rk`) they were fetched for.
  // When the round changes, the listener re-subscribes asynchronously — for a few
  // renders the arrays still hold the PREVIOUS round's data. Returning them
  // untagged made the phase driver think "everyone already answered" the instant
  // round 2 began, skipping it straight to voting with only the real answer.
  const [subs, setSubs] = useState<{ rk: string; items: Submission[] }>({ rk: "", items: [] });
  const [vts, setVts] = useState<{ rk: string; items: Vote[] }>({ rk: "", items: [] });
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!code) return;
    const unsubRoom = onSnapshot(roomRef(code), (snap) => {
      setLoading(false);
      if (!snap.exists()) {
        setMissing(true);
        setRoom(null);
        return;
      }
      setMissing(false);
      setRoom(snap.data() as RoomDoc);
    });
    const unsubPlayers = onSnapshot(playersCol(code), (snap) => {
      setPlayers(snap.docs.map((d) => d.data() as Player));
    });
    return () => {
      unsubRoom();
      unsubPlayers();
    };
  }, [code]);

  const rk = room ? `${room.gameCount}_${room.currentRound}` : null;
  useEffect(() => {
    if (!code || !rk) return;
    const unsubSubs = onSnapshot(
      query(collection(getDb(), "rooms", code, "submissions"), where("rk", "==", rk)),
      (snap) => setSubs({ rk, items: snap.docs.map((d) => d.data() as Submission) })
    );
    const unsubVotes = onSnapshot(
      query(collection(getDb(), "rooms", code, "votes"), where("rk", "==", rk)),
      (snap) =>
        setVts({
          rk,
          items: snap.docs.map((d) => {
            // Map the server timestamp to millis so client-side rank
            // derivation (fallback path) sees real vote order.
            const raw = d.data() as Vote & { at?: { toMillis?: () => number } };
            return { ...raw, atMs: raw.at?.toMillis?.() ?? raw.atMs };
          }),
        })
    );
    return () => {
      unsubSubs();
      unsubVotes();
    };
  }, [code, rk]);

  // Only expose data that belongs to the CURRENT round; stale rounds read as empty.
  return {
    room,
    players,
    submissions: subs.rk === rk ? subs.items : [],
    votes: vts.rk === rk ? vts.items : [],
    loading,
    missing,
  };
}

/* ---------- presence heartbeat ---------- */

export function usePresence(code: string, uid: string | undefined, inRoom: boolean) {
  useEffect(() => {
    if (!code || !uid || !inRoom) return;
    void heartbeat(code, uid);
    const t = setInterval(() => void heartbeat(code, uid), HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void heartbeat(code, uid);
    };
    const onUnload = () => void markDisconnected(code, uid);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", onUnload);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", onUnload);
    };
  }, [code, uid, inRoom]);
}

/* ---------- self-healing phase driver ----------
 * Timed phases advance when:
 *  - every connected player has acted (early advance, effective host drives), or
 *  - the deadline passed (host advances after a short grace; everyone else acts
 *    as a fallback a few seconds later, so a vanished host can't stall the game).
 * All transitions are transactional and idempotent, so racing clients are safe.
 */
export function usePhaseDriver(
  code: string,
  uid: string | undefined,
  state: RoomState,
  now: number
) {
  const busy = useRef(false);
  /** When "everyone has acted" first became true (fallback anchor for the untimed answer phase). */
  const allActedSince = useRef<number | null>(null);

  const tryAdvance = useCallback(
    async (fn: (code: string) => Promise<void>) => {
      if (busy.current) return;
      busy.current = true;
      try {
        await fn(code);
      } catch {
        /* another client advanced first — fine */
      } finally {
        busy.current = false;
      }
    },
    [code]
  );

  useEffect(() => {
    const { room, players, submissions, votes } = state;
    if (!room || !uid) return;

    const isHost = getEffectiveHostId(room, players) === uid;

    // REVEAL is host-controlled ("Show Leaderboard") — never auto-advanced.
    if (room.phase !== "ANSWER" && room.phase !== "VOTING") return;

    const connectedIds = players.filter((p) => isPlayerConnected(p, now)).map((p) => p.id);
    const actedIds = new Set(
      (room.phase === "ANSWER" ? submissions : votes).map((a) => a.playerId)
    );
    const everyoneActed =
      connectedIds.length > 0 && connectedIds.every((id) => actedIds.has(id));

    // Track how long "everyone acted" has been true — non-host clients use it
    // as a fallback so a vanished host can't stall an untimed phase.
    if (everyoneActed) {
      if (allActedSince.current === null) allActedSince.current = now;
    } else {
      allActedSince.current = null;
    }
    const actedForMs = allActedSince.current === null ? 0 : now - allActedSince.current;

    if (room.phase === "ANSWER") {
      // UNTIMED: advances only when every connected player has submitted.
      // (Legacy rooms mid-round at deploy time may still carry a deadline —
      // honor it so they don't wait forever on a player who left.)
      const legacyOverdue =
        !!room.phaseEndsAt &&
        now > room.phaseEndsAt + (isHost ? PHASE_GRACE_MS : PHASE_GRACE_MS + 5000);
      const shouldAdvance =
        legacyOverdue || (everyoneActed && (isHost || actedForMs > 6000));
      if (shouldAdvance) void tryAdvance(advanceFromAnswer);
      return;
    }

    // VOTING keeps its countdown. When the timer hits zero, advance
    // IMMEDIATELY (host ~instantly; others as a short fallback if the host is
    // gone) — no grace window sitting on a dead screen. Votes that were still
    // in flight simply count as skipped, which is what a timeout means.
    if (!room.phaseEndsAt) return;
    const overdueFor = isHost ? 250 : 4000;
    const overdue = now > room.phaseEndsAt + overdueFor;
    const shouldAdvance = overdue || (everyoneActed && (isHost || actedForMs > 6000));
    if (!shouldAdvance) return;

    void tryAdvance(advanceFromVoting);
  }, [state, uid, now, tryAdvance]);
}

/* ---------- persistent host transfer ----------
 * When the stored host has been disconnected past the presence timeout, the
 * earliest-joined connected player claims the role with a transaction (see
 * claimHost — exactly one claimer wins). The transfer is permanent: an old
 * host who reconnects later stays a regular player.
 */
export function useHostClaim(
  code: string,
  uid: string | undefined,
  state: RoomState,
  now: number
) {
  const lastAttempt = useRef(0);
  useEffect(() => {
    const { room, players } = state;
    if (!room || !uid || !room.roster[uid]) return;
    if (room.hostId === uid) return;

    const storedHost = players.find((p) => p.id === room.hostId);
    const hostAlive = !!storedHost && isPlayerConnected(storedHost, now);
    if (hostAlive) return;

    // Only the rightful next host attempts the claim (everyone computes the
    // same candidate); the transaction re-verifies, so races are safe anyway.
    const candidates = players
      .filter((p) => p.id !== room.hostId && isPlayerConnected(p, now))
      .sort(
        (a, b) =>
          (a.joinedAt?.toMillis?.() ?? 0) - (b.joinedAt?.toMillis?.() ?? 0) ||
          a.id.localeCompare(b.id)
      );
    if (candidates[0]?.id !== uid) return;

    if (now - lastAttempt.current < 5000) return; // throttle retries
    lastAttempt.current = now;
    void claimHost(code, uid).catch(() => {});
  }, [code, uid, state, now]);
}

/* ---------- visitor stats ---------- */

export function useStats() {
  const [visitors, setVisitors] = useState<number | null>(null);
  useEffect(() => {
    const unsub = onSnapshot(
      doc(getDb(), "stats", "global"),
      (snap) => setVisitors((snap.data()?.visitors as number) ?? 0),
      () => setVisitors(null)
    );
    return () => unsub();
  }, []);
  return { visitors };
}

/* ---------- local identity ---------- */

const NAME_KEY = "bluffit:name";

export function getSavedName(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(NAME_KEY) ?? "";
}

export function saveName(name: string) {
  try {
    window.localStorage.setItem(NAME_KEY, name);
  } catch {}
}
