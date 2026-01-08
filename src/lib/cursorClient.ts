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

// Check if a URL is an actual preview deployment URL (not the Vercel dashboard)
function isPreviewDeploymentUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Vercel dashboard URLs are on vercel.com
    // Actual preview deployments are on *.vercel.app or custom domains
    if (parsed.hostname === 'vercel.com') {
      return false;
    }
    // Accept .vercel.app domains and any other domain (could be custom)
    return true;
  } catch {
    return false;
  }
}

// Fetch Vercel preview deployment URL from GitHub APIs
// Tries multiple approaches since Vercel's integration varies
export async function fetchVercelPreviewUrl(
  owner: string,
  repo: string,
  branchOrSha: string
): Promise<string | null> {
  try {
    // Approach 1: Try GitHub Deployments API (Vercel creates deployments here)
    // Don't filter by environment name since Vercel uses various formats like "Preview", "Preview – projectname", etc.
    const deploymentsUrl = `https://api.github.com/repos/${owner}/${repo}/deployments?ref=${encodeURIComponent(branchOrSha)}`;
    console.log('[Preview] Trying deployments API:', deploymentsUrl);
    
    const deploymentsRes = await fetch(deploymentsUrl, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });

    console.log('[Preview] Deployments response status:', deploymentsRes.status);

    if (deploymentsRes.ok) {
      const deployments = await deploymentsRes.json();
      console.log('[Preview] Deployments found:', deployments.length, deployments.map((d: { environment?: string; creator?: { login?: string } }) => ({ env: d.environment, creator: d.creator?.login })));
      
      if (Array.isArray(deployments) && deployments.length > 0) {
        // Find Vercel deployments - look for Preview environments or Vercel-created ones
        const vercelDeployment = deployments.find(
          (d: { environment?: string; creator?: { login?: string } }) =>
            d.environment?.toLowerCase().includes('preview') ||
            d.creator?.login === 'vercel[bot]'
        ) || deployments[0];

        console.log('[Preview] Selected deployment:', vercelDeployment.id, vercelDeployment.environment);

        // Get the deployment's statuses to find the environment_url
        const statusesRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/deployments/${vercelDeployment.id}/statuses`,
          {
            headers: { Accept: 'application/vnd.github.v3+json' },
          }
        );

        if (statusesRes.ok) {
          const statuses = await statusesRes.json();
          console.log('[Preview] Deployment statuses:', statuses.map((s: { state: string; environment_url?: string; log_url?: string }) => ({ state: s.state, env_url: s.environment_url, log_url: s.log_url })));
          
          if (Array.isArray(statuses)) {
            // Find success status with environment_url (the actual preview app URL)
            // environment_url is the preview app, log_url is the dashboard
            const statusWithUrl = statuses.find(
              (s: { state: string; environment_url?: string }) =>
                s.environment_url && 
                (s.state === 'success' || s.state === 'active') &&
                isPreviewDeploymentUrl(s.environment_url)
            );
            if (statusWithUrl?.environment_url) {
              console.log('[Preview] Found URL via deployments API:', statusWithUrl.environment_url);
              return statusWithUrl.environment_url;
            }
          }
        }
      }
    }

    // Approach 2: Try commit statuses API (Vercel also posts status checks here)
    // Note: target_url here is often the dashboard, not the preview - but check anyway
    console.log('[Preview] Trying commit statuses API...');
    const statusesRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(branchOrSha)}/statuses`,
      {
        headers: { Accept: 'application/vnd.github.v3+json' },
      }
    );

    if (statusesRes.ok) {
      const statuses = await statusesRes.json();
      console.log('[Preview] Commit statuses:', statuses.map((s: { context?: string; state?: string; target_url?: string }) => ({ context: s.context, state: s.state, url: s.target_url })));
      
      if (Array.isArray(statuses)) {
        // Look for Vercel status with a target_url that's a real preview (not dashboard)
        const vercelStatus = statuses.find(
          (s: { context?: string; target_url?: string; state?: string }) =>
            s.context?.toLowerCase().includes('vercel') &&
            s.target_url &&
            s.state === 'success' &&
            isPreviewDeploymentUrl(s.target_url)
        );
        if (vercelStatus?.target_url) {
          console.log('[Preview] Found URL via commit statuses:', vercelStatus.target_url);
          return vercelStatus.target_url;
        }
      }
    }

    // Approach 3: Try combined status (check runs) API
    // Note: details_url is typically the dashboard, so less likely to work
    console.log('[Preview] Trying check runs API...');
    const checkRunsRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(branchOrSha)}/check-runs`,
      {
        headers: { Accept: 'application/vnd.github.v3+json' },
      }
    );

    if (checkRunsRes.ok) {
      const checkRunsData = await checkRunsRes.json();
      console.log('[Preview] Check runs:', checkRunsData.check_runs?.map((c: { name?: string; app?: { slug?: string }; conclusion?: string; details_url?: string }) => ({ name: c.name, app: c.app?.slug, conclusion: c.conclusion, url: c.details_url })));
      
      if (checkRunsData.check_runs && Array.isArray(checkRunsData.check_runs)) {
        // Look for Vercel check run with details_url that's a real preview
        const vercelCheck = checkRunsData.check_runs.find(
          (c: { name?: string; app?: { slug?: string }; details_url?: string; conclusion?: string }) =>
            (c.name?.toLowerCase().includes('vercel') || c.app?.slug === 'vercel') &&
            c.details_url &&
            c.conclusion === 'success' &&
            isPreviewDeploymentUrl(c.details_url)
        );
        if (vercelCheck?.details_url) {
          console.log('[Preview] Found URL via check runs:', vercelCheck.details_url);
          return vercelCheck.details_url;
        }
      }
    }

    console.log('[Preview] No preview URL found via any method');
    return null;
  } catch (err) {
    console.error('[Preview] Error fetching preview URL:', err);
    return null;
  }
}

// Re-export shared types so existing imports continue working
export * from './cursorTypes';
