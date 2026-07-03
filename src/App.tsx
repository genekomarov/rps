import { useEffect } from "react";
import AppLayout from "./components/AppLayout";
import { SessionProvider, useSession } from "./context/SessionContext";
import { findGame } from "./games/catalog";
import { GAME_COMPONENTS } from "./games/registry";
import { useHashRoute } from "./hooks/useHashRoute";
import ConnectionPage from "./pages/ConnectionPage";
import WelcomePage from "./pages/WelcomePage";

function AppRouter() {
  const { route, navigate } = useHashRoute();
  const { isConnected, nickname } = useSession();

  useEffect(() => {
    if (route.name === "game" && !isConnected) {
      navigate({ name: "connection" });
    }
  }, [route, isConnected, navigate]);

  if (route.name === "game") {
    if (!isConnected) return null;

    const game = findGame(route.gameId);
    if (!game) {
      return (
        <AppLayout connected={isConnected} nickname={nickname}>
          <section className="card">
            <h1>Игра не найдена</h1>
            <p className="muted">Игра «{route.gameId}» отсутствует в каталоге.</p>
          </section>
        </AppLayout>
      );
    }

    const GameComponent = GAME_COMPONENTS[route.gameId];
    if (GameComponent) {
      return (
        <AppLayout connected={isConnected} nickname={nickname}>
          <GameComponent />
        </AppLayout>
      );
    }
  }

  if (route.name === "connection") {
    return (
      <AppLayout connected={isConnected} nickname={nickname}>
        <ConnectionPage />
      </AppLayout>
    );
  }

  return (
    <AppLayout connected={isConnected} nickname={nickname}>
      <WelcomePage connected={isConnected} />
    </AppLayout>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <AppRouter />
    </SessionProvider>
  );
}
