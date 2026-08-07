"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button, Card, ErrorText, Logo, Page, TextInput } from "@/components/ui";
import { Lobby } from "@/components/Lobby";
import { AnswerPhase, VotingPhase, RevealPhase } from "@/components/GamePhases";
import { Scoreboard, FinalScreen } from "@/components/Scoreboards";
import {
  useAuthUser,
  useNow,
  usePhaseDriver,
  usePresence,
  useRoomState,
  getSavedName,
  saveName,
} from "@/lib/hooks";
import {
  GameError,
  getEffectiveHostId,
  isRoomExpired,
  joinRoom,
  leaveLobby,
} from "@/lib/roomService";
import { sanitizeRoomCode } from "@/lib/gameLogic";
import { MAX_NAME_LENGTH } from "@/lib/types";

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const code = sanitizeRoomCode(params.code ?? "");
  const router = useRouter();
  const { user, error: authError } = useAuthUser();
  const state = useRoomState(code);
  const now = useNow();
  const { room, players, submissions, votes, loading, missing } = state;

  const uid = user?.uid;
  const inRoom = !!(uid && room?.roster[uid]);
  const expired = !!room && isRoomExpired(room);

  usePresence(code, uid, inRoom && !expired);
  usePhaseDriver(code, inRoom && !expired ? uid : undefined, state, now);

  const inviteLink = useMemo(
    () => (typeof window === "undefined" ? "" : `${window.location.origin}/room/${code}`),
    [code]
  );

  const isHost = !!(room && uid && getEffectiveHostId(room, players) === uid);

  /* ----- edge screens ----- */

  if (authError) {
    return (
      <Shell>
        <Notice title="Connection problem" body={authError} />
      </Shell>
    );
  }

  if (loading || !user) {
    return (
      <Shell>
        <p className="animate-pulse text-slate-400">Loading room...</p>
      </Shell>
    );
  }

  if (missing || !room) {
    return (
      <Shell>
        <Notice
          title="Room not found"
          body="That room code doesn't exist. Check the code, or create a new game."
          onHome={() => router.push("/")}
        />
      </Shell>
    );
  }

  if (expired) {
    return (
      <Shell>
        <Notice
          title="Room expired"
          body="This room was inactive for over an hour and has closed. Start a new game!"
          onHome={() => router.push("/")}
        />
      </Shell>
    );
  }

  if (!inRoom) {
    return (
      <Shell>
        <JoinForm code={code} uid={user.uid} lobbyOpen={room.phase === "LOBBY"} />
      </Shell>
    );
  }

  /* ----- game screens ----- */

  return (
    <Shell>
      {room.phase === "LOBBY" && (
        <>
          <Lobby
            room={room}
            players={players}
            uid={user.uid}
            isHost={isHost}
            now={now}
            inviteLink={inviteLink}
          />
          <button
            className="text-sm text-slate-500 underline hover:text-slate-300"
            onClick={async () => {
              await leaveLobby(code, user.uid).catch(() => {});
              router.push("/");
            }}
          >
            Leave room
          </button>
        </>
      )}
      {room.phase === "ANSWER" && (
        <AnswerPhase room={room} uid={user.uid} now={now} submissions={submissions} />
      )}
      {room.phase === "VOTING" && (
        <VotingPhase room={room} uid={user.uid} now={now} votes={votes} />
      )}
      {room.phase === "REVEAL" && (
        <RevealPhase room={room} isHost={isHost} />
      )}
      {room.phase === "SCOREBOARD" && (
        <Scoreboard room={room} players={players} isHost={isHost} />
      )}
      {room.phase === "FINAL" && (
        <FinalScreen room={room} players={players} uid={user.uid} isHost={isHost} />
      )}
    </Shell>
  );
}

/* ---------- helpers ---------- */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <Page>
      <Logo small />
      {children}
    </Page>
  );
}

function Notice({
  title,
  body,
  onHome,
}: {
  title: string;
  body: string;
  onHome?: () => void;
}) {
  return (
    <Card>
      <div className="flex flex-col gap-3 text-center">
        <h2 className="text-xl font-black">{title}</h2>
        <p className="text-slate-400">{body}</p>
        {onHome && <Button onClick={onHome}>Back to Home</Button>}
      </div>
    </Card>
  );
}

/** Shown when someone opens an invite link and isn't in the room yet. */
function JoinForm({
  code,
  uid,
  lobbyOpen,
}: {
  code: string;
  uid: string;
  lobbyOpen: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(getSavedName());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!lobbyOpen) {
    return (
      <Notice
        title="Game in progress"
        body="This game has already started. Ask the host to invite you to the next one!"
        onHome={() => router.push("/")}
      />
    );
  }

  return (
    <Card>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            saveName(name);
            await joinRoom(code, uid, name);
          } catch (err) {
            setError(
              err instanceof GameError ? err.message : "Could not join. Try again."
            );
            setBusy(false);
          }
        }}
      >
        <p className="text-center">
          Joining room <span className="font-black tracking-widest text-amber-300">{code}</span>
        </p>
        <TextInput
          value={name}
          onChange={setName}
          placeholder="Your name"
          maxLength={MAX_NAME_LENGTH}
          autoFocus
        />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy || name.trim().length === 0}>
          {busy ? "..." : "Join Game"}
        </Button>
      </form>
    </Card>
  );
}
