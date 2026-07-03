export const RPS_ARENA_GAME_ID = "rps-arena";

export const BOARD_COLS = 7;
export const BOARD_ROWS = 6;
export const PIECES_PER_PLAYER = 14;
export const SOLDIERS_WITH_WEAPON = 12;

export type Weapon = "rock" | "paper" | "scissors";
export type PieceKind = "soldier" | "flag" | "trap";
export type GamePhase = "setup" | "playing" | "tiebreak" | "finished";

export interface ArenaScore {
  wins: Record<string, number>;
}

export interface ArenaPiece {
  id: string;
  ownerId: string;
  kind: PieceKind;
  weapon: Weapon | null;
  row: number;
  col: number;
  revealed: boolean;
}

export interface TiebreakState {
  attackerPieceId: string;
  defenderPieceId: string;
  targetRow: number;
  targetCol: number;
  choices: Record<string, Weapon | null>;
}

export interface RpsArenaState {
  playerAId: string;
  playerBId: string;
  phase: GamePhase;
  currentTurn: string;
  pieces: ArenaPiece[];
  setupReady: Record<string, boolean>;
  score: ArenaScore;
  winnerId: string | null;
  tiebreak: TiebreakState | null;
}

export type RpsArenaWireMessage =
  | { type: "state"; state: RpsArenaState }
  | { type: "request-state" };

const WEAPON_SET: Weapon[] = ["rock", "paper", "scissors", "rock", "paper", "scissors", "rock", "paper", "scissors", "rock", "paper", "scissors"];

const ORTHOGONAL_DELTAS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;

export function assignPlayers(clientId: string, opponentId: string): { playerAId: string; playerBId: string } {
  return clientId < opponentId
    ? { playerAId: clientId, playerBId: opponentId }
    : { playerAId: opponentId, playerBId: clientId };
}

export function isBottomPlayer(playerId: string, state: RpsArenaState): boolean {
  return playerId === state.playerAId;
}

export function getOpponentId(state: RpsArenaState, playerId: string): string | null {
  if (playerId === state.playerAId) return state.playerBId;
  if (playerId === state.playerBId) return state.playerAId;
  return null;
}

export function createEmptyScore(playerIds: string[]): ArenaScore {
  const wins: Record<string, number> = {};
  for (const playerId of playerIds) {
    wins[playerId] = 0;
  }
  return { wins };
}

function shuffleWeapons(random = Math.random): Weapon[] {
  const weapons = [...WEAPON_SET];
  for (let index = weapons.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [weapons[index], weapons[swapIndex]] = [weapons[swapIndex], weapons[index]];
  }
  return weapons;
}

function homeRowsForPlayer(playerId: string, state: RpsArenaState): [number, number] {
  return isBottomPlayer(playerId, state) ? [4, 5] : [0, 1];
}

export function createPlayerPieces(ownerId: string, state: RpsArenaState, random = Math.random): ArenaPiece[] {
  const [rowA, rowB] = homeRowsForPlayer(ownerId, state);
  const weapons = shuffleWeapons(random);
  const pieces: ArenaPiece[] = [];
  let weaponIndex = 0;
  let slot = 0;

  for (const row of [rowA, rowB]) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      const hasWeapon = weaponIndex < SOLDIERS_WITH_WEAPON;
      pieces.push({
        id: `${ownerId}-p${slot}`,
        ownerId,
        kind: "soldier",
        weapon: hasWeapon ? weapons[weaponIndex] : null,
        row,
        col,
        revealed: false,
      });
      if (hasWeapon) weaponIndex += 1;
      slot += 1;
    }
  }

  return pieces;
}

