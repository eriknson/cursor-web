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

export function getApiKey(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEYS.API_KEY);
}

export function setApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.API_KEY, key);
}

export function clearApiKey(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEYS.API_KEY);
}

export function getCachedRepos(ignoreExpiry = false): CachedRepo[] | null {
  if (typeof window === 'undefined') return null;
  
  const fetchedAt = localStorage.getItem(STORAGE_KEYS.REPOS_FETCHED_AT);
  if (!fetchedAt) return null;
  
  const age = Date.now() - parseInt(fetchedAt, 10);
  if (!ignoreExpiry && age > REPO_CACHE_TTL_MS) return null;
  
  const reposJson = localStorage.getItem(STORAGE_KEYS.REPOS);
  if (!reposJson) return null;
  
  try {
    return JSON.parse(reposJson) as CachedRepo[];
  } catch {
    return null;
  }
}

export function setCachedRepos(repos: CachedRepo[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.REPOS, JSON.stringify(repos));
  localStorage.setItem(STORAGE_KEYS.REPOS_FETCHED_AT, Date.now().toString());
}

export function getLastSelectedRepo(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEYS.LAST_SELECTED_REPO);
}

export function setLastSelectedRepo(repository: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.LAST_SELECTED_REPO, repository);
}
