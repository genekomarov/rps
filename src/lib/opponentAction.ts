import { getOpponentId, type RpsArenaState } from "../games/rpsArena/logic";
import type { TicTacToeState } from "../games/ticTacToe/logic";

function sameLastMove(
  left: RpsArenaState["lastMove"],
  right: RpsArenaState["lastMove"],
): boolean {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return (
    left.fromRow === right.fromRow &&
    left.fromCol === right.fromCol &&
    left.toRow === right.toRow &&
    left.toCol === right.toCol &&
    left.playerId === right.playerId
  );
}

/** Detects opponent actions that become visible on the local board/UI. */
export function isVisibleOpponentArenaAction(
  prev: RpsArenaState | null,
  next: RpsArenaState,
  clientId: string,
): boolean {
  if (!prev) return false;

  if (
    next.lastMove &&
    next.lastMove.playerId !== clientId &&
    !sameLastMove(prev.lastMove, next.lastMove)
  ) {
    return true;
  }

  const opponentId = getOpponentId(next, clientId);
  if (!opponentId) return false;

  if (!prev.setupReady[opponentId] && next.setupReady[opponentId]) {
    return true;
  }

  if (prev.phase === "initiative" && next.phase === "setup") {
    return true;
  }

  if (prev.phase === "tiebreak" && next.phase === "playing") {
    return true;
  }

  if (prev.phase === "finished" && (next.phase === "setup" || next.phase === "initiative")) {
    return true;
  }

  return false;
}

export function isVisibleOpponentTicTacToeAction(
  prev: TicTacToeState | null,
  next: TicTacToeState,
  clientId: string,
): boolean {
  if (!prev) return false;

  for (let index = 0; index < next.board.length; index += 1) {
    if (prev.board[index] === next.board[index] || next.board[index] === null) continue;
    const mark = next.board[index];
    const moverId = mark === "X" ? next.xPlayerId : next.oPlayerId;
    if (moverId !== clientId) return true;
  }

  if (prev.status === "finished" && next.status === "playing") {
    return true;
  }

  return false;
}
