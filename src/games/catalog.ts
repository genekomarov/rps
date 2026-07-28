export interface GameDefinition {
  id: string;
  title: string;
}

export const GAME_CATALOG: GameDefinition[] = [
  {
    id: "chat",
    title: "Чат",
  },
  {
    id: "tic-tac-toe",
    title: "Крестики-нолики",
  },
  {
    id: "rps-arena",
    title: "Камень-ножницы-бумага",
  },
];

export function findGame(gameId: string): GameDefinition | undefined {
  return GAME_CATALOG.find((game) => game.id === gameId);
}
