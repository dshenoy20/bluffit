"use client";

import { useState } from "react";
import { Button, Card, CopyButton, ErrorText, Logo, WaitingNote } from "./ui";
import { GameError, isPlayerConnected, startGame, type RoomDoc } from "@/lib/roomService";
import { MAX_PLAYERS, MIN_PLAYERS, type Player } from "@/lib/types";

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

  const sorted = [...players].sort(
    (a, b) => (a.joinedAt?.toMillis?.() ?? 0) - (b.joinedAt?.toMillis?.() ?? 0)
  );

  return (
    <Card>
      <div className="flex flex-col items-center gap-4">
        <Logo small />
        <div className="text-center">
          <p className="text-sm text-slate-400">Room Code</p>
          <p className="text-4xl font-black tracking-[0.3em] text-amber-300">
            {room.roomCode}
          </p>
        </div>
        <div className="flex gap-2">
          <CopyButton text={room.roomCode} label="code" />
          <CopyButton text={inviteLink} label="invite link" />
        </div>

        <div className="w-full">
          <p className="mb-2 text-sm font-semibold text-slate-400">
            Players ({count}/{MAX_PLAYERS})
          </p>
          <ul className="flex flex-col gap-1.5">
            {sorted.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-lg bg-slate-700/60 px-3 py-2"
              >
                <span className="font-semibold">
                  {p.name}
                  {p.id === uid && <span className="text-slate-400"> (you)</span>}
                </span>
                <span className="flex items-center gap-2 text-xs text-slate-400">
                  {p.id === room.hostId && (
                    <span className="rounded bg-amber-400/20 px-1.5 py-0.5 font-bold text-amber-300">
                      HOST
                    </span>
                  )}
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isPlayerConnected(p, now) ? "bg-emerald-400" : "bg-slate-500"
                    }`}
                    title={isPlayerConnected(p, now) ? "Connected" : "Disconnected"}
                  />
                </span>
              </li>
            ))}
          </ul>
        </div>

        <ErrorText>{error}</ErrorText>

        {isHost ? (
          <Button
            disabled={!canStart || starting}
            title={canStart ? "Start the game" : `Need at least ${MIN_PLAYERS} players to start`}
            onClick={async () => {
              setStarting(true);
              setError("");
              try {
                await startGame(room.roomCode);
              } catch (e) {
                setError(e instanceof GameError ? e.message : "Could not start the game. Try again.");
              } finally {
                setStarting(false);
              }
            }}
          >
            {canStart ? "Start Game" : `Waiting for players (${count}/${MIN_PLAYERS})`}
          </Button>
        ) : (
          <WaitingNote>Waiting for the host to start the game...</WaitingNote>
        )}
      </div>
    </Card>
  );
}
