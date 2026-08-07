"use client";

import { useState } from "react";
import { Button, Card, ErrorText, RoundBadge, TimerBar, WaitingNote } from "./ui";
import { getQuestion } from "@/lib/questions";
import {
  GameError,
  advanceReveal,
  castVote,
  submitAnswer,
  type RoomDoc,
} from "@/lib/roomService";
import {
  ANSWER_SECONDS,
  MAX_ANSWER_LENGTH,
  TOTAL_ROUNDS,
  VOTING_SECONDS,
  type Submission,
  type Vote,
} from "@/lib/types";
import { POINTS_CORRECT, POINTS_PER_FOOL } from "@/lib/gameLogic";

/* ---------------- ANSWER ---------------- */

export function AnswerPhase({
  room,
  uid,
  now,
  submissions,
}: {
  room: RoomDoc;
  uid: string;
  now: number;
  submissions: Submission[];
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const question = getQuestion(room.currentRound);
  const mine = submissions.find((s) => s.playerId === uid);
  const submittedCount = submissions.length;
  const totalPlayers = Object.keys(room.roster).length;

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <RoundBadge round={room.currentRound} total={TOTAL_ROUNDS} />
          <span className="text-sm text-slate-400">
            {submittedCount}/{totalPlayers} answered
          </span>
        </div>
        {room.phaseEndsAt && (
          <TimerBar endsAt={room.phaseEndsAt} totalSeconds={ANSWER_SECONDS} now={now} />
        )}
        <p className="text-xl font-bold leading-snug">{question.question}</p>

        {mine ? (
          <div className="flex flex-col gap-2">
            <div className="rounded-xl bg-slate-700/60 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Your bluff</p>
              <p className="font-semibold">{mine.answer || <em>(blank)</em>}</p>
            </div>
            <WaitingNote>Waiting for the other players...</WaitingNote>
          </div>
        ) : (
          <form
            className="flex flex-col gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (sending) return;
              setSending(true);
              setError("");
              try {
                await submitAnswer(room.roomCode, uid, text);
              } catch (err) {
                setError(
                  err instanceof GameError ? err.message : "Could not submit. Try again."
                );
              } finally {
                setSending(false);
              }
            }}
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={MAX_ANSWER_LENGTH}
              rows={2}
              autoFocus
              placeholder="Write a believable fake answer..."
              className="w-full resize-none rounded-xl bg-slate-700 px-4 py-3 text-lg text-white placeholder-slate-400 outline-none ring-amber-400 focus:ring-2"
            />
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>No edits after submitting!</span>
              <span>
                {text.length}/{MAX_ANSWER_LENGTH}
              </span>
            </div>
            <ErrorText>{error}</ErrorText>
            <Button type="submit" disabled={sending || text.trim().length === 0}>
              Lock It In
            </Button>
          </form>
        )}
      </div>
    </Card>
  );
}

/* ---------------- VOTING ---------------- */

export function VotingPhase({
  room,
  uid,
  now,
  votes,
}: {
  room: RoomDoc;
  uid: string;
  now: number;
  votes: Vote[];
}) {
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const mine = votes.find((v) => v.playerId === uid);
  const votedCount = votes.length;
  const totalPlayers = Object.keys(room.roster).length;
  const question = getQuestion(room.currentRound);

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <RoundBadge round={room.currentRound} total={TOTAL_ROUNDS} />
          <span className="text-sm text-slate-400">
            {votedCount}/{totalPlayers} voted
          </span>
        </div>
        {room.phaseEndsAt && (
          <TimerBar endsAt={room.phaseEndsAt} totalSeconds={VOTING_SECONDS} now={now} />
        )}
        <p className="text-lg font-bold leading-snug">{question.question}</p>
        <p className="text-sm text-slate-400">
          Pick the <span className="font-bold text-amber-300">real answer</span>. One of
          these is true — the rest are bluffs.
        </p>

        <div className="flex flex-col gap-2">
          {room.votingOptions.map((opt) => {
            const isOwn = opt.id === uid;
            const isPicked = mine?.optionId === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                disabled={isOwn || !!mine || sending}
                title={isOwn ? "You can't vote for your own answer" : undefined}
                onClick={async () => {
                  setSending(true);
                  setError("");
                  try {
                    await castVote(room.roomCode, uid, opt.id);
                  } catch (err) {
                    setError(
                      err instanceof GameError ? err.message : "Could not vote. Try again."
                    );
                  } finally {
                    setSending(false);
                  }
                }}
                className={`rounded-xl px-4 py-3 text-left font-semibold transition ${
                  isPicked
                    ? "bg-amber-400 text-slate-900"
                    : isOwn
                      ? "cursor-not-allowed bg-slate-700/40 text-slate-500"
                      : mine
                        ? "bg-slate-700/40 text-slate-400"
                        : "bg-slate-700 hover:bg-slate-600"
                }`}
              >
                {opt.text}
                {isOwn && <span className="ml-2 text-xs">(your bluff)</span>}
              </button>
            );
          })}
        </div>

        <ErrorText>{error}</ErrorText>
        {mine && <WaitingNote>Vote locked. Waiting for the other players...</WaitingNote>}
      </div>
    </Card>
  );
}

/* ---------------- REVEAL ---------------- */

export function RevealPhase({
  room,
  isHost,
}: {
  room: RoomDoc;
  isHost: boolean;
}) {
  const item = room.revealOrder[room.revealIndex];
  const isLast = room.revealIndex >= room.revealOrder.length - 1;
  if (!item) return null;

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <RoundBadge round={room.currentRound} total={TOTAL_ROUNDS} />
          <span className="text-sm text-slate-400">
            {room.revealIndex + 1}/{room.revealOrder.length}
          </span>
        </div>

        <div
          className={`rounded-xl px-4 py-5 text-center ${
            item.isReal ? "bg-emerald-500/20 ring-2 ring-emerald-400" : "bg-slate-700/60"
          }`}
        >
          {item.isReal && (
            <p className="mb-1 text-xs font-black uppercase tracking-widest text-emerald-300">
              The real answer
            </p>
          )}
          <p className="text-xl font-bold">{item.text}</p>
          {!item.isReal && (
            <p className="mt-2 text-sm text-slate-300">
              written by <span className="font-bold text-amber-300">{item.authorName}</span>
            </p>
          )}
        </div>

        <div className="rounded-xl bg-slate-700/40 px-4 py-3 text-sm">
          {item.voterNames.length > 0 ? (
            <>
              <p>
                <span className="font-bold">{item.voterNames.length}</span>{" "}
                {item.voterNames.length === 1 ? "vote" : "votes"}:{" "}
                {item.voterNames.join(", ")}
              </p>
              <p className="mt-1 font-bold text-amber-300">
                {item.isReal
                  ? `+${POINTS_CORRECT} to each of them!`
                  : `+${item.pointsEarned} to ${item.authorName} (${POINTS_PER_FOOL} per player fooled)`}
              </p>
            </>
          ) : (
            <p className="text-slate-400">No votes. Nobody fell for it.</p>
          )}
        </div>

        {isHost ? (
          <Button onClick={() => void advanceReveal(room.roomCode).catch(() => {})}>
            {isLast ? "Show Scoreboard" : "Next Answer"}
          </Button>
        ) : (
          <WaitingNote>Waiting for Host...</WaitingNote>
        )}
      </div>
    </Card>
  );
}
