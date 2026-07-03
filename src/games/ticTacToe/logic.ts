export const TIC_TAC_TOE_GAME_ID = "tic-tac-toe";

export type CellMark = "X" | "O";
export type Board = Array<CellMark | null>;

export interface TicTacToeScore {
  wins: Record<string, number>;
  draws: number;
}

export interface TicTacToeState {
  board: Board;
  xPlayerId: string;
  oPlayerId: string;
  currentTurn: CellMark;
  status: "playing" | "finished";
  winner: CellMark | "draw" | null;
  score: TicTacToeScore;
}

export type TicTacToeWireMessage =
  | { type: "state"; state: TicTacToeState }
  | { type: "request-state" };

export function createEmptyBoard(): Board {
  return Array.from({ length: 9 }, () => null);
}

export function createEmptyScore(playerIds: string[]): TicTacToeScore {
  const wins: Record<string, number> = {};
  for (const playerId of playerIds) {
    wins[playerId] = 0;
  }
  return { wins, draws: 0 };
}

export function assignRoles(clientId: string, opponentId: string): { xPlayerId: string; oPlayerId: string } {
  return clientId < opponentId
    ? { xPlayerId: clientId, oPlayerId: opponentId }
    : { xPlayerId: opponentId, oPlayerId: clientId };
}

export function createInitialState(xPlayerId: string, oPlayerId: string): TicTacToeState {
  return {
    board: createEmptyBoard(),
    xPlayerId,
    oPlayerId,
    currentTurn: "X",
    status: "playing",
    winner: null,
    score: createEmptyScore([xPlayerId, oPlayerId]),
  };
}

const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
] as const;

export function getWinner(board: Board): CellMark | "draw" | null {
  for (const [a, b, c] of WIN_LINES) {
    const mark = board[a];
    if (mark && mark === board[b] && mark === board[c]) {
      return mark;
    }
  }

  if (board.every((cell) => cell !== null)) {
    return "draw";
  }

  return null;
}

export function getPlayerMark(state: TicTacToeState, playerId: string): CellMark | null {
  if (playerId === state.xPlayerId) return "X";
  if (playerId === state.oPlayerId) return "O";
  return null;
}

export function applyMove(
  state: TicTacToeState,
  playerId: string,
  cellIndex: number,
): TicTacToeState | null {
  if (state.status !== "playing") return null;
  if (cellIndex < 0 || cellIndex > 8) return null;
  if (state.board[cellIndex] !== null) return null;

  const mark = getPlayerMark(state, playerId);
  if (!mark || state.currentTurn !== mark) return null;

  const board = [...state.board];
  board[cellIndex] = mark;

  const outcome = getWinner(board);
  if (!outcome) {
    return {
      ...state,
      board,
      currentTurn: mark === "X" ? "O" : "X",
    };
  }

  if (outcome === "draw") {
    return {
      ...state,
      board,
      status: "finished",
      winner: "draw",
      score: {
        ...state.score,
        draws: state.score.draws + 1,
      },
    };
  }

  const winnerId = outcome === "X" ? state.xPlayerId : state.oPlayerId;
  return {
    ...state,
    board,
    status: "finished",
    winner: outcome,
    score: {
      ...state.score,
      wins: {
        ...state.score.wins,
        [winnerId]: (state.score.wins[winnerId] ?? 0) + 1,
      },
    },
  };
}

export function startNextRound(state: TicTacToeState): TicTacToeState {
  return {
    ...state,
    board: createEmptyBoard(),
    currentTurn: "X",
    status: "playing",
    winner: null,
  };
}

export function isStateForPlayers(
  state: TicTacToeState,
  playerA: string,
  playerB: string,
): boolean {
  const players = new Set([state.xPlayerId, state.oPlayerId]);
  return players.has(playerA) && players.has(playerB) && players.size === 2;
}

export function isWireMessage(value: unknown): value is TicTacToeWireMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { type?: string };
  return candidate.type === "state" || candidate.type === "request-state";
}
