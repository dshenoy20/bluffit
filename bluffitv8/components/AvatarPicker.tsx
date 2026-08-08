"use client";

import { useState } from "react";
import { Button, Card, ErrorText } from "./ui";
import { AVATARS, AvatarIcon } from "./avatars";
import { GameError, selectAvatar, type RoomDoc } from "@/lib/roomService";

/**
 * Full-screen avatar selection, shown when a player is in the room but hasn't
 * picked an avatar yet (and reachable from the lobby to change it).
 * Availability is live from the room doc; the pick itself is transactional,
 * so simultaneous grabs of the same avatar resolve to exactly one winner.
 */
export function AvatarPicker({
  room,
  uid,
  onDone,
}: {
  room: RoomDoc;
  uid: string;
  onDone?: () => void;
}) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const avatars = room.avatars ?? {};
  const mine = avatars[uid];

  async function pick(key: string) {
    if (pending) return;
    setPending(key);
    setError("");
    try {
      await selectAvatar(room.roomCode, uid, key);
      onDone?.();
    } catch (e) {
      setError(e instanceof GameError ? e.message : "Could not select. Try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="text-center">
          <h2 className="text-xl font-black tracking-tight">Pick your character</h2>
          <p className="mt-1 text-sm text-slate-400">
            One of a kind — taken characters are locked.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {AVATARS.map((a) => {
            const owner = Object.entries(avatars).find(
              ([pid, key]) => key === a.key && pid !== uid
            );
            const takenBy = owner ? room.roster[owner[0]] : null;
            const isMine = mine === a.key;
            const disabled = !!takenBy || !!pending;
            return (
              <button
                key={a.key}
                type="button"
                disabled={disabled}
                onClick={() => pick(a.key)}
                className={`flex flex-col items-center gap-1.5 rounded-2xl p-3 ring-1 transition-all duration-150 ${
                  isMine
                    ? "bg-amber-400/15 ring-amber-400/60"
                    : takenBy
                      ? "cursor-not-allowed bg-white/[0.02] ring-white/5 opacity-45"
                      : "bg-white/5 ring-white/10 hover:-translate-y-0.5 hover:bg-white/10 active:scale-95"
                }`}
              >
                <AvatarIcon avatar={a.key} size="lg" className="rounded-2xl" />
                <span className={`text-xs font-bold ${isMine ? "text-amber-300" : "text-slate-300"}`}>
                  {a.label}
                </span>
                <span className="text-[10px] font-semibold text-slate-500">
                  {isMine ? "You ✓" : takenBy ? `🔒 ${takenBy}` : "Available"}
                </span>
              </button>
            );
          })}
        </div>

        <ErrorText>{error}</ErrorText>
        {mine && onDone && (
          <Button variant="ghost" onClick={onDone}>
            Keep {AVATARS.find((a) => a.key === mine)?.label ?? "current"}
          </Button>
        )}
      </div>
    </Card>
  );
}
