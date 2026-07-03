import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "../../context/SessionContext";
import {
  TIC_TAC_TOE_GAME_ID,
  applyMove,
  assignRoles,
  createInitialState,
  isStateForPlayers,
  isWireMessage,
  startNextRound,
  type TicTacToeState,
  type TicTacToeWireMessage,
} from "./logic";

const LEADER_INIT_DELAY_MS = 300;
const FOLLOWER_INIT_DELAY_MS = 1200;

export function useTicTacToe() {
  const { clientId, peers, nickname, subscribeGameMessages, sendGameMessage, isConnected } =
    useSession();
  const opponent = peers.length === 1 ? peers[0] : null;
  const opponentId = opponent?.id ?? null;
  const hasInvalidOpponent = Boolean(opponentId && opponentId === clientId);
  const sessionKey =
    isConnected && opponentId && !hasInvalidOpponent ? `${clientId}:${opponentId}` : null;

  const [state, setState] = useState<TicTacToeState | null>(null);
  const stateRef = useRef<TicTacToeState | null>(null);
  const initTimerRef = useRef<number | null>(null);

  const roles = useMemo(() => {
    if (!opponentId || hasInvalidOpponent) return null;
    return assignRoles(clientId, opponentId);
  }, [clientId, opponentId, hasInvalidOpponent]);

  const myMark = state
    ? clientId === state.xPlayerId
      ? "X"
      : clientId === state.oPlayerId
        ? "O"
        : null
    : roles
      ? clientId === roles.xPlayerId
        ? "X"
        : "O"
      : null;

  const sendWire = useCallback(
    (body: TicTacToeWireMessage) => {
      sendGameMessage(TIC_TAC_TOE_GAME_ID, body);
    },
    [sendGameMessage],
  );

  const publishState = useCallback(
    (nextState: TicTacToeState) => {
      stateRef.current = nextState;
      setState(nextState);
      sendWire({ type: "state", state: nextState });
    },
    [sendWire],
  );

  const bootstrapState = useCallback(() => {
    if (!roles || stateRef.current) return;
    publishState(createInitialState(roles.xPlayerId, roles.oPlayerId));
  }, [roles, publishState]);

  const clearInitTimer = useCallback(() => {
    if (initTimerRef.current !== null) {
      window.clearTimeout(initTimerRef.current);
      initTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    clearInitTimer();
    setState(null);
    stateRef.current = null;
  }, [sessionKey, clearInitTimer]);

  useEffect(() => {
    if (!sessionKey || !opponentId || !roles) return undefined;

    const isLeader = clientId < opponentId;

    const handleWire = (body: unknown) => {
      if (!isWireMessage(body)) return;

      if (body.type === "request-state") {
        if (stateRef.current && isStateForPlayers(stateRef.current, clientId, opponentId)) {
          sendWire({ type: "state", state: stateRef.current });
          return;
        }

        if (isLeader) {
          bootstrapState();
        }
        return;
      }

      if (body.type === "state") {
        if (!isStateForPlayers(body.state, clientId, opponentId)) return;
        stateRef.current = body.state;
        setState(body.state);
        clearInitTimer();
      }
    };

    const unsubscribe = subscribeGameMessages((message) => {
      if (message.gameId !== TIC_TAC_TOE_GAME_ID || message.senderId === clientId) return;
      handleWire(message.body);
    });

    sendWire({ type: "request-state" });

    initTimerRef.current = window.setTimeout(
      () => {
        if (stateRef.current) return;
        bootstrapState();
      },
      isLeader ? LEADER_INIT_DELAY_MS : FOLLOWER_INIT_DELAY_MS,
    );

    return () => {
      unsubscribe();
      clearInitTimer();
    };
  }, [
    sessionKey,
    opponentId,
    roles,
    clientId,
    subscribeGameMessages,
    sendWire,
    bootstrapState,
    clearInitTimer,
  ]);

  const makeMove = useCallback(
    (cellIndex: number) => {
      if (!stateRef.current) return;
      const nextState = applyMove(stateRef.current, clientId, cellIndex);
      if (!nextState) return;
      publishState(nextState);
    },
    [clientId, publishState],
  );

  const startNextRoundAction = useCallback(() => {
    if (!stateRef.current || stateRef.current.status !== "finished") return;
    publishState(startNextRound(stateRef.current));
  }, [publishState]);

  const canPlay = Boolean(state && state.status === "playing" && myMark && state.currentTurn === myMark);

  return {
    state,
    opponent,
    opponentId,
    nickname,
    clientId,
    myMark,
    canPlay,
    peersCount: peers.length,
    hasInvalidOpponent,
    makeMove,
    startNextRound: startNextRoundAction,
  };
}
