// Storage helpers backed by electron-store when available, falling back to localStorage.
// Note: Agent runs are NOT stored locally - they sync from Cursor API.

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

function getStore() {
  if (typeof window === 'undefined') return null;
  return window.electronAPI?.storage ?? null;
}

function getItem(key: string): string | null {
  const store = getStore();
  if (store) {
    const value = store.get(key);
    if (typeof value === 'string') return value;
    if (value === undefined || value === null) return null;
    return JSON.stringify(value);
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage.getItem(key);
  }
  return null;
}

function setItem(key: string, value: string): void {
  const store = getStore();
  if (store) {
    store.set(key, value);
    return;
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(key, value);
  }
}

function removeItem(key: string): void {
  const store = getStore();
  if (store) {
    store.delete(key);
    return;
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(key);
  }
}

export function getApiKey(): string | null {
  return getItem(STORAGE_KEYS.API_KEY);
}

export function setApiKey(key: string): void {
  setItem(STORAGE_KEYS.API_KEY, key);
}

export function clearApiKey(): void {
  removeItem(STORAGE_KEYS.API_KEY);
}

export function getCachedRepos(ignoreExpiry = false): CachedRepo[] | null {
  const fetchedAtStr = getItem(STORAGE_KEYS.REPOS_FETCHED_AT);
  if (!fetchedAtStr) return null;

  const age = Date.now() - parseInt(fetchedAtStr, 10);
  if (!ignoreExpiry && age > REPO_CACHE_TTL_MS) return null;

  const reposJson = getItem(STORAGE_KEYS.REPOS);
  if (!reposJson) return null;

  try {
    return JSON.parse(reposJson) as CachedRepo[];
  } catch {
    return null;
  }
}

export function setCachedRepos(repos: CachedRepo[]): void {
  setItem(STORAGE_KEYS.REPOS, JSON.stringify(repos));
  setItem(STORAGE_KEYS.REPOS_FETCHED_AT, Date.now().toString());
}

export function getLastSelectedRepo(): string | null {
  return getItem(STORAGE_KEYS.LAST_SELECTED_REPO);
}

export function setLastSelectedRepo(repository: string): void {
  setItem(STORAGE_KEYS.LAST_SELECTED_REPO, repository);
}
