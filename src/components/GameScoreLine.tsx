interface GameScoreLineProps {
  you: number;
  opponent: number;
  draws?: number;
}

export function GameScoreLine({ you, opponent, draws }: GameScoreLineProps) {
  return (
    <p className="game-score-line">
      <span>Вы: {you}</span>
      <span>Противник: {opponent}</span>
      {draws !== undefined ? <span>Ничья: {draws}</span> : null}
    </p>
  );
}
