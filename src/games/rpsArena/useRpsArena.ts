import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "../../context/SessionContext";
import {
  RPS_ARENA_GAME_ID,
  assignPlayers,
  assignSpecial,
  applyMove,
  createInitialState,
  ensureStateShape,
  isStateForPlayers,
  isWireMessage,
  markSetupReady,
  setArenaOptions,
  startNextRound,
  submitTiebreakChoice,
  type PieceKind,
  type RpsArenaOptions,
  type RpsArenaState,
  type RpsArenaWireMessage,
  type Weapon,
} from "./logic";
import { loadArenaOptions, saveArenaOptions } from "./options";

const LEADER_INIT_DELAY_MS = 300;
const FOLLOWER_INIT_DELAY_MS = 1200;

export function useRpsArena() {
  const { clientId, peers, nickname, subscribeGameMessages, sendGameMessage, isConnected } =
    useSession();
  const opponent = peers.length === 1 ? peers[0] : null;
  const opponentId = opponent?.id ?? null;
  const hasInvalidOpponent = Boolean(opponentId && opponentId === clientId);
  const sessionKey =
    isConnected && opponentId && !hasInvalidOpponent ? `${clientId}:${opponentId}` : null;

  const [state, setState] = useState<RpsArenaState | null>(null);
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [options, setOptions] = useState<RpsArenaOptions>(() => loadArenaOptions());
  const stateRef = useRef<RpsArenaState | null>(null);
  const initTimerRef = useRef<number | null>(null);

  const players = useMemo(() => {
    if (!opponentId || hasInvalidOpponent) return null;
    return assignPlayers(clientId, opponentId);
  }, [clientId, opponentId, hasInvalidOpponent]);

  const sendWire = useCallback(
    (body: RpsArenaWireMessage) => {
      sendGameMessage(RPS_ARENA_GAME_ID, body);
    },
    [sendGameMessage],
  );

  const publishState = useCallback(
    (nextState: RpsArenaState) => {
      const normalized = ensureStateShape(nextState);
      stateRef.current = normalized;
      setState(normalized);
      setOptions(normalized.options);
      sendWire({ type: "state", state: normalized });
    },
    [sendWire],
  );

  const bootstrapState = useCallback(() => {
    if (!players || stateRef.current) return;
    publishState(
      createInitialState(players.playerAId, players.playerBId, Math.random, loadArenaOptions()),
    );
  }, [players, publishState]);

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
    setSelectedPieceId(null);
    stateRef.current = null;
    setOptions(loadArenaOptions());
  }, [sessionKey, clearInitTimer]);

  useEffect(() => {
    if (!sessionKey || !opponentId || !players) return undefined;

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
        const normalized = ensureStateShape(body.state);
        stateRef.current = normalized;
        setState(normalized);
        setOptions(normalized.options);
        setSelectedPieceId(null);
        clearInitTimer();
      }
    };

    const unsubscribe = subscribeGameMessages((message) => {
      if (message.gameId !== RPS_ARENA_GAME_ID || message.senderId === clientId) return;
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
    players,
    clientId,
    subscribeGameMessages,
    sendWire,
    bootstrapState,
    clearInitTimer,
  ]);

  const setSpecial = useCallback(
    (pieceId: string, special: PieceKind) => {
      if (!stateRef.current) return;
      const nextState = assignSpecial(stateRef.current, clientId, pieceId, special);
      if (!nextState) return;
      publishState(nextState);
    },
    [clientId, publishState],
  );

  const readySetup = useCallback(() => {
    if (!stateRef.current) return;
    const nextState = markSetupReady(stateRef.current, clientId);
    if (!nextState) return;
    publishState(nextState);
  }, [clientId, publishState]);

  const moveSelectedPiece = useCallback(
    (row: number, col: number) => {
      if (!stateRef.current || !selectedPieceId) return;
      const nextState = applyMove(stateRef.current, clientId, selectedPieceId, row, col);
      if (!nextState) return;
      publishState(nextState);
      setSelectedPieceId(null);
    },
    [clientId, publishState, selectedPieceId],
  );

  const chooseTiebreak = useCallback(
    (weapon: Weapon) => {
      if (!stateRef.current) return;
      const nextState = submitTiebreakChoice(stateRef.current, clientId, weapon);
      if (!nextState) return;
      publishState(nextState);
    },
    [clientId, publishState],
  );

  const updateOptions = useCallback(
    (patch: Partial<RpsArenaOptions>) => {
      const nextOptions = saveArenaOptions(patch);
      setOptions(nextOptions);
      if (!stateRef.current) return;
      publishState(setArenaOptions(stateRef.current, nextOptions));
    },
    [publishState],
  );

  const playNextRound = useCallback(() => {
    if (!stateRef.current || stateRef.current.phase !== "finished") return;
    publishState(startNextRound(stateRef.current));
    setSelectedPieceId(null);
  }, [publishState]);

  const clearGameState = useCallback(() => {
    if (!stateRef.current) return;
    publishState(startNextRound(stateRef.current));
    setSelectedPieceId(null);
  }, [publishState]);

  const isMyTurn = Boolean(state && (state.currentTurn === clientId || state.phase === "tiebreak"));
  const myTiebreakChoice = state?.tiebreak?.choices[clientId] ?? null;

  return {
    state,
    opponent,
    nickname,
    clientId,
    peersCount: peers.length,
    hasInvalidOpponent,
    selectedPieceId,
    setSelectedPieceId,
    setSpecial,
    readySetup,
    moveSelectedPiece,
    chooseTiebreak,
    updateOptions,
    options,
    playNextRound,
    clearGameState,
    isMyTurn,
    myTiebreakChoice,
  };
}
