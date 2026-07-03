import { useMemo } from "react";
import { buildHash } from "../lib/hashRouter";
import {
  BOARD_COLS,
  BOARD_ROWS,
  getLegalMoves,
  isBottomPlayer,
  weaponGlyph,
  weaponLabel,
  type ArenaPiece,
  type Weapon,
} from "./rpsArena/logic";
import { useRpsArena } from "./rpsArena/useRpsArena";

function statusMessage(
  state: NonNullable<ReturnType<typeof useRpsArena>["state"]>,
  clientId: string,
  isMyTurn: boolean,
): string {
  if (state.phase === "setup") {
    if (state.setupReady[clientId]) return "Ожидаем расстановку соперника…";
    return "Назначьте знамя и ловушку, затем нажмите «Готов».";
  }

  if (state.phase === "tiebreak") {
    if (state.tiebreak?.choices[clientId]) return "Ожидаем выбор соперника в дуэли…";
    return "Ничья оружия! Выберите камень, ножницы или бумагу.";
  }

  if (state.phase === "finished") {
    return state.winnerId === clientId ? "Партия выиграна!" : "Партия проиграна.";
  }

  return isMyTurn ? "Ваш ход" : "Ход соперника";
}

function renderPiece(piece: ArenaPiece, isOwn: boolean): string {
  if (!isOwn && !piece.revealed) {
    return "🎴";
  }

  if (piece.kind === "flag") {
    return "🚩";
  }
  if (piece.kind === "trap") {
    return "🕳️";
  }
  return piece.weapon ? weaponGlyph(piece.weapon) : "❓";
}

