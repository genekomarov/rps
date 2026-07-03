export interface GameDefinition {
  id: string;
  title: string;
  description: string;
}

export const GAME_CATALOG: GameDefinition[] = [
  {
    id: "chat",
    title: "Чат",
    description:
      "Простой P2P-чат для проверки соединения и обмена сообщениями между участниками.",
  },
  {
    id: "tic-tac-toe",
    title: "Крестики-нолики",
    description: "Классическая игра 3×3 на двоих. Счёт ведётся только в текущей сессии.",
  },
  {
    id: "rps-arena",
    title: "Камень-ножницы-бумага",
    description:
      "Тактическая игра ICQ на поле 7×6: знамя, ловушка, скрытое оружие и дуэли при ничьей.",
  },
];

export function findGame(gameId: string): GameDefinition | undefined {
  return GAME_CATALOG.find((game) => game.id === gameId);
}