export function createInitialState(playerAId: string, playerBId: string, random = Math.random): RpsArenaState {
  const state: RpsArenaState = {
    playerAId,
    playerBId,
    phase: "setup",
    currentTurn: playerAId,
    pieces: [],
    setupReady: {
      [playerAId]: false,
      [playerBId]: false,
    },
    score: createEmptyScore([playerAId, playerBId]),
    winnerId: null,
    tiebreak: null,
  };

  state.pieces = [
    ...createPlayerPieces(playerAId, state, random),
    ...createPlayerPieces(playerBId, state, random),
  ];

  return state;
}

export function getPieceAt(state: RpsArenaState, row: number, col: number): ArenaPiece | undefined {
  return state.pieces.find((piece) => piece.row === row && piece.col === col);
}

export function getPlayerPieces(state: RpsArenaState, playerId: string): ArenaPiece[] {
  return state.pieces.filter((piece) => piece.ownerId === playerId);
}

export function countPlayerSpecials(state: RpsArenaState, playerId: string): { flags: number; traps: number } {
  const pieces = getPlayerPieces(state, playerId);
  return {
    flags: pieces.filter((piece) => piece.kind === "flag").length,
    traps: pieces.filter((piece) => piece.kind === "trap").length,
  };
}

export function isSetupValidForPlayer(state: RpsArenaState, playerId: string): boolean {
  const { flags, traps } = countPlayerSpecials(state, playerId);
  return flags === 1 && traps === 1;
}

export function assignSpecial(
  state: RpsArenaState,
  playerId: string,
  pieceId: string,
  special: PieceKind,
): RpsArenaState | null {
  if (state.phase !== "setup" || state.setupReady[playerId]) return null;
  if (special !== "flag" && special !== "trap" && special !== "soldier") return null;

  const piece = state.pieces.find((item) => item.id === pieceId);
  if (!piece || piece.ownerId !== playerId) return null;

  const pieces = state.pieces.map((item) => {
    if (item.ownerId !== playerId) return item;

    if (item.id === pieceId) {
      if (special === "soldier") {
        return { ...item, kind: "soldier" as const };
      }
      return { ...item, kind: special, revealed: false };
    }

    if (special !== "soldier" && item.kind === special) {
      return { ...item, kind: "soldier" as const };
    }

    return item;
  });

  return { ...state, pieces };
}

export function markSetupReady(state: RpsArenaState, playerId: string): RpsArenaState | null {
  if (state.phase !== "setup" || state.setupReady[playerId]) return null;
  if (!isSetupValidForPlayer(state, playerId)) return null;

  const setupReady = { ...state.setupReady, [playerId]: true };
  const bothReady = setupReady[state.playerAId] && setupReady[state.playerBId];

  return {
    ...state,
    setupReady,
    phase: bothReady ? "playing" : "setup",
    currentTurn: state.playerAId,
  };
}

export function compareWeapons(left: Weapon, right: Weapon): "left" | "right" | "tie" {
  if (left === right) return "tie";
  if (
    (left === "rock" && right === "scissors") ||
    (left === "paper" && right === "rock") ||
    (left === "scissors" && right === "paper")
  ) {
    return "left";
  }
  return "right";
}

function removePiece(pieces: ArenaPiece[], pieceId: string): ArenaPiece[] {
  return pieces.filter((piece) => piece.id !== pieceId);
}

function revealPiece(pieces: ArenaPiece[], pieceId: string): ArenaPiece[] {
  return pieces.map((piece) => (piece.id === pieceId ? { ...piece, revealed: true } : piece));
}

function movePiece(pieces: ArenaPiece[], pieceId: string, row: number, col: number): ArenaPiece[] {
  return pieces.map((piece) => (piece.id === pieceId ? { ...piece, row, col } : piece));
}

function finishMatch(state: RpsArenaState, winnerId: string): RpsArenaState {
  return {
    ...state,
    phase: "finished",
    winnerId,
    tiebreak: null,
    score: {
      wins: {
        ...state.score.wins,
        [winnerId]: (state.score.wins[winnerId] ?? 0) + 1,
      },
    },
  };
}

