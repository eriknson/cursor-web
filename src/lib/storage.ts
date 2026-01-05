// localStorage helpers for API key and repo cache
// Note: Agent runs are NOT stored locally - they sync from Cursor API

const STORAGE_KEYS = {
  API_KEY: 'cursor_api_key',
  REPOS: 'cursor_repos',
  REPOS_FETCHED_AT: 'cursor_repos_fetched_at',
  LAST_SELECTED_REPO: 'cursor_last_selected_repo',
} as const;

// Repo cache TTL: 1 hour (to respect rate limits)
const REPO_CACHE_TTL_MS = 60 * 60 * 1000;

export interface CachedRepo {
  owner: string;
  name: string;
  repository: string;
  pushedAt?: string; // ISO timestamp of last push from GitHub
}

type SafeStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const memoryStorage = (() => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  };
})();

function getStorage(): SafeStorage {
  if (typeof window === 'undefined') return memoryStorage;
  try {
    const testKey = '__cursor_storage_test__';
    window.localStorage.setItem(testKey, 'ok');
    window.localStorage.removeItem(testKey);
    return window.localStorage;
  } catch {
    return memoryStorage;
  }
}

function safeGetItem(key: string): string | null {
  try {
    return getStorage().getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    getStorage().setItem(key, value);
  } catch {
    // Swallow errors to avoid breaking UI when storage is unavailable
  }
}

function safeRemoveItem(key: string): void {
  try {
    getStorage().removeItem(key);
  } catch {
    // ignore
  }
}

export function getApiKey(): string | null {
  return safeGetItem(STORAGE_KEYS.API_KEY);
}

export function setApiKey(key: string): void {
  safeSetItem(STORAGE_KEYS.API_KEY, key);
}

export function clearApiKey(): void {
  safeRemoveItem(STORAGE_KEYS.API_KEY);
}

export function getCachedRepos(ignoreExpiry = false): CachedRepo[] | null {
  const fetchedAtRaw = safeGetItem(STORAGE_KEYS.REPOS_FETCHED_AT);
  if (!fetchedAtRaw) return null;

  const fetchedAt = parseInt(fetchedAtRaw, 10);
  if (Number.isNaN(fetchedAt)) {
    // Corrupted timestamp - clear cache
    safeRemoveItem(STORAGE_KEYS.REPOS);
    safeRemoveItem(STORAGE_KEYS.REPOS_FETCHED_AT);
    return null;
  }

  const age = Date.now() - fetchedAt;
  if (!ignoreExpiry && age > REPO_CACHE_TTL_MS) return null;

  const reposJson = safeGetItem(STORAGE_KEYS.REPOS);
  if (!reposJson) return null;

  try {
    return JSON.parse(reposJson) as CachedRepo[];
  } catch {
    // Corrupted cache - clear and return null
    safeRemoveItem(STORAGE_KEYS.REPOS);
    safeRemoveItem(STORAGE_KEYS.REPOS_FETCHED_AT);
    return null;
  }
}

export function setCachedRepos(repos: CachedRepo[]): void {
  safeSetItem(STORAGE_KEYS.REPOS, JSON.stringify(repos));
  safeSetItem(STORAGE_KEYS.REPOS_FETCHED_AT, Date.now().toString());
}

export function getLastSelectedRepo(): string | null {
  return safeGetItem(STORAGE_KEYS.LAST_SELECTED_REPO);
}

export function setLastSelectedRepo(repository: string): void {
  safeSetItem(STORAGE_KEYS.LAST_SELECTED_REPO, repository);
}
