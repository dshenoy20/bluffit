"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, ErrorText, Logo, Page, TextInput } from "@/components/ui";
import { useAuthUser, useStats, getSavedName, saveName } from "@/lib/hooks";
import { GameError, bumpVisitorCount, createRoom, joinRoom } from "@/lib/roomService";
import { sanitizeRoomCode } from "@/lib/gameLogic";
import { MAX_NAME_LENGTH } from "@/lib/types";

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
      <Logo />
      <p className="max-w-sm text-center text-slate-400">
        Fool your friends with fake answers. Find the real one.
      </p>

      <Card>
        {mode === "menu" && (
          <div className="flex flex-col gap-3">
            <Button onClick={() => setMode("create")}>Create Game</Button>
            <Button variant="secondary" onClick={() => setMode("join")}>
              Join Game
            </Button>
          </div>
        )}

        {mode !== "menu" && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void (mode === "create" ? handleCreate() : handleJoin());
            }}
          >
            <TextInput
              value={name}
              onChange={setName}
              placeholder="Your name"
              maxLength={MAX_NAME_LENGTH}
              autoFocus
            />
            {mode === "join" && (
              <TextInput
                value={code}
                onChange={(v) => setCode(v.toUpperCase())}
                placeholder="Room code"
                maxLength={5}
                uppercase
              />
            )}
            <ErrorText>{error || authError}</ErrorText>
            <Button type="submit" disabled={busy || !user || name.trim().length === 0}>
              {busy ? "..." : mode === "create" ? "Create Room" : "Join Room"}
            </Button>
            <Button variant="ghost" onClick={() => { setMode("menu"); setError(""); }}>
              Back
            </Button>
          </form>
        )}
      </Card>

      <p className="text-sm text-slate-500">
        {visitors === null ? "" : `Visitors: ${visitors.toLocaleString()}`}
      </p>
    </Page>
  );
}
