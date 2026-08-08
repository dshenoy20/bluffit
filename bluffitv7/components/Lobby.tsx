"use client";

import { useEffect, useRef, useState } from "react";
import { playSound } from "@/lib/sound";
import {
  Avatar,
  Button,
  Card,
  Chip,
  CopyButton,
  ErrorText,
  WaitingNote,
} from "./ui";
import {
  GameError,
  isPlayerConnected,
  startGame,
  type RoomDoc,
} from "@/lib/roomService";
import { MAX_PLAYERS, MIN_PLAYERS, getTotalRounds, type Player } from "@/lib/types";
import { THEMES } from "@/lib/questions";

export function Lobby({
  room,
  players,
  uid,
  isHost,
  now,
  inviteLink,
}: {
  room: RoomDoc;
  players: Player[];
  uid: string;
  isHost: boolean;
  now: number;
  inviteLink: string;
}) {
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const count = players.length;
  const canStart = count >= MIN_PLAYERS;

  // A soft chime whenever someone new joins (not on initial mount).
  const prevCount = useRef<number | null>(null);
  useEffect(() => {
    if (prevCount.current !== null && count > prevCount.current) playSound("join");
    prevCount.current = count;
  }, [count]);

  const sorted = [...players].sort(
    (a, b) => (a.joinedAt?.toMillis?.() ?? 0) - (b.joinedAt?.toMillis?.() ?? 0)
  );

  return (
    <Card>
      <div className="flex flex-col items-center gap-5">
        {/* room code as letter tiles */}
        <div className="text-center">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">
            Room Code
          </p>
          <div className="flex justify-center gap-1.5">
            {room.roomCode.split("").map((ch, i) => (
              <span
                key={i}
                className={`anim-pop-in flex h-12 w-10 items-center justify-center rounded-xl
                  bg-gradient-to-b from-slate-700 to-slate-800 text-2xl font-black text-amber-300
                  ring-1 ring-white/10 shadow-lg sm:h-14 sm:w-11 sm:text-3xl`}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                {ch}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          <CopyButton text={room.roomCode} label="Copy code" />
          <CopyButton text={inviteLink} label="Copy invite link" />
        </div>

        {/* game settings summary */}
        <div className="flex flex-wrap justify-center gap-2">
          <Chip>{getTotalRounds(room)} rounds</Chip>
          <Chip>
            {THEMES.find((t) => t.key === room.theme)?.emoji ?? "🎲"}{" "}
            {THEMES.find((t) => t.key === room.theme)?.label ?? "Random"}
          </Chip>
        </div>

        {/* players joined */}
        <div className="w-full">
          <div className="mb-2.5 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Players Joined
            </p>
            <p className="mt-0.5 text-2xl font-black">
              {count} <span className="text-base font-bold text-slate-500">of {MAX_PLAYERS}</span>
            </p>
            {canStart ? (
              <p className="text-sm font-bold text-emerald-300">Ready to start!</p>
            ) : (
              <p className="text-sm text-slate-400">
                Need at least {MIN_PLAYERS} players to begin.
                <br />
                <span className="animate-pulse font-semibold text-slate-500">
                  Waiting for {MIN_PLAYERS - count} more{" "}
                  {MIN_PLAYERS - count === 1 ? "player" : "players"}…
                </span>
              </p>
            )}
          </div>
          <ul className="grid grid-cols-2 gap-2.5">
            {sorted.map((p, i) => (
              <li
                key={p.id}
                className="anim-pop-in flex items-center gap-2.5 rounded-2xl bg-white/5 p-2.5 ring-1 ring-white/10"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <Avatar name={p.name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">
                    {p.name}
                    {p.id === uid && (
                      <span className="font-semibold text-slate-500"> (you)</span>
                    )}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        isPlayerConnected(p, now) ? "bg-emerald-400" : "bg-slate-600"
                      }`}
                    />
                    {p.id === room.hostId ? "Host 👑" : isPlayerConnected(p, now) ? "Ready" : "Away"}
                  </span>
                </span>
              </li>
            ))}
            {/* empty slot hint */}
            {count < MAX_PLAYERS && (
              <li className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-white/10 p-2.5 text-xs font-bold text-slate-600">
                Invite friends…
              </li>
            )}
          </ul>
        </div>

        <ErrorText>{error}</ErrorText>

        {isHost ? (
          <div className="w-full">
            {canStart ? (
              <div className={count >= MIN_PLAYERS ? "anim-glow rounded-2xl" : ""}>
                <Button
                  size="lg"
                  loading={starting}
                  title="Start the game"
                  onClick={async () => {
                    setStarting(true);
                    setError("");
                    try {
                      await startGame(room.roomCode);
                    } catch (e) {
                      setError(
                        e instanceof GameError ? e.message : "Could not start the game. Try again."
                      );
                    } finally {
                      setStarting(false);
                    }
                  }}
                >
                  Start Game
                </Button>
              </div>
            ) : (
              <p className="text-center text-xs text-slate-500">
                Share the room code or invite link to bring friends in — the Start button
                appears when {MIN_PLAYERS} players have joined.
              </p>
            )}
          </div>
        ) : (
          <WaitingNote>Waiting for the host to start</WaitingNote>
        )}
      </div>
    </Card>
  );
}
