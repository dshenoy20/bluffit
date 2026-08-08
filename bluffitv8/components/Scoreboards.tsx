"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  Chip,
  Confetti,
  RoundProgress,
  WaitingNote,
  useCountUp,
} from "./ui";
import { PlayerAvatar } from "./avatars";
import { getWinners, rankPlayers, type RankedPlayer } from "@/lib/gameLogic";
import {
  continueFromScoreboard,
  markDisconnected,
  playAgain,
  type RoomDoc,
} from "@/lib/roomService";
import { getTotalRounds, type Player } from "@/lib/types";

const MEDALS = ["🥇", "🥈", "🥉"];

function ScoreRow({
  p,
  index,
  maxScore,
  final,
  delta,
  avatar,
}: {
  p: RankedPlayer;
  index: number;
  maxScore: number;
  final?: boolean;
  /** Points earned this round; when set, the total animates up from (score - delta). */
  delta?: number;
  avatar?: string;
}) {
  // Animate from the previous-round total to the new total (round 1: from 0).
  const from = delta !== undefined ? Math.max(0, p.score - delta) : undefined;
  const score = useCountUp(p.score, 900, from, 600 + index * 120);
  const medal = p.rank <= 3 ? MEDALS[p.rank - 1] : null;
  const pct = maxScore > 0 ? Math.max(4, (p.score / maxScore) * 100) : 4;
  return (
    <li
      className="anim-fade-up relative overflow-hidden rounded-2xl bg-white/[0.04] ring-1 ring-white/10"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {/* relative-score bar behind the row */}
      <span
        className={`anim-bar absolute inset-y-0 left-0 ${
          p.rank === 1 ? "bg-amber-400/15" : "bg-white/[0.04]"
        }`}
        style={{ width: `${pct}%`, animationDelay: `${200 + index * 80}ms` }}
        aria-hidden
      />
      <span className="relative flex items-center gap-2.5 px-3 py-2.5">
        <span className="w-7 shrink-0 text-center text-lg">
          {medal ?? (
            <span className="text-sm font-black text-slate-500">#{p.rank}</span>
          )}
        </span>
        <PlayerAvatar avatar={avatar} name={p.name} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold leading-tight">{p.name}</span>
          {delta !== undefined && (
            <span
              className={`anim-pop-in block text-xs font-bold leading-tight ${
                delta > 0 ? "text-emerald-300" : "text-slate-600"
              }`}
              style={{ animationDelay: `${500 + index * 120}ms` }}
            >
              +{delta} this round
            </span>
          )}
        </span>
        <span
          className={`shrink-0 font-mono text-lg font-black tabular-nums ${
            p.rank === 1 ? "text-amber-300" : "text-slate-200"
          } ${final && p.rank === 1 ? "text-xl" : ""}`}
        >
          {score.toLocaleString()}
        </span>
      </span>
    </li>
  );
}

function Leaderboard({
  players,
  final,
  roundPoints,
  avatars,
}: {
  players: Player[];
  final?: boolean;
  /** When present, rows show "+X this round" and animate from the previous total. */
  roundPoints?: Record<string, number>;
  avatars?: Record<string, string>;
}) {
  const ranked = rankPlayers(players);
  const maxScore = ranked[0]?.score ?? 0;
  return (
    <ul className="flex flex-col gap-2">
      {ranked.map((p, i) => (
        <ScoreRow
          key={p.id}
          p={p}
          index={i}
          maxScore={maxScore}
          final={final}
          delta={roundPoints ? (roundPoints[p.id] ?? 0) : undefined}
          avatar={avatars?.[p.id]}
        />
      ))}
    </ul>
  );
}

/* ---------------- round scoreboard ---------------- */

export function Scoreboard({
  room,
  players,
  isHost,
}: {
  room: RoomDoc;
  players: Player[];
  isHost: boolean;
}) {
  const [advancing, setAdvancing] = useState(false);
  const lastRound = room.currentRound >= getTotalRounds(room);
  return (
    <Card>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-black tracking-tight">Scoreboard</h2>
          <RoundProgress round={room.currentRound} total={getTotalRounds(room)} />
        </div>
        <Leaderboard
          players={players}
          roundPoints={room.roundPoints ?? {}}
          avatars={room.avatars}
        />
        {isHost ? (
          <Button
            size="lg"
            loading={advancing}
            onClick={async () => {
              setAdvancing(true);
              await continueFromScoreboard(room.roomCode).catch(() => {});
              setAdvancing(false);
            }}
          >
            {lastRound ? "Show Final Results" : `Start Round ${room.currentRound + 1}`}
          </Button>
        ) : (
          <WaitingNote>Waiting for Host</WaitingNote>
        )}
      </div>
    </Card>
  );
}

/* ---------------- final screen ---------------- */

export function FinalScreen({
  room,
  players,
  uid,
  isHost,
}: {
  room: RoomDoc;
  players: Player[];
  uid: string;
  isHost: boolean;
}) {
  const router = useRouter();
  const [again, setAgain] = useState(false);
  const ranked = rankPlayers(players);
  const winners = getWinners(ranked);
  const isTie = winners.length > 1;

  return (
    <>
      <Confetti />
      <Card>
        <div className="flex flex-col gap-5">
          <div className="text-center">
            <p className="anim-trophy text-6xl">🏆</p>
            <p className="mt-2 text-xs font-bold uppercase tracking-[0.3em] text-slate-500">
              {isTie ? "It's a tie!" : "The winner is"}
            </p>
            <h2 className="anim-pop-in delay-150ms text-balance mt-1 bg-gradient-to-b from-amber-200 to-amber-500 bg-clip-text text-3xl font-black tracking-tight text-transparent">
              {winners.map((w) => w.name).join(" & ")}
            </h2>
            {winners.some((w) => w.id === uid) && (
              <div className="anim-pop-in delay-300ms mt-2">
                <Chip tone="amber">That&apos;s you! 🎉</Chip>
              </div>
            )}
          </div>

          <Leaderboard players={players} final avatars={room.avatars} />

          <div className="flex flex-col gap-2.5">
            {isHost ? (
              <Button
                size="lg"
                loading={again}
                onClick={async () => {
                  setAgain(true);
                  await playAgain(room.roomCode).catch(() => {});
                  setAgain(false);
                }}
              >
                Play Again — new questions
              </Button>
            ) : (
              <WaitingNote>Waiting for Host to start a rematch</WaitingNote>
            )}
            <Button
              variant="ghost"
              onClick={async () => {
                await markDisconnected(room.roomCode, uid);
                router.push("/");
              }}
            >
              Exit to Home
            </Button>
          </div>
        </div>
      </Card>
    </>
  );
}
