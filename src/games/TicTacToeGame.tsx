import { GameScoreLine } from "../components/GameScoreLine";
import { buildHash } from "../lib/hashRouter";
import { useTicTacToe } from "./ticTacToe/useTicTacToe";

export default function TicTacToeGame() {
  const {
    state,
    opponent,
    clientId,
    myMark,
    canPlay,
    peersCount,
    hasInvalidOpponent,
    makeMove,
    startNextRound,
  } = useTicTacToe();

  const statusText = (() => {
    if (hasInvalidOpponent) {
      return "Одинаковый ID вкладки. Откройте вторую вкладку в режиме инкогнито или другом браузере.";
    }
    if (peersCount === 0) return "Ожидаем соперника…";
    if (peersCount > 1) return "Игра рассчитана на двух участников. Отключите лишних игроков.";
    if (!state) return "Синхронизация игры…";
    if (state.status === "finished") {
      if (state.winner === "draw") return "Ничья!";
      const winnerId = state.winner === "X" ? state.xPlayerId : state.oPlayerId;
      return winnerId === clientId ? "Вы победили!" : "Победил соперник.";
    }
    return canPlay ? "Ваш ход" : "Ход соперника";
  })();

  return (
    <>
      <section className="card game-header">
        <div className="game-header-row">
          <h1>Крестики-нолики</h1>
          <a className="button-secondary game-back-link" href={buildHash({ name: "welcome" })}>
            К каталогу
          </a>
        </div>
      </section>

      <section className="card">
        <p className="ttt-status">{statusText}</p>
      </section>

      {state ? (
        <section className="card ttt-board-card">
          <div className="ttt-board-stack">
            <div className="ttt-board" role="grid" aria-label="Поле крестиков-ноликов">
              {state.board.map((cell, index) => {
                const isClickable = canPlay && cell === null;
                return (
                  <button
                    key={index}
                    type="button"
                    className={`ttt-cell${cell === "X" ? " ttt-cell-x" : ""}${cell === "O" ? " ttt-cell-o" : ""}`}
                    disabled={!isClickable}
                    onClick={() => makeMove(index)}
                    aria-label={cell ? `Клетка ${index + 1}: ${cell}` : `Клетка ${index + 1}: пусто`}
                  >
                    {cell}
                  </button>
                );
              })}
            </div>

            {opponent ? (
              <GameScoreLine
                you={state.score.wins[clientId] ?? 0}
                opponent={state.score.wins[opponent.id] ?? 0}
                draws={state.score.draws}
              />
            ) : null}
          </div>

          {state.status === "finished" ? (
            <div className="actions">
              <button type="button" onClick={startNextRound}>
                Следующий раунд
              </button>
              <button type="button" className="button-secondary" onClick={startNextRound}>
                Очистить состояние
              </button>
            </div>
          ) : (
            <div className="actions">
              <button type="button" className="button-secondary" onClick={startNextRound}>
                Очистить состояние
              </button>
            </div>
          )}

          {myMark ? <p className="muted">Вы играете за {myMark}.</p> : null}
        </section>
      ) : null}
    </>
  );
}
