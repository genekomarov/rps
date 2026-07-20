import {
  DEFAULT_RPS_ARENA_OPTIONS,
  normalizeArenaOptions,
  type RpsArenaOptions,
} from "./options";

export type { RpsArenaOptions } from "./options";
export { DEFAULT_RPS_ARENA_OPTIONS, normalizeArenaOptions } from "./options";

export const RPS_ARENA_GAME_ID = "rps-arena";

export const BOARD_COLS = 7;
export const BOARD_ROWS = 6;
export const PIECES_PER_PLAYER = 14;

export type Weapon = "rock" | "paper" | "scissors";
export type PieceKind = "soldier" | "flag" | "trap";
export type GamePhase = "initiative" | "setup" | "playing" | "tiebreak" | "finished";

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

export interface DuelChoices {
  choices: Record<string, Weapon | null>;
}

export interface TiebreakState extends DuelChoices {
  attackerPieceId: string;
  defenderPieceId: string;
  targetRow: number;
  targetCol: number;
}

export interface LastMove {
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  playerId: string;
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
  initiative: DuelChoices | null;
  tiebreak: TiebreakState | null;
  lastMove: LastMove | null;
  options: RpsArenaOptions;
}

export type RpsArenaWireMessage =
  | { type: "state"; state: RpsArenaState }
  | { type: "request-state" };

const WEAPONS_CYCLE: Weapon[] = ["rock", "paper", "scissors"];

function shuffleWeapons(count: number, random = Math.random): Weapon[] {
  const weapons: Weapon[] = Array.from({ length: count }, (_, index) => WEAPONS_CYCLE[index % WEAPONS_CYCLE.length]);
  for (let index = weapons.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [weapons[index], weapons[swapIndex]] = [weapons[swapIndex], weapons[index]];
  }
  return weapons;
}

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

function createEmptyDuelChoices(playerAId: string, playerBId: string): DuelChoices {
  return {
    choices: {
      [playerAId]: null,
      [playerBId]: null,
    },
  };
}

function homeRowsForPlayer(playerId: string, state: RpsArenaState): [number, number] {
  return isBottomPlayer(playerId, state) ? [4, 5] : [0, 1];
}

export function createPlayerPieces(ownerId: string, state: RpsArenaState, random = Math.random): ArenaPiece[] {
  const [rowA, rowB] = homeRowsForPlayer(ownerId, state);
  const weapons = shuffleWeapons(PIECES_PER_PLAYER, random);
  const pieces: ArenaPiece[] = [];
  let slot = 0;

  for (const row of [rowA, rowB]) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      pieces.push({
        id: `${ownerId}-p${slot}`,
        ownerId,
        kind: "soldier",
        weapon: weapons[slot],
        row,
        col,
        revealed: false,
      });
      slot += 1;
    }
  }

  return pieces;
}

export interface CreateInitialStateOptions {
  options?: RpsArenaOptions;
  firstPlayerId?: string;
}