export default function RpsArenaGame() {
  const {
    state,
    opponent,
    nickname,
    clientId,
    peersCount,
    hasInvalidOpponent,
    selectedPieceId,
    setSelectedPieceId,
    setSpecial,
    readySetup,
    moveSelectedPiece,
    chooseTiebreak,
    playNextRound,
    clearGameState,
    isMyTurn,
    myTiebreakChoice,
  } = useRpsArena();

  const legalMoves = useMemo(() => {
    if (!state || !selectedPieceId) return [];
    return getLegalMoves(state, clientId, selectedPieceId);
  }, [state, selectedPieceId, clientId]);

  const statusText = (() => {
    if (hasInvalidOpponent) {
      return "Одинаковый ID вкладки. Откройте вторую вкладку в режиме инкогнито или другом браузере.";
    }
    if (peersCount === 0) return "Ожидаем соперника…";
    if (peersCount > 1) return "Игра рассчитана на двух участников.";
    if (!state) return "Синхронизация игры…";
    return statusMessage(state, clientId, isMyTurn);
  })();

  const myPieces = state?.pieces.filter((piece) => piece.ownerId === clientId) ?? [];
  const canEditSetup = Boolean(state?.phase === "setup" && !state.setupReady[clientId]);
  const shouldFlipBoard = Boolean(state && !isBottomPlayer(clientId, state));

  function toModelCoords(displayRow: number, displayCol: number): { row: number; col: number } {
    if (!shouldFlipBoard) {
      return { row: displayRow, col: displayCol };
    }
    return {
      row: BOARD_ROWS - 1 - displayRow,
      col: displayCol,
    };
  }

  function handleCellClick(displayRow: number, displayCol: number) {
    if (!state) return;
    const { row, col } = toModelCoords(displayRow, displayCol);

    const piece = state.pieces.find((item) => item.row === row && item.col === col);
    const isLegalTarget = legalMoves.some((move) => move.row === row && move.col === col);

    if (state.phase === "playing" && selectedPieceId && isLegalTarget) {
      moveSelectedPiece(row, col);
      return;
    }

    if (state.phase === "playing" && piece?.ownerId === clientId && piece.kind === "soldier" && isMyTurn) {
      setSelectedPieceId(piece.id === selectedPieceId ? null : piece.id);
    }
  }

  function cycleSpecial(pieceId: string) {
    if (!state || !canEditSetup) return;
    const piece = state.pieces.find((item) => item.id === pieceId);
    if (!piece || piece.ownerId !== clientId) return;

    if (piece.kind === "soldier") {
      setSpecial(pieceId, "flag");
      return;
    }
    if (piece.kind === "flag") {
      setSpecial(pieceId, "trap");
      return;
    }
    setSpecial(pieceId, "soldier");
  }

  return (
    <>
      <section className="card game-header">
        <div className="game-header-row">
          <div>
            <h1>Камень-ножницы-бумага</h1>
            <p className="muted">Тактическая игра ICQ: поле 7×6, знамя, ловушка и скрытое оружие.</p>
          </div>
          <a className="button-secondary game-back-link" href={buildHash({ name: "welcome" })}>
            К каталогу
          </a>
        </div>
      </section>

      <section className="card">
        <p className="arena-status">{statusText}</p>

        {state && opponent ? (
          <div className="arena-scoreboard">
            <div className="arena-score-item">
              <span>{nickname} (вы)</span>
              <strong>{state.score.wins[clientId] ?? 0}</strong>
            </div>
            <div className="arena-score-item">
              <span>{opponent.name || opponent.id}</span>
              <strong>{state.score.wins[opponent.id] ?? 0}</strong>
            </div>
          </div>
        ) : (
          <p className="muted">Счёт ведётся только в рамках текущей сессии подключения.</p>
        )}
      </section>

      {state ? (
        <>
          <section className="card arena-board-card">
            <div
              className="arena-board"
              style={{ gridTemplateColumns: `repeat(${BOARD_COLS}, minmax(42px, 1fr))` }}
            >
              {Array.from({ length: BOARD_ROWS }, (_, displayRow) =>
                Array.from({ length: BOARD_COLS }, (_, displayCol) => {
                  const { row, col } = toModelCoords(displayRow, displayCol);
                  const piece = state.pieces.find((item) => item.row === row && item.col === col);
                  const isOwn = piece?.ownerId === clientId;
                  const isSelected = piece?.id === selectedPieceId;
                  const isMoveTarget = legalMoves.some((move) => move.row === row && move.col === col);
                  const isHomeRow =
                    piece &&
                    (isBottomPlayer(piece.ownerId, state)
                      ? row >= BOARD_ROWS - 2
                      : row <= 1);

                  return (
                    <button
                      key={`${displayRow}-${displayCol}`}
                      type="button"
                      className={`arena-cell${isSelected ? " arena-cell-selected" : ""}${isMoveTarget ? " arena-cell-target" : ""}${isHomeRow ? " arena-cell-home" : ""}`}
                      onClick={() => handleCellClick(displayRow, displayCol)}
                      disabled={state.phase === "tiebreak" || state.phase === "finished"}
                      aria-label={`Клетка ${displayRow + 1}:${displayCol + 1}`}
                    >
                      {piece ? (
                        <span className={`arena-piece${isOwn ? " arena-piece-own" : ""}`}>
                          {renderPiece(piece, Boolean(isOwn))}
                        </span>
                      ) : null}
                    </button>
                  );
                }),
              )}
            </div>
          </section>

          {canEditSetup ? (
            <section className="card arena-setup">
              <h2>Расстановка</h2>
              <p className="muted">
                Кликните по своей фигуре, чтобы назначить знамя или ловушку. Нужно ровно по одному
                знамени и одной ловушке. Свои солдаты показывают оружие.
              </p>
              <ul className="arena-setup-list">
                {myPieces.map((piece) => (
                  <li key={piece.id}>
                    <button type="button" className="button-secondary" onClick={() => cycleSpecial(piece.id)}>
                      {renderPiece(piece, true)} · {piece.kind === "flag" ? "Знамя" : piece.kind === "trap" ? "Ловушка" : piece.weapon ? weaponLabel(piece.weapon) : "Солдат"} · ({piece.row},{piece.col})
                    </button>
                  </li>
                ))}
              </ul>
              <div className="actions">
                <button type="button" onClick={readySetup}>
                  Готов
                </button>
              </div>
            </section>
          ) : null}

          {state.phase === "tiebreak" && !myTiebreakChoice ? (
            <section className="card arena-tiebreak">
              <h2>Дуэль</h2>
              <p className="muted">Одинаковое оружие — выберите жест для перестрелки.</p>
              <div className="actions">
                {(["rock", "paper", "scissors"] as Weapon[]).map((weapon) => (
                  <button key={weapon} type="button" onClick={() => chooseTiebreak(weapon)}>
                    {weaponGlyph(weapon)} {weaponLabel(weapon)}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {state.phase === "finished" ? (
            <section className="card">
              <div className="actions">
                <button type="button" onClick={playNextRound}>
                  Следующая партия
                </button>
                <button type="button" className="button-secondary" onClick={clearGameState}>
                  Очистить состояние
                </button>
              </div>
            </section>
          ) : null}

          {state.phase !== "finished" ? (
            <section className="card">
              <div className="actions">
                <button type="button" className="button-secondary" onClick={clearGameState}>
                  Очистить состояние
                </button>
              </div>
            </section>
          ) : null}

          {state.phase === "playing" && selectedPieceId ? (
            <p className="muted">Выбран солдат. Подсвеченные клетки — доступные ходы и атаки.</p>
          ) : null}
        </>
      ) : null}
    </>
  );
}
