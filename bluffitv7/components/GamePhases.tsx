"use client";

import { useEffect, useState } from "react";
import { playSound } from "@/lib/sound";
import {
  Button,
  Card,
  CircularTimer,
  ErrorText,
  RoundProgress,
  WaitingNote,
} from "./ui";
import { getRoundQuestion } from "@/lib/questions";
import {
  GameError,
  castVote,
  submitAnswer,
  type RoomDoc,
} from "@/lib/roomService";
import {
  MAX_ANSWER_LENGTH,
  VOTING_SECONDS,
  getTotalRounds,
  type Submission,
  type Vote,
} from "@/lib/types";
import {
  CORRECT_BASE,
  POINTS_PER_FOOL,
  buildPersonalResult,
} from "@/lib/gameLogic";

function PhaseHeader({
  room,
  endsAt,
  totalSeconds,
  now,
  progressLabel,
}: {
  room: RoomDoc;
  endsAt?: number | null;
  totalSeconds?: number;
  now?: number;
  progressLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <RoundProgress round={room.currentRound} total={getTotalRounds(room)} />
        {progressLabel && (
          <span className="text-xs font-semibold text-slate-500">{progressLabel}</span>
        )}
      </div>
      {!!endsAt && !!totalSeconds && now !== undefined && (
        <CircularTimer endsAt={endsAt} totalSeconds={totalSeconds} now={now} />
      )}
    </div>
  );
}

/** One-line scoring hint, shown only in round 1 so first-timers get the incentives immediately. */
function ScoringHint({ room, children }: { room: RoomDoc; children: React.ReactNode }) {
  if (room.currentRound !== 1) return null;
  return (
    <p className="rounded-xl bg-amber-400/[0.07] px-3 py-2 text-center text-xs font-semibold leading-relaxed text-amber-200/80 ring-1 ring-amber-400/15">
      {children}
    </p>
  );
}

/* The question's theme/category is deliberately NOT shown during gameplay. */
function QuestionCard({ question }: { question: string }) {
  return (
    <div className="anim-fade-up rounded-2xl bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-5 ring-1 ring-white/10">
      <p className="text-balance text-xl font-bold leading-snug sm:text-2xl">{question}</p>
    </div>
  );
}

/* ---------------- ANSWER ---------------- */

