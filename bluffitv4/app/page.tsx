"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, ErrorText, Logo, Page, TextInput } from "@/components/ui";
import { useAuthUser, useStats, getSavedName, saveName } from "@/lib/hooks";
import { GameError, createRoom, joinRoom } from "@/lib/roomService";
import { sanitizeRoomCode } from "@/lib/gameLogic";
import { DEFAULT_THEME, THEMES, type ThemeKey } from "@/lib/questions";
import {
  DEFAULT_ROUNDS,
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  MIN_PLAYERS,
  ROUND_OPTIONS,
} from "@/lib/types";

type Mode = "menu" | "create" | "join";

export default function Home() {
  const router = useRouter();
  const { user, error: authError } = useAuthUser();
  const { visitors } = useStats();
  const [mode, setMode] = useState<Mode>("menu");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [rounds, setRounds] = useState<number>(DEFAULT_ROUNDS);
  const [theme, setTheme] = useState<ThemeKey>(DEFAULT_THEME);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(getSavedName());
  }, []);

  async function handleCreate() {
    if (!user) return;
    setBusy(true);
    setError("");
    try {
      saveName(name);
      const roomCode = await createRoom(user.uid, name, { theme, totalRounds: rounds });
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
          <span>500+ questions</span>
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

        {mode === "create" && (
          <form
            className="anim-fade-up flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void handleCreate();
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

            {/* rounds */}
            <div>
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-500">
                Rounds
              </span>
              <div className="grid grid-cols-4 gap-1.5">
                {ROUND_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRounds(n)}
                    className={`rounded-xl py-2.5 text-sm font-black transition-all duration-150 ring-1 ${
                      rounds === n
                        ? "bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 ring-amber-300"
                        : "bg-white/5 text-slate-300 ring-white/10 hover:bg-white/10"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                ≈ {Math.round(rounds * 1.8)} min game
              </p>
            </div>

            {/* theme */}
            <div>
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-500">
                Theme
              </span>
              <div className="flex flex-col gap-1.5">
                {THEMES.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTheme(t.key)}
                    className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-left transition-all duration-150 ring-1 ${
                      theme === t.key
                        ? "bg-amber-400/15 ring-amber-400/60"
                        : "bg-white/5 ring-white/10 hover:bg-white/10"
                    }`}
                  >
                    <span className="text-xl" aria-hidden>{t.emoji}</span>
                    <span className="min-w-0">
                      <span
                        className={`block text-sm font-bold ${
                          theme === t.key ? "text-amber-300" : "text-white"
                        }`}
                      >
                        {t.label}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {t.description}
                      </span>
                    </span>
                    {theme === t.key && (
                      <span className="ml-auto text-amber-300" aria-hidden>✓</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <ErrorText>{error || authError}</ErrorText>
            <Button
              type="submit"
              size="lg"
              loading={busy}
              disabled={!user || name.trim().length === 0}
            >
              Create Room
            </Button>
            <Button variant="ghost" onClick={() => { setMode("menu"); setError(""); }}>
              Back
            </Button>
          </form>
        )}

        {mode === "join" && (
          <form
            className="anim-fade-up flex flex-col gap-3.5"
            onSubmit={(e) => {
              e.preventDefault();
              void handleJoin();
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
            <TextInput
              label="Room code"
              value={code}
              onChange={(v) => setCode(v.toUpperCase())}
              placeholder="•••••"
              maxLength={5}
              uppercase
            />
            <ErrorText>{error || authError}</ErrorText>
            <Button
              type="submit"
              size="lg"
              loading={busy}
              disabled={!user || name.trim().length === 0}
            >
              Join Room
            </Button>
            <Button variant="ghost" onClick={() => { setMode("menu"); setError(""); }}>
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