function beginTiebreak(
  state: RpsArenaState,
  attackerPieceId: string,
  defenderPieceId: string,
  targetRow: number,
  targetCol: number,
): RpsArenaState {
  return {
    ...state,
    phase: "tiebreak",
    tiebreak: {
      attackerPieceId,
      defenderPieceId,
      targetRow,
      targetCol,
      choices: {
        [state.playerAId]: null,
        [state.playerBId]: null,
      },
    },
  };
}

function resolveSoldierBattle(
  state: RpsArenaState,
  attacker: ArenaPiece,
  defender: ArenaPiece,
  targetRow: number,
  targetCol: number,
): RpsArenaState {
  if (!attacker.weapon || !defender.weapon) {
    return state;
  }

  const outcome = compareWeapons(attacker.weapon, defender.weapon);
  const nextTurn = getOpponentId(state, attacker.ownerId) ?? state.currentTurn;

  if (outcome === "tie") {
    return beginTiebreak(state, attacker.id, defender.id, targetRow, targetCol);
  }

  if (outcome === "left") {
    let pieces = removePiece(state.pieces, defender.id);
    pieces = revealPiece(pieces, attacker.id);
    pieces = movePiece(pieces, attacker.id, targetRow, targetCol);
    return {
      ...state,
      pieces,
      currentTurn: nextTurn,
      tiebreak: null,
    };
  }

  return {
    ...state,
    pieces: removePiece(state.pieces, attacker.id),
    currentTurn: nextTurn,
    tiebreak: null,
  };
}

function resolveFlagAttack(state: RpsArenaState, attacker: ArenaPiece, defender: ArenaPiece): RpsArenaState {
  let pieces = revealPiece(state.pieces, attacker.id);
  pieces = revealPiece(pieces, defender.id);
  return finishMatch(
    {
      ...state,
      pieces,
    },
    attacker.ownerId,
  );
}

function resolveTrapAttack(state: RpsArenaState, attacker: ArenaPiece, trap: ArenaPiece): RpsArenaState {
  const nextTurn = getOpponentId(state, attacker.ownerId) ?? state.currentTurn;
  let pieces = removePiece(state.pieces, attacker.id);
  pieces = pieces.map((piece) => (piece.id === trap.id ? { ...piece, revealed: true } : piece));
  pieces = removePiece(pieces, trap.id);
  return {
    ...state,
    pieces,
    currentTurn: nextTurn,
    tiebreak: null,
  };
}

export function getLegalMoves(state: RpsArenaState, playerId: string, pieceId: string): Array<{ row: number; col: number }> {
  if (state.phase !== "playing" || state.currentTurn !== playerId) return [];

  const piece = state.pieces.find((item) => item.id === pieceId);
  if (!piece || piece.ownerId !== playerId || piece.kind !== "soldier") return [];

  const moves: Array<{ row: number; col: number }> = [];

  for (const [dRow, dCol] of ORTHOGONAL_DELTAS) {
    const row = piece.row + dRow;
    const col = piece.col + dCol;
    if (row < 0 || row >= BOARD_ROWS || col < 0 || col >= BOARD_COLS) continue;

    const target = getPieceAt(state, row, col);
    if (!target || target.ownerId !== playerId) {
      moves.push({ row, col });
    }
  }

  return moves;
}

export function applyMove(
  state: RpsArenaState,
  playerId: string,
  pieceId: string,
  targetRow: number,
  targetCol: number,
): RpsArenaState | null {
  if (state.phase !== "playing" || state.currentTurn !== playerId) return null;

  const legalMoves = getLegalMoves(state, playerId, pieceId);
  if (!legalMoves.some((move) => move.row === targetRow && move.col === targetCol)) return null;

  const attacker = state.pieces.find((piece) => piece.id === pieceId);
  if (!attacker) return null;

  const defender = getPieceAt(state, targetRow, targetCol);
  const nextTurn = getOpponentId(state, playerId) ?? playerId;

  if (!defender) {
    return {
      ...state,
      pieces: movePiece(state.pieces, pieceId, targetRow, targetCol),
      currentTurn: nextTurn,
    };
  }

  if (defender.kind === "flag") {
    return resolveFlagAttack(state, attacker, defender);
  }

  if (defender.kind === "trap") {
    return resolveTrapAttack(state, attacker, defender);
  }

  return resolveSoldierBattle(state, attacker, defender, targetRow, targetCol);
}

