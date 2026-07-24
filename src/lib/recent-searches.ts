/**
 * Recent searches — localStorage only, browser only. Saved by the SearchBar on
 * submit, rendered as one-tap chips by <RecentSearches>. Every function is
 * try/catch-safe: private browsing or a blocked storage API just means no chips.
 */

export type RecentSearch = {
  kind: "flight" | "hotel";
  /** Short human label, e.g. "AMD → DXB · 10-08-26" */
  label: string;
  /** Full search URL to re-run it. */
  url: string;
  ts: number;
};

const KEY = "rs.recent-searches";
const MAX = 6;

function parse(raw: string | null): RecentSearch[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as RecentSearch[];
    return Array.isArray(list) ? list.filter((s) => s?.url && s?.label).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function getRecentSearches(): RecentSearch[] {
  try {
    return parse(window.localStorage.getItem(KEY));
  } catch {
    return [];
  }
}

/* ── useSyncExternalStore adapters (referentially-stable snapshots) ────────── */

const EMPTY: RecentSearch[] = [];
let snapRaw: string | null | undefined;
let snapList: RecentSearch[] = EMPTY;

/** Client snapshot — re-parses only when the stored string actually changed. */
export function recentSearchesSnapshot(): RecentSearch[] {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  if (raw !== snapRaw) {
    snapRaw = raw;
    snapList = parse(raw);
  }
  return snapList;
}

export const recentSearchesServerSnapshot = (): RecentSearch[] => EMPTY;

/** Cross-tab updates via the storage event; same-tab saves happen pre-navigation. */
export function subscribeRecentSearches(cb: () => void): () => void {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

export function saveRecentSearch(s: Omit<RecentSearch, "ts">): void {
  try {
    const next = [
      { ...s, ts: Date.now() },
      ...getRecentSearches().filter((x) => x.url !== s.url),
    ].slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — chips just don't appear */
  }
}
