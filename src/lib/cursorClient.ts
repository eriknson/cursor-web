// Cursor Cloud Agents API client with resilient handling

import {
  ApiKeyInfo,
  Repository,
  Agent,
  ConversationResponse,
  LaunchAgentParams,
  FollowUpParams,
  RateLimitError,
  AuthError,
  MalformedResponseError,
  NotFoundError,
} from './cursorTypes';
import { requestQueue } from './requestQueue';

const CURSOR_API_BASE = 'https://api.cursor.com/v0';
const USE_PROXY = true;
const DEFAULT_TIMEOUT_MS = 30000; // 30s - generous to avoid killing slow responses
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 400;

// Priority levels for request queue
const PRIORITY = {
  USER_ACTION: 1, // User-initiated actions (launch, stop, follow-up)
  CRITICAL: 5, // Auth, status checks
  NORMAL: 10, // Regular fetches
  PREFETCH: 20, // Background preloading
} as const;

type HttpMethod = 'GET' | 'POST' | 'DELETE';

function getProxyUrl(path: string): string {
  return `/api/cursor${path}`;
}

function getDirectUrl(path: string): string {
  return `${CURSOR_API_BASE}${path}`;
}

function getUrl(path: string): string {
  return USE_PROXY ? getProxyUrl(path) : getDirectUrl(path);
}

function buildHeaders(apiKey: string, includeContentType = false): HeadersInit {
  const headers: HeadersInit = {};

  if (USE_PROXY) {
    headers['X-Cursor-Api-Key'] = apiKey;
  } else {
    headers['Authorization'] = `Basic ${btoa(apiKey + ':')}`;
  }

  if (includeContentType) {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetriableStatus(status: number) {
  return status === 429 || status === 408 || status === 500 || status === 502 || status === 503 || status === 504;
}

function computeBackoff(attempt: number) {
  const jitter = Math.random() * 120;
  return Math.min(4000, RETRY_BASE_DELAY_MS * Math.pow(2, attempt)) + jitter;
}

async function parseJsonSafe<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    throw new MalformedResponseError(`Malformed response from ${res.url || 'Cursor API'}`);
  }
}

async function fetchWithResilience<T>(
  path: string,
  method: HttpMethod,
  apiKey: string,
  body?: unknown,
  expectJson = true
): Promise<T> {
  const url = getUrl(path);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method,
        headers: buildHeaders(apiKey, body !== undefined),
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const retryAfterHeader = res.headers.get('retry-after');
        const retryAfterMs = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : undefined;

        if (res.status === 401 || res.status === 403) {
          throw new AuthError(`Invalid API key (${res.status})`);
        }

        // 409 Conflict typically means the resource doesn't exist yet
        // (e.g., conversation for a newly created agent)
        if (res.status === 409 || res.status === 404) {
          throw new NotFoundError(`Resource not found (${res.status})`);
        }

        if (res.status === 429) {
          if (attempt < MAX_RETRIES) {
            const backoff = retryAfterMs ?? computeBackoff(attempt);
            await delay(backoff);
            continue;
          }
          throw new RateLimitError('Rate limited - please wait', retryAfterMs);
        }

        if (isRetriableStatus(res.status) && attempt < MAX_RETRIES) {
          await delay(computeBackoff(attempt));
          continue;
        }

        const text = await res.text().catch(() => '');
        throw new Error(`Request failed (${res.status}): ${text || res.statusText}`);
      }

      if (!expectJson) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return undefined as any;
      }

      return await parseJsonSafe<T>(res);
    } catch (err) {
      clearTimeout(timeout);

      // Abort / timeout
      if (err instanceof DOMException && err.name === 'AbortError') {
        if (attempt < MAX_RETRIES) {
          await delay(computeBackoff(attempt));
          continue;
        }
        throw new Error('Request timed out');
      }

      // Network errors (TypeError from fetch) - retry a few times
      if (err instanceof TypeError && attempt < MAX_RETRIES) {
        await delay(computeBackoff(attempt));
        continue;
      }

      throw err;
    }
  }

  throw new Error('Request failed after retries');
}

// --------------------
// Public API (all requests go through the rate-limited queue)
// --------------------

export async function validateApiKey(apiKey: string): Promise<ApiKeyInfo> {
  return requestQueue.enqueue(
    () => fetchWithResilience<ApiKeyInfo>('/me', 'GET', apiKey),
    PRIORITY.CRITICAL
  );
}