export function AnswerPhase({
  room,
  uid,
  submissions,
}: {
  room: RoomDoc;
  uid: string;
  submissions: Submission[];
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const question = getRoundQuestion(room.questionIds, room.currentRound);
  const mine = submissions.find((s) => s.playerId === uid);
  const totalPlayers = Object.keys(room.roster).length;
  const waitingFor = totalPlayers - submissions.length;

  return (
    <Card>
      <div className="flex flex-col gap-5">
        {/* No timer here — the answer phase waits for everyone. Voting is the only timed phase. */}
        <PhaseHeader
          room={room}
          progressLabel={`${submissions.length} of ${totalPlayers} players answered`}
        />
        <QuestionCard question={question.question} />

        <ScoringHint room={room}>
          Fool a player with your bluff: <b className="text-amber-300">+{POINTS_PER_FOOL} each</b>.
          Pick the real answer later: up to <b className="text-amber-300">+{CORRECT_BASE}</b> —
          fastest correct pick scores the most!
        </ScoringHint>

        {mine ? (
          <div className="anim-pop-in flex flex-col gap-3">
            <div className="rounded-2xl bg-emerald-400/10 px-4 py-3.5 ring-1 ring-emerald-400/30">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                Your bluff is locked in
              </p>
              <p className="mt-0.5 font-bold [overflow-wrap:anywhere]">
                {mine.answer || <em>(blank)</em>}
              </p>
            </div>
            <WaitingNote>
              Waiting for {waitingFor} {waitingFor === 1 ? "player" : "players"}
            </WaitingNote>
          </div>
        ) : (
          <form
            className="flex flex-col gap-2.5"
            onSubmit={async (e) => {
              e.preventDefault();
              if (sending) return;
              setSending(true);
              setError("");
              try {
                await submitAnswer(room.roomCode, uid, text);
                playSound("lockIn");
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
              placeholder="Write a believable fake answer…"
              className="w-full resize-none rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3.5
                text-lg text-white placeholder-slate-500 outline-none transition-all duration-200
                focus:border-amber-400/60 focus:shadow-[0_0_0_4px_rgba(251,191,36,0.15)]"
            />
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>No edits after submitting</span>
              <span className={text.length >= MAX_ANSWER_LENGTH ? "text-rose-400" : ""}>
                {text.length}/{MAX_ANSWER_LENGTH}
              </span>
            </div>
            <ErrorText>{error}</ErrorText>
            <Button
              type="submit"
              size="lg"
              loading={sending}
              disabled={text.trim().length === 0}
            >
              Lock It In
            </Button>
          </form>
        )}
      </div>
    </Card>
  );
}

/* ---------------- VOTING ---------------- */

const LETTERS = "ABCDEFGHI";

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
  const [pending, setPending] = useState<string | null>(null); // double-click guard
  const mine = votes.find((v) => v.playerId === uid);
  const totalPlayers = Object.keys(room.roster).length;
  const question = getRoundQuestion(room.questionIds, room.currentRound);
  const locked = !!mine || !!pending;

  return (
    <Card>
      <div className="flex flex-col gap-5">
        <PhaseHeader
          room={room}
          endsAt={room.phaseEndsAt}
          totalSeconds={VOTING_SECONDS}
          now={now}
          progressLabel={`${votes.length}/${totalPlayers} voted`}
        />

        <div>
          <p className="text-balance text-lg font-bold leading-snug">{question.question}</p>
          <p className="mt-1.5 text-sm text-slate-400">
            One of these is <span className="font-bold text-amber-300">the real answer</span> —
            the rest are bluffs. Choose wisely.
          </p>
        </div>

        <ScoringHint room={room}>
          Fastest correct pick scores <b className="text-amber-300">{CORRECT_BASE}</b>, the next
          one {CORRECT_BASE - 10}, then {CORRECT_BASE - 20}… Be quick, but don&apos;t get fooled!
        </ScoringHint>

        <div className="flex flex-col gap-2.5">
          {room.votingOptions.map((opt, i) => {
            const isOwn = opt.id === uid;
            const isPicked = (mine?.optionId ?? pending) === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                disabled={isOwn || locked}
                title={isOwn ? "You can't vote for your own answer" : undefined}
                onClick={async () => {
                  if (locked) return;
                  setPending(opt.id);
                  setError("");
                  try {
                    await castVote(room.roomCode, uid, opt.id);
                    playSound("vote");
                  } catch (err) {
                    setError(
                      err instanceof GameError ? err.message : "Could not vote. Try again."
                    );
                    setPending(null);
                  }
                }}
                className={`anim-fade-up group flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left
                  font-semibold ring-1 transition-all duration-200 ${
                    isPicked
                      ? "bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 ring-amber-300 shadow-[0_10px_28px_-10px_rgba(251,191,36,0.6)]"
                      : isOwn
                        ? "cursor-not-allowed bg-white/[0.03] text-slate-600 ring-white/5"
                        : locked
                          ? "bg-white/[0.03] text-slate-500 ring-white/5"
                          : "bg-white/5 ring-white/10 hover:-translate-y-0.5 hover:bg-white/10 hover:ring-amber-400/40"
                  }`}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black ${
                    isPicked
                      ? "bg-slate-950/20 text-slate-950"
                      : "bg-white/10 text-slate-400 group-hover:text-amber-300"
                  }`}
                >
                  {LETTERS[i] ?? "•"}
                </span>
                <span className="min-w-0 flex-1 break-words">
                  {opt.text}
                  {isOwn && (
                    <span className="ml-2 text-xs font-bold text-slate-600">your bluff</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <ErrorText>{error}</ErrorText>
        {mine && <WaitingNote>Vote locked. Waiting for the others</WaitingNote>}
      </div>
    </Card>
  );
}

/* ---------------- REVEAL: personal result, auto-advances to the leaderboard ---------------- */

export function RevealPhase({
  room,
  uid,
  votes,
}: {
  room: RoomDoc;
  uid: string;
  votes: Vote[];
}) {
  const result = buildPersonalResult(room.revealOrder, votes, uid, room.correctAwards);

  // Result sounds: your outcome first, bluff-bonus sting shortly after.
  useEffect(() => {
    playSound(result.kind === "correct" ? "correct" : "fooled");
    if (result.bluffVotes > 0) {
      const t = setTimeout(() => playSound("bluffBonus"), 700);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ordinal = (n: number) =>
    n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;

  const headline =
    result.kind === "correct"
      ? `✅ Correct Answer! +${result.votePoints}`
      : result.kind === "fooled"
        ? `😂 You got fooled by ${result.fooledBy}!`
        : "⏰ Time ran out — no vote";

  const subtitle =
    result.kind === "correct"
      ? result.correctRank
        ? `You were ${ordinal(result.correctRank)} of ${result.correctCount} to find it — faster picks score more!`
        : `${result.correctCount} ${result.correctCount === 1 ? "player" : "players"} got it right`
      : result.kind === "fooled"
        ? "That answer was a bluff."
        : "Better luck next round!";

  return (
    <Card>
      <div className="flex flex-col gap-5">
        <RoundProgress round={room.currentRound} total={getTotalRounds(room)} />

        <div className="anim-reveal flex flex-col gap-3">
          <div
            className={`rounded-2xl px-5 py-6 text-center ring-1 ${
              result.kind === "correct"
                ? "bg-emerald-400/10 ring-emerald-400/50"
                : "bg-white/5 ring-white/10"
            }`}
          >
            <p className="text-balance text-2xl font-black leading-snug">{headline}</p>
            <p className="mt-2 text-sm font-semibold text-slate-400">{subtitle}</p>
          </div>

          {/* The real answer — always shown prominently, in every case */}
          <div className="anim-glow rounded-2xl bg-emerald-400/10 px-5 py-4 text-center ring-1 ring-emerald-400/50">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-300">
              ✦ The Real Answer ✦
            </p>
            <p className="mt-1.5 text-xl font-black leading-snug text-emerald-100 [overflow-wrap:anywhere]">
              {result.realAnswer}
            </p>
          </div>

          {result.bluffVotes > 0 && (
            <div className="anim-pop-in delay-300ms rounded-2xl bg-amber-400/10 px-4 py-3.5 text-center ring-1 ring-amber-400/30">
              <p className="font-bold text-amber-300">
                🎉 You fooled {result.bluffVotes}{" "}
                {result.bluffVotes === 1 ? "player" : "players"}! +{result.bluffPoints}
              </p>
              <p className="mt-0.5 text-xs font-bold text-slate-500">
                {POINTS_PER_FOOL} points per player fooled
              </p>
            </div>
          )}

          {result.bluffVotes === 0 && result.kind !== "correct" && (
            <p className="text-center text-xs font-semibold text-slate-500">
              Nobody picked your bluff this time.
            </p>
          )}

          {/* Round total, big and unambiguous */}
          <p className="anim-pop-in delay-300ms text-center text-2xl font-black">
            <span className={result.totalPoints > 0 ? "text-emerald-300" : "text-slate-500"}>
              +{result.totalPoints} {result.totalPoints === 1 ? "point" : "points"}
            </span>
            <span className="ml-1.5 text-sm font-bold text-slate-500">this round</span>
          </p>
        </div>

        <WaitingNote>Leaderboard in a moment</WaitingNote>
      </div>
    </Card>
  );
}
