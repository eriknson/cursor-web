// localStorage helpers for API key and repo cache

const STORAGE_KEYS = {
  API_KEY: 'cursor_api_key',
  REPOS: 'cursor_repos',
  REPOS_FETCHED_AT: 'cursor_repos_fetched_at',
  RUNS: 'cursor_runs',
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

export interface StoredRun {
  id: string;
  prompt: string;
  repository: string;
  status: string;
  createdAt: string;
  prUrl?: string;
  agentUrl?: string;
  agentName?: string; // Title from the cloud agent once it understands the task
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

export function getStoredRuns(): StoredRun[] {
  if (typeof window === 'undefined') return [];
  const runsJson = localStorage.getItem(STORAGE_KEYS.RUNS);
  if (!runsJson) return [];
  try {
    return JSON.parse(runsJson) as StoredRun[];
  } catch {
    return [];
  }
}

export function addStoredRun(run: StoredRun): void {
  if (typeof window === 'undefined') return;
  const runs = getStoredRuns();
  // Prepend new run, keep last 50
  const updated = [run, ...runs.filter(r => r.id !== run.id)].slice(0, 50);
  localStorage.setItem(STORAGE_KEYS.RUNS, JSON.stringify(updated));
}

export function updateStoredRun(id: string, updates: Partial<StoredRun>): void {
  if (typeof window === 'undefined') return;
  const runs = getStoredRuns();
  const updated = runs.map(r => r.id === id ? { ...r, ...updates } : r);
  localStorage.setItem(STORAGE_KEYS.RUNS, JSON.stringify(updated));
}

export function clearStuckRuns(): void {
  if (typeof window === 'undefined') return;
  const runs = getStoredRuns();
  // Remove runs that are stuck in building state (RUNNING or CREATING)
  const filtered = runs.filter(r => r.status !== 'RUNNING' && r.status !== 'CREATING');
  localStorage.setItem(STORAGE_KEYS.RUNS, JSON.stringify(filtered));
}

export function getLastSelectedRepo(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEYS.LAST_SELECTED_REPO);
}

export function setLastSelectedRepo(repository: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.LAST_SELECTED_REPO, repository);
}
