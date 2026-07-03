import type { ComponentType } from "react";
import ChatGame from "./ChatGame";
import RpsArenaGame from "./RpsArenaGame";
import TicTacToeGame from "./TicTacToeGame";

export const GAME_COMPONENTS: Record<string, ComponentType> = {
  chat: ChatGame,
  "tic-tac-toe": TicTacToeGame,
  "rps-arena": RpsArenaGame,
};
