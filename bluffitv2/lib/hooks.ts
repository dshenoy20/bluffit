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
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
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
      (snap) => setSubmissions(snap.docs.map((d) => d.data() as Submission))
    );
    const unsubVotes = onSnapshot(
      query(collection(getDb(), "rooms", code, "votes"), where("rk", "==", rk)),
      (snap) => setVotes(snap.docs.map((d) => d.data() as Vote))
    );
    return () => {
      unsubSubs();
      unsubVotes();
    };
  }, [code, rk]);

  return { room, players, submissions, votes, loading, missing };
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
    if (room.phase !== "ANSWER" && room.phase !== "VOTING") return;
    if (!room.phaseEndsAt) return;

    const isHost = getEffectiveHostId(room, players) === uid;
    const connectedIds = players.filter((p) => isPlayerConnected(p, now)).map((p) => p.id);
    const actedIds = new Set(
      (room.phase === "ANSWER" ? submissions : votes).map((a) => a.playerId)
    );
    const everyoneActed =
      connectedIds.length > 0 && connectedIds.every((id) => actedIds.has(id));

    const overdueFor = isHost ? PHASE_GRACE_MS : PHASE_GRACE_MS + 5000;
    const overdue = now > room.phaseEndsAt + overdueFor;
    const shouldAdvance = overdue || (isHost && everyoneActed);
    if (!shouldAdvance) return;

    void tryAdvance(room.phase === "ANSWER" ? advanceFromAnswer : advanceFromVoting);
  }, [state, uid, now, tryAdvance]);
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
