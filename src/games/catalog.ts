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
];

export function findGame(gameId: string): GameDefinition | undefined {
  return GAME_CATALOG.find((game) => game.id === gameId);
}
