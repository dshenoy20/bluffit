"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, ErrorText, Logo, Page, TextInput } from "@/components/ui";
import { useAuthUser, useStats, getSavedName, saveName } from "@/lib/hooks";
import { GameError, bumpVisitorCount, createRoom, joinRoom } from "@/lib/roomService";
import { sanitizeRoomCode } from "@/lib/gameLogic";
import { MAX_NAME_LENGTH, MAX_PLAYERS, MIN_PLAYERS, TOTAL_ROUNDS } from "@/lib/types";

type Mode = "menu" | "create" | "join";

export default function Home() {
  const router = useRouter();
  const { user, error: authError } = useAuthUser();
  const { visitors } = useStats();
  const [mode, setMode] = useState<Mode>("menu");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(getSavedName());
    void bumpVisitorCount();
  }, []);

  async function handleCreate() {
    if (!user) return;
    setBusy(true);
    setError("");
    try {
      saveName(name);
      const roomCode = await createRoom(user.uid, name);
      router.push(`/room/${roomCode}`);
    } catch (e) {
      setError(e instanceof GameError ? e.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  async function handleJoin() {
    if (!user) return;
    const clean = sanitizeRoomCode(code);
    if (!clean) {
      setError("Please enter a room code.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      saveName(name);
      await joinRoom(clean, user.uid, name);
      router.push(`/room/${clean}`);
    } catch (e) {
      setError(e instanceof GameError ? e.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <Page>
      {/* hero */}
      <div className="anim-fade-up flex flex-col items-center gap-3 text-center">
        <Logo />
        <p className="text-balance max-w-xs text-lg font-medium text-slate-400 sm:max-w-sm">
          Fool your friends with fake answers.
          <br />
          <span className="text-slate-500">Find the real one. Score big.</span>
        </p>
        <div className="flex gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-600">
          <span>{MIN_PLAYERS}–{MAX_PLAYERS} players</span>
          <span aria-hidden>·</span>
          <span>{TOTAL_ROUNDS} rounds</span>
          <span aria-hidden>·</span>
          <span>no sign-up</span>
        </div>
      </div>

      <Card>
        {mode === "menu" && (
          <div className="flex flex-col gap-3">
            <Button size="lg" onClick={() => setMode("create")}>
              Create Game
            </Button>
            <Button size="lg" variant="secondary" onClick={() => setMode("join")}>
              Join Game
            </Button>
          </div>
        )}

        {mode !== "menu" && (
          <form
            className="anim-fade-up flex flex-col gap-3.5"
            onSubmit={(e) => {
              e.preventDefault();
              void (mode === "create" ? handleCreate() : handleJoin());
            }}
          >
            <TextInput
              label="Your name"
              value={name}
              onChange={setName}
              placeholder="e.g. Dev"
              maxLength={MAX_NAME_LENGTH}
              autoFocus
            />
            {mode === "join" && (
              <TextInput
                label="Room code"
                value={code}
                onChange={(v) => setCode(v.toUpperCase())}
                placeholder="•••••"
                maxLength={5}
                uppercase
              />
            )}
            <ErrorText>{error || authError}</ErrorText>
            <Button
              type="submit"
              size="lg"
              loading={busy}
              disabled={!user || name.trim().length === 0}
            >
              {mode === "create" ? "Create Room" : "Join Room"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setMode("menu");
                setError("");
              }}
            >
              Back
            </Button>
          </form>
        )}
      </Card>

      <p
        className={`text-xs font-semibold tracking-wide text-slate-600 transition-opacity duration-700 ${
          visitors === null ? "opacity-0" : "opacity-100"
        }`}
      >
        {visitors !== null && (
          <>
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 align-middle" />
            Visitors: <span className="font-mono font-bold text-slate-400">{visitors.toLocaleString()}</span>
          </>
        )}
      </p>
    </Page>
  );
}
