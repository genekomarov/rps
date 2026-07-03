export type AppRoute =
  | { name: "welcome" }
  | { name: "connection" }
  | { name: "game"; gameId: string };

export function parseHash(hash: string): AppRoute {
  const path = hash.replace(/^#/, "").replace(/^\//, "").trim();

  if (!path) return { name: "welcome" };
  if (path === "connection") return { name: "connection" };
  if (path.startsWith("games/")) {
    const gameId = path.slice("games/".length);
    if (gameId) return { name: "game", gameId };
  }

  return { name: "welcome" };
}

export function buildHash(route: AppRoute): string {
  switch (route.name) {
    case "welcome":
      return "#/";
    case "connection":
      return "#/connection";
    case "game":
      return `#/games/${route.gameId}`;
  }
}

export function navigateTo(route: AppRoute): void {
  const nextHash = buildHash(route);
  if (window.location.hash !== nextHash) {
    window.location.hash = nextHash;
  }
}