export function submitTiebreakChoice(
  state: RpsArenaState,
  playerId: string,
  weapon: Weapon,
): RpsArenaState | null {
  if (state.phase !== "tiebreak" || !state.tiebreak) return null;

  const attacker = state.pieces.find((piece) => piece.id === state.tiebreak!.attackerPieceId);
  const defender = state.pieces.find((piece) => piece.id === state.tiebreak!.defenderPieceId);
  if (!attacker?.weapon || !defender?.weapon) return null;

  const choices = {
    ...state.tiebreak.choices,
    [playerId]: weapon,
  };

  const choiceA = choices[state.playerAId];
  const choiceB = choices[state.playerBId];
  if (!choiceA || !choiceB) {
    return {
      ...state,
      tiebreak: {
        ...state.tiebreak,
        choices,
      },
    };
  }

  const attackerChoice = choices[attacker.ownerId];
  const defenderChoice = choices[defender.ownerId];
  if (!attackerChoice || !defenderChoice) {
    return {
      ...state,
      tiebreak: {
        ...state.tiebreak,
        choices,
      },
    };
  }

  const outcome = compareWeapons(attackerChoice, defenderChoice);
  const nextTurn = getOpponentId(state, attacker.ownerId) ?? state.currentTurn;
  const { targetRow, targetCol } = state.tiebreak;

  if (outcome === "tie") {
    return {
      ...state,
      tiebreak: {
        ...state.tiebreak,
        choices: {
          [state.playerAId]: null,
          [state.playerBId]: null,
        },
      },
    };
  }

  if (outcome === "left") {
    let pieces = removePiece(state.pieces, defender.id);
    pieces = revealPiece(pieces, attacker.id);
    pieces = movePiece(pieces, attacker.id, targetRow, targetCol);
    return {
      ...state,
      phase: "playing",
      pieces,
      currentTurn: nextTurn,
      tiebreak: null,
    };
  }

  return {
    ...state,
    phase: "playing",
    pieces: removePiece(state.pieces, attacker.id),
    currentTurn: nextTurn,
    tiebreak: null,
  };
}

export function startNextRound(state: RpsArenaState, random = Math.random): RpsArenaState {
  const next = createInitialState(state.playerAId, state.playerBId, random);
  return {
    ...next,
    score: state.score,
  };
}

export function isStateForPlayers(state: RpsArenaState, playerA: string, playerB: string): boolean {
  const players = new Set([state.playerAId, state.playerBId]);
  return players.has(playerA) && players.has(playerB) && players.size === 2;
}

export function isWireMessage(value: unknown): value is RpsArenaWireMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { type?: string };
  return candidate.type === "state" || candidate.type === "request-state";
}

export function weaponLabel(weapon: Weapon): string {
  switch (weapon) {
    case "rock":
      return "Камень";
    case "paper":
      return "Бумага";
    case "scissors":
      return "Ножницы";
  }
}

export function weaponGlyph(weapon: Weapon): string {
  switch (weapon) {
    case "rock":
      return "✊";
    case "paper":
      return "✋";
    case "scissors":
      return "✂️";
  }
}

export function pieceLabel(piece: ArenaPiece, viewerId: string): string {
  if (piece.ownerId !== viewerId && !piece.revealed) return "?";
  if (piece.kind === "flag") return "🚩";
  if (piece.kind === "trap") return "🕳️";
  if (piece.weapon) return weaponGlyph(piece.weapon);
  return "?";
}
