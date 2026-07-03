import { useCallback, useEffect, useState } from "react";
import { buildHash, navigateTo, parseHash, type AppRoute } from "../lib/hashRouter";

export function useHashRoute() {
  const [route, setRoute] = useState<AppRoute>(() => parseHash(window.location.hash));

  useEffect(() => {
    const syncRoute = () => setRoute(parseHash(window.location.hash));

    window.addEventListener("hashchange", syncRoute);
    if (!window.location.hash) {
      window.location.hash = buildHash({ name: "welcome" });
    }

    return () => window.removeEventListener("hashchange", syncRoute);
  }, []);

  const navigate = useCallback((nextRoute: AppRoute) => {
    navigateTo(nextRoute);
  }, []);

  return { route, navigate };
}