export function createInitialState(
  playerAId: string,
  playerBId: string,
  random = Math.random,
  createOptions: RpsArenaOptions | CreateInitialStateOptions = DEFAULT_RPS_ARENA_OPTIONS,
): RpsArenaState {
  const resolved: CreateInitialStateOptions =
    createOptions && typeof createOptions === "object" && ("options" in createOptions || "firstPlayerId" in createOptions)
      ? (createOptions as CreateInitialStateOptions)
      : { options: createOptions as RpsArenaOptions };
  const options = normalizeArenaOptions(resolved.options ?? DEFAULT_RPS_ARENA_OPTIONS);
  const firstPlayerId = resolved.firstPlayerId;
  const skipInitiative = Boolean(firstPlayerId);

  const state: RpsArenaState = {
    playerAId,
    playerBId,
    phase: skipInitiative ? "setup" : "initiative",
    currentTurn: firstPlayerId ?? playerAId,
    pieces: [],
    setupReady: {
      [playerAId]: false,
      [playerBId]: false,
    },
    score: createEmptyScore([playerAId, playerBId]),
    winnerId: null,
    initiative: skipInitiative ? null : createEmptyDuelChoices(playerAId, playerBId),
    tiebreak: null,
    lastMove: null,
    options,
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

function setPieceWeapon(pieces: ArenaPiece[], pieceId: string, weapon: Weapon): ArenaPiece[] {
  return pieces.map((piece) => (piece.id === pieceId ? { ...piece, weapon } : piece));
}

export function ensureStateShape(state: RpsArenaState): RpsArenaState {
  return {
    ...state,
    options: normalizeArenaOptions(state.options),
    initiative: state.initiative ?? null,
    lastMove: state.lastMove ?? null,
  };
}

export function setArenaOptions(
  state: RpsArenaState,
  patch: Partial<RpsArenaOptions>,
): RpsArenaState {
  return {
    ...state,
    options: normalizeArenaOptions({ ...state.options, ...patch }),
  };
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
  let pieces = revealPiece(state.pieces, attackerPieceId);
  pieces = revealPiece(pieces, defenderPieceId);

  return {
    ...state,
    pieces,
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
    pieces: revealPiece(removePiece(state.pieces, attacker.id), defender.id),
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
  const lastMove: LastMove = {
    fromRow: attacker.row,
    fromCol: attacker.col,
    toRow: targetRow,
    toCol: targetCol,
    playerId,
  };

  if (!defender) {
    return {
      ...state,
      pieces: movePiece(state.pieces, pieceId, targetRow, targetCol),
      currentTurn: nextTurn,
      lastMove,
    };
  }

  if (defender.kind === "flag") {
    return { ...resolveFlagAttack(state, attacker, defender), lastMove };
  }

  if (defender.kind === "trap") {
    return { ...resolveTrapAttack(state, attacker, defender), lastMove };
  }

  return { ...resolveSoldierBattle(state, attacker, defender, targetRow, targetCol), lastMove };
}

export function submitInitiativeChoice(
  state: RpsArenaState,
  playerId: string,
  weapon: Weapon,
): RpsArenaState | null {
  if (state.phase !== "initiative" || !state.initiative) return null;
  if (playerId !== state.playerAId && playerId !== state.playerBId) return null;

  const choices = {
    ...state.initiative.choices,
    [playerId]: weapon,
  };

  const choiceA = choices[state.playerAId];
  const choiceB = choices[state.playerBId];
  if (!choiceA || !choiceB) {
    return {
      ...state,
      initiative: { choices },
    };
  }

  const outcome = compareWeapons(choiceA, choiceB);
  if (outcome === "tie") {
    return {
      ...state,
      initiative: createEmptyDuelChoices(state.playerAId, state.playerBId),
    };
  }

  const firstPlayerId = outcome === "left" ? state.playerAId : state.playerBId;
  return {
    ...state,
    phase: "setup",
    currentTurn: firstPlayerId,
    initiative: null,
  };
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

  const changeWeapon = normalizeArenaOptions(state.options).changeWeaponAfterDuel;

  if (outcome === "left") {
    let pieces = removePiece(state.pieces, defender.id);
    pieces = revealPiece(pieces, attacker.id);
    if (changeWeapon) {
      pieces = setPieceWeapon(pieces, attacker.id, attackerChoice);
    }
    pieces = movePiece(pieces, attacker.id, targetRow, targetCol);
    return {
      ...state,
      phase: "playing",
      pieces,
      currentTurn: nextTurn,
      tiebreak: null,
    };
  }

  let pieces = revealPiece(removePiece(state.pieces, attacker.id), defender.id);
  if (changeWeapon) {
    pieces = setPieceWeapon(pieces, defender.id, defenderChoice);
  }

  return {
    ...state,
    phase: "playing",
    pieces,
    currentTurn: nextTurn,
    tiebreak: null,
  };
}

export function startNextRound(state: RpsArenaState, random = Math.random): RpsArenaState {
  const firstPlayerId = state.winnerId ?? state.currentTurn ?? state.playerAId;
  const next = createInitialState(state.playerAId, state.playerBId, random, {
    options: normalizeArenaOptions(state.options),
    firstPlayerId,
  });
  return {
    ...next,
    score: state.score,
  };
}

export function clearMatch(state: RpsArenaState, random = Math.random): RpsArenaState {
  return createInitialState(state.playerAId, state.playerBId, random, {
    options: normalizeArenaOptions(state.options),
  });
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

export function pieceLabel(piece: ArenaPiece, viewerId: string): string {
  if (piece.ownerId !== viewerId && !piece.revealed) return "Скрытая карта";
  if (piece.kind === "flag") return "Знамя";
  if (piece.kind === "trap") return "Ловушка";
  if (piece.weapon) return weaponLabel(piece.weapon);
  return "Неизвестно";
}
