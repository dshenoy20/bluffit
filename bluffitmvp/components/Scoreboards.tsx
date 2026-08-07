"use client";

import { useRouter } from "next/navigation";
import { Button, Card, RoundBadge, WaitingNote } from "./ui";
import { getWinners, rankPlayers } from "@/lib/gameLogic";
import {
  continueFromScoreboard,
  markDisconnected,
  playAgain,
  type RoomDoc,
} from "@/lib/roomService";
import { TOTAL_ROUNDS, type Player } from "@/lib/types";

function RankTable({ players }: { players: Player[] }) {
  const ranked = rankPlayers(players);
  return (
    <table className="w-full text-left">
      <thead>
        <tr className="text-xs uppercase tracking-wide text-slate-400">
          <th className="py-1 pr-2">Rank</th>
          <th className="py-1 pr-2">Player</th>
          <th className="py-1 text-right">Score</th>
        </tr>
      </thead>
      <tbody>
        {ranked.map((p) => (
          <tr key={p.id} className="border-t border-slate-700">
            <td className="py-2 pr-2 font-black text-amber-300">#{p.rank}</td>
            <td className="py-2 pr-2 font-semibold">{p.name}</td>
            <td className="py-2 text-right font-mono font-bold">{p.score}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Scoreboard({
  room,
  players,
  isHost,
}: {
  room: RoomDoc;
  players: Player[];
  isHost: boolean;
}) {
  const lastRound = room.currentRound >= TOTAL_ROUNDS;
  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black">Scoreboard</h2>
          <RoundBadge round={room.currentRound} total={TOTAL_ROUNDS} />
        </div>
        <RankTable players={players} />
        {isHost ? (
          <Button onClick={() => void continueFromScoreboard(room.roomCode).catch(() => {})}>
            {lastRound ? "Show Final Results" : "Next Round"}
          </Button>
        ) : (
          <WaitingNote>Waiting for Host...</WaitingNote>
        )}
      </div>
    </Card>
  );
}

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
  const ranked = rankPlayers(players);
  const winners = getWinners(ranked);
  const winnerLabel =
    winners.length === 1
      ? `${winners[0].name} wins!`
      : `It's a tie: ${winners.map((w) => w.name).join(" & ")}!`;

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="text-center">
          <p className="text-4xl">🏆</p>
          <h2 className="text-2xl font-black text-amber-300">{winnerLabel}</h2>
          <p className="mt-1 text-sm text-slate-400">Final Leaderboard</p>
        </div>
        <RankTable players={players} />
        {isHost ? (
          <Button onClick={() => void playAgain(room.roomCode).catch(() => {})}>
            Play Again
          </Button>
        ) : (
          <WaitingNote>Waiting for Host... (they can start a rematch)</WaitingNote>
        )}
        <Button
          variant="ghost"
          onClick={async () => {
            await markDisconnected(room.roomCode, uid);
            router.push("/");
          }}
        >
          Exit
        </Button>
      </div>
    </Card>
  );
}