export async function listRepositories(apiKey: string): Promise<Repository[]> {
  return requestQueue.enqueue(async () => {
    const data = await fetchWithResilience<{ repositories: Repository[] }>('/repositories', 'GET', apiKey);
    return data.repositories || [];
  }, PRIORITY.NORMAL);
}

export async function listAgents(apiKey: string, limit = 20): Promise<Agent[]> {
  return requestQueue.enqueue(async () => {
    const data = await fetchWithResilience<{ agents: Agent[] }>(`/agents?limit=${limit}`, 'GET', apiKey);
    return data.agents || [];
  }, PRIORITY.NORMAL);
}

export async function getAgentStatus(apiKey: string, agentId: string): Promise<Agent> {
  return requestQueue.enqueue(
    () => fetchWithResilience<Agent>(`/agents/${agentId}`, 'GET', apiKey),
    PRIORITY.NORMAL
  );
}

export async function getAgentConversation(apiKey: string, agentId: string): Promise<ConversationResponse> {
  return requestQueue.enqueue(
    () => fetchWithResilience<ConversationResponse>(`/agents/${agentId}/conversation`, 'GET', apiKey),
    PRIORITY.NORMAL
  );
}

// Prefetch variant - lower priority, won't block user actions
export async function prefetchAgentConversation(apiKey: string, agentId: string): Promise<ConversationResponse> {
  return requestQueue.enqueue(
    () => fetchWithResilience<ConversationResponse>(`/agents/${agentId}/conversation`, 'GET', apiKey),
    PRIORITY.PREFETCH
  );
}

export async function launchAgent(apiKey: string, params: LaunchAgentParams): Promise<Agent> {
  return requestQueue.enqueue(
    () => fetchWithResilience<Agent>('/agents', 'POST', apiKey, params),
    PRIORITY.USER_ACTION
  );
}

export async function addFollowUp(apiKey: string, agentId: string, params: FollowUpParams): Promise<{ id: string }> {
  return requestQueue.enqueue(
    () => fetchWithResilience<{ id: string }>(`/agents/${agentId}/followup`, 'POST', apiKey, params),
    PRIORITY.USER_ACTION
  );
}

export async function stopAgent(apiKey: string, agentId: string): Promise<{ id: string }> {
  return requestQueue.enqueue(
    () => fetchWithResilience<{ id: string }>(`/agents/${agentId}/stop`, 'POST', apiKey),
    PRIORITY.USER_ACTION
  );
}

export async function deleteAgent(apiKey: string, agentId: string): Promise<{ id: string }> {
  return requestQueue.enqueue(
    () => fetchWithResilience<{ id: string }>(`/agents/${agentId}`, 'DELETE', apiKey),
    PRIORITY.USER_ACTION
  );
}

export async function listModels(apiKey: string): Promise<string[]> {
  return requestQueue.enqueue(async () => {
    const data = await fetchWithResilience<{ models: string[] }>('/models', 'GET', apiKey);
    return data.models || [];
  }, PRIORITY.NORMAL);
}

// Fetch pushed_at timestamp from GitHub API for a repository
export async function fetchGitHubRepoInfo(owner: string, name: string): Promise<{ pushedAt: string } | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${name}`, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    return { pushedAt: data.pushed_at };
  } catch {
    return null;
  }
}

// Helper to construct GitHub URLs from repository string
export function parseRepository(repository: string): { owner: string; repo: string } | null {
  const parts = repository.split('/');
  if (parts.length >= 3 && parts[0].includes('github')) {
    return { owner: parts[1], repo: parts[2] };
  }
  if (parts.length >= 2) {
    return { owner: parts[0], repo: parts[1] };
  }
  return null;
}

export function getGitHubBranchCommitsUrl(repository: string, branchName: string): string | null {
  const parsed = parseRepository(repository);
  if (!parsed) return null;
  return `https://github.com/${parsed.owner}/${parsed.repo}/commits/${branchName}`;
}

export function getGitHubCompareUrl(repository: string, baseRef: string, branchName: string): string | null {
  const parsed = parseRepository(repository);
  if (!parsed) return null;
  return `https://github.com/${parsed.owner}/${parsed.repo}/compare/${baseRef}...${branchName}`;
}

// Re-export shared types so existing imports continue working
export * from './cursorTypes';
