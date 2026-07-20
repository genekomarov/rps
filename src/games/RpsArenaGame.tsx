import { useMemo } from "react";
import { buildHash } from "../lib/hashRouter";
import { BOARD_COLS, BOARD_ROWS, getLegalMoves, isBottomPlayer } from "./rpsArena/logic";
import { ArenaPieceIcon } from "./rpsArena/icons";
import { ArenaDuel } from "./rpsArena/ArenaDuel";
import { useRpsArena } from "./rpsArena/useRpsArena";

function statusMessage(
  state: NonNullable<ReturnType<typeof useRpsArena>["state"]>,
  clientId: string,
  isMyTurn: boolean,
): string {
  if (state.phase === "initiative") {
    if (state.initiative?.choices[clientId]) return "Ожидаем выбор соперника…";
    return "Дуэль за первый ход: выберите камень, ножницы или бумагу.";
  }

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
    chooseDuel,
    updateOptions,
    options,
    playNextRound,
    clearGameState,
    isMyTurn,
    showDuel,
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

  const canEditSetup = Boolean(state?.phase === "setup" && !state.setupReady[clientId]);
  const shouldFlipBoard = Boolean(state && !isBottomPlayer(clientId, state));
  const boardLocked = Boolean(
    state && (state.phase === "initiative" || state.phase === "tiebreak" || state.phase === "finished"),
  );

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

    if (canEditSetup && piece?.ownerId === clientId) {
      cycleSpecial(piece.id);
      return;
    }

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

  const duelCopy =
    state?.phase === "initiative"
      ? {
          title: "Кто ходит первым",
          description: "Победитель дуэли получает право первого хода в партии.",
        }
      : {
          title: "Дуэль",
          description: "Одинаковое оружие — выберите жест для перестрелки.",
        };

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
                      disabled={boardLocked}
                      aria-label={`Клетка ${displayRow + 1}:${displayCol + 1}`}
                    >
                      {piece ? (
                        <span
                          className={`arena-piece arena-piece-player-${piece.ownerId === state.playerAId ? "a" : "b"}${isOwn ? " arena-piece-own" : ""}`}
                        >
                          <ArenaPieceIcon piece={piece} isOwn={Boolean(isOwn)} className="arena-icon" />
                        </span>
                      ) : null}
                    </button>
                  );
                }),
              )}
            </div>
          </section>

          {showDuel ? (
            <ArenaDuel
              title={duelCopy.title}
              description={duelCopy.description}
              onChoose={chooseDuel}
            />
          ) : null}

          {canEditSetup ? (
            <section className="card arena-setup">
              <h2>Расстановка</h2>
              <p className="muted">
                Кликайте по своим картам прямо на поле, чтобы переключать: оружие → знамя →
                ловушка → оружие. Нужно выставить ровно по одному знамени и ловушке.
              </p>
              <div className="actions">
                <button type="button" onClick={readySetup}>
                  Готов
                </button>
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

      <section className="card arena-options">
        <h2>Опции</h2>
        <label className="arena-option">
          <input
            type="checkbox"
            checked={options.changeWeaponAfterDuel}
            onChange={(event) => updateOptions({ changeWeaponAfterDuel: event.target.checked })}
          />
          <span>
            <strong>Изменение фигуры после дуэли</strong>
            <span className="muted">
              Победитель дуэли получает оружие, выбранное в перестрелке, вместо исходного.
            </span>
          </span>
        </label>
      </section>
    </>
  );
}
