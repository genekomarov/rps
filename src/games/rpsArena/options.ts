const OPTIONS_KEY = "rpschat.rpsArena.options.v1";

export interface RpsArenaOptions {
  changeWeaponAfterDuel: boolean;
}

export const DEFAULT_RPS_ARENA_OPTIONS: RpsArenaOptions = {
  changeWeaponAfterDuel: false,
};

function hasWindow(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

export function normalizeArenaOptions(value?: Partial<RpsArenaOptions> | null): RpsArenaOptions {
  return {
    changeWeaponAfterDuel: Boolean(value?.changeWeaponAfterDuel),
  };
}

export function loadArenaOptions(): RpsArenaOptions {
  if (!hasWindow()) {
    return { ...DEFAULT_RPS_ARENA_OPTIONS };
  }

  try {
    const raw = window.localStorage.getItem(OPTIONS_KEY);
    if (!raw) return { ...DEFAULT_RPS_ARENA_OPTIONS };
    const parsed = JSON.parse(raw) as Partial<RpsArenaOptions>;
    return normalizeArenaOptions(parsed);
  } catch {
    return { ...DEFAULT_RPS_ARENA_OPTIONS };
  }
}

export function saveArenaOptions(patch: Partial<RpsArenaOptions>): RpsArenaOptions {
  const next = normalizeArenaOptions({ ...loadArenaOptions(), ...patch });
  if (hasWindow()) {
    window.localStorage.setItem(OPTIONS_KEY, JSON.stringify(next));
  }
  return next;
}
