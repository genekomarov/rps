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
];

export function findGame(gameId: string): GameDefinition | undefined {
  return GAME_CATALOG.find((game) => game.id === gameId);
}
