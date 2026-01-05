// Cursor Cloud Agents API client
// Uses Basic Auth with the API key as username and empty password

const CURSOR_API_BASE = 'https://api.cursor.com/v0';
const USE_MOCK = import.meta.env.VITE_MOCK_CURSOR_API === 'true' || !import.meta.env.VITE_MOCK_CURSOR_API;
const MOCK_LATENCY_MS = Number(import.meta.env.VITE_MOCK_LATENCY_MS ?? 200);

function getUrl(path: string): string {
  return `${CURSOR_API_BASE}${path}`;
}

function buildHeaders(apiKey: string, includeContentType = false): HeadersInit {
  const headers: HeadersInit = {
    Authorization: `Basic ${btoa(`${apiKey}:`)}`,
  };

  if (includeContentType) {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
}

// Types based on Cursor API documentation

export interface ApiKeyInfo {
  apiKeyName: string;
  createdAt: string;
  userEmail: string;
}

export interface Repository {
  owner: string;
  name: string;
  repository: string;
}

export interface Agent {
  id: string;
  name: string;
  status: 'CREATING' | 'RUNNING' | 'FINISHED' | 'STOPPED' | 'ERROR';
  source: {
    repository: string; // Format: "github.com/owner/repo-name"
    ref: string;
  };
  target: {
    branchName: string;
    url: string;
    prUrl?: string;
    autoCreatePr: boolean;
    openAsCursorGithubApp: boolean;
    skipReviewerRequest: boolean;
    // Additional commit info that the API may return
    commitSha?: string;
    commitUrl?: string;
  };
  summary?: string;
  createdAt: string;
}

// Helper to construct GitHub URLs from repository string
export function parseRepository(repository: string): { owner: string; repo: string } | null {
  // Repository format is "github.com/owner/repo" or "owner/repo"
  const parts = repository.split('/');
  if (parts.length >= 3 && parts[0].includes('github')) {
    // Format: "github.com/owner/repo"
    return { owner: parts[1], repo: parts[2] };
  }
  if (parts.length >= 2) {
    // Format: "owner/repo"
    return { owner: parts[0], repo: parts[1] };
  }
  return null;
}

// Construct GitHub commit URL for a branch (shows recent commits)
export function getGitHubBranchCommitsUrl(repository: string, branchName: string): string | null {
  const parsed = parseRepository(repository);
  if (!parsed) return null;
  return `https://github.com/${parsed.owner}/${parsed.repo}/commits/${branchName}`;
}

// Construct GitHub compare URL to see what changed
export function getGitHubCompareUrl(repository: string, baseRef: string, branchName: string): string | null {
  const parsed = parseRepository(repository);
  if (!parsed) return null;
  return `https://github.com/${parsed.owner}/${parsed.repo}/compare/${baseRef}...${branchName}`;
}

export interface Message {
  id: string;
  type: 'user_message' | 'assistant_message';
  text: string;
}

export interface ConversationResponse {
  id: string;
  messages: Message[];
}

export interface LaunchAgentParams {
  prompt: {
    text: string;
    images?: Array<{ data: string; dimension: { width: number; height: number } }>;
  };
  source: {
    repository: string;
    ref?: string;
  };
  target?: {
    autoCreatePr?: boolean;
    branchName?: string;
  };
  model?: string;
}

export interface FollowUpParams {
  prompt: {
    text: string;
    images?: Array<{ data: string; dimension: { width: number; height: number } }>;
  };
}

// API functions
async function mockDelay(ms = MOCK_LATENCY_MS): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeMockAgent(id: string, name: string, status: Agent['status'] = 'RUNNING'): Agent {
  return {
    id,
    name,
    status,
    source: { repository: 'github.com/cursor-ai/example-repo', ref: 'main' },
    target: {
      branchName: 'cursor/mock-branch',
      url: 'https://github.com/cursor-ai/example-repo/pull/1',
      autoCreatePr: true,
      openAsCursorGithubApp: false,
      skipReviewerRequest: false,
    },
    summary: status === 'FINISHED' ? 'Completed mock task successfully.' : undefined,
    createdAt: new Date().toISOString(),
  };
}

function makeMockConversation(agentId: string): ConversationResponse {
  return {
    id: agentId,
    messages: [
      { id: `${agentId}-u1`, type: 'user_message', text: 'Fix the build in the repo.' },
      { id: `${agentId}-a1`, type: 'assistant_message', text: 'Working on the build fix now.' },
      { id: `${agentId}-a2`, type: 'assistant_message', text: 'Resolved dependency issue and updated lockfile.' },
    ],
  };
}

export async function validateApiKey(apiKey: string): Promise<ApiKeyInfo> {
  if (USE_MOCK) {
    await mockDelay();
    return {
      apiKeyName: 'mock-key',
      createdAt: new Date().toISOString(),
      userEmail: 'mock@cursor.com',
    };
  }

  const res = await fetch(getUrl('/me'), {
    method: 'GET',
    headers: buildHeaders(apiKey),
  });
  
  if (!res.ok) {
    // Only throw AuthError for actual authentication failures
    if (res.status === 401 || res.status === 403) {
      throw new AuthError(`Invalid API key: ${res.status}`);
    }
    // Other errors (500, 429, etc.) are transient - throw generic error
    throw new Error(`Validation failed: ${res.status}`);
  }
  
  return res.json();
}

export class RateLimitError extends Error {
  constructor(message = 'Rate limited - please wait') {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class AuthError extends Error {
  constructor(message = 'Invalid or expired API key') {
    super(message);
    this.name = 'AuthError';
  }
}

export async function listRepositories(apiKey: string): Promise<Repository[]> {
  if (USE_MOCK) {
    await mockDelay();
    return [
      { owner: 'cursor-ai', name: 'example-repo', repository: 'github.com/cursor-ai/example-repo' },
      { owner: 'cursor-ai', name: 'desktop-app', repository: 'github.com/cursor-ai/desktop-app' },
    ];
  }

  const res = await fetch(getUrl('/repositories'), {
    method: 'GET',
    headers: buildHeaders(apiKey),
  });
  
  if (!res.ok) {
    if (res.status === 429) {
      throw new RateLimitError('Rate limited - please try again later');
    }
    throw new Error(`Failed to fetch repositories: ${res.status}`);
  }
  
  const data = await res.json();
  return data.repositories || [];
}

export async function listAgents(apiKey: string, limit = 20): Promise<Agent[]> {
  if (USE_MOCK) {
    await mockDelay();
    return [
      makeMockAgent('agent-1', 'Investigate failing tests', 'FINISHED'),
      makeMockAgent('agent-2', 'Upgrade dependencies', 'RUNNING'),
    ].slice(0, limit);
  }

  const res = await fetch(getUrl(`/agents?limit=${limit}`), {
    method: 'GET',
    headers: buildHeaders(apiKey),
  });
  
  if (!res.ok) {
    throw new Error(`Failed to fetch agents: ${res.status}`);
  }
  
  const data = await res.json();
  return data.agents || [];
}

export async function getAgentStatus(apiKey: string, agentId: string): Promise<Agent> {
  if (USE_MOCK) {
    await mockDelay();
    return makeMockAgent(agentId, 'Mock agent status', 'RUNNING');
  }

  const res = await fetch(getUrl(`/agents/${agentId}`), {
    method: 'GET',
    headers: buildHeaders(apiKey),
  });
  
  if (!res.ok) {
    if (res.status === 429) {
      throw new Error('Rate limited - please wait');
    }
    throw new Error(`Failed to fetch agent status: ${res.status}`);
  }
  
  return res.json();
}

export async function getAgentConversation(apiKey: string, agentId: string): Promise<ConversationResponse> {
  if (USE_MOCK) {
    await mockDelay();
    return makeMockConversation(agentId);
  }

  const res = await fetch(getUrl(`/agents/${agentId}/conversation`), {
    method: 'GET',
    headers: buildHeaders(apiKey),
  });
  
  if (!res.ok) {
    if (res.status === 429) {
      throw new Error('Rate limited - please wait');
    }
    throw new Error(`Failed to fetch conversation: ${res.status}`);
  }
  
  return res.json();
}

export async function launchAgent(apiKey: string, params: LaunchAgentParams): Promise<Agent> {
  if (USE_MOCK) {
    await mockDelay();
    return makeMockAgent(`agent-${Date.now()}`, params.prompt.text.slice(0, 40) || 'New mock agent', 'RUNNING');
  }

  const res = await fetch(getUrl('/agents'), {
    method: 'POST',
    headers: buildHeaders(apiKey, true),
    body: JSON.stringify(params),
  });
  
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to launch agent: ${res.status} - ${text}`);
  }
  
  return res.json();
}

export async function addFollowUp(apiKey: string, agentId: string, params: FollowUpParams): Promise<{ id: string }> {
  if (USE_MOCK) {
    await mockDelay();
    return { id: `${agentId}-followup-${Date.now()}` };
  }

  const res = await fetch(getUrl(`/agents/${agentId}/followup`), {
    method: 'POST',
    headers: buildHeaders(apiKey, true),
    body: JSON.stringify(params),
  });
  
  if (!res.ok) {
    throw new Error(`Failed to add follow-up: ${res.status}`);
  }
  
  return res.json();
}

export async function stopAgent(apiKey: string, agentId: string): Promise<{ id: string }> {
  if (USE_MOCK) {
    await mockDelay();
    return { id: agentId };
  }

  const res = await fetch(getUrl(`/agents/${agentId}/stop`), {
    method: 'POST',
    headers: buildHeaders(apiKey),
  });
  
  if (!res.ok) {
    throw new Error(`Failed to stop agent: ${res.status}`);
  }
  
  return res.json();
}

export async function deleteAgent(apiKey: string, agentId: string): Promise<{ id: string }> {
  if (USE_MOCK) {
    await mockDelay();
    return { id: agentId };
  }

  const res = await fetch(getUrl(`/agents/${agentId}`), {
    method: 'DELETE',
    headers: buildHeaders(apiKey),
  });
  
  if (!res.ok) {
    throw new Error(`Failed to delete agent: ${res.status}`);
  }
  
  return res.json();
}

export async function listModels(apiKey: string): Promise<string[]> {
  if (USE_MOCK) {
    await mockDelay();
    return ['composer-1', 'opus-4.5', 'gpt-5.2'];
  }

  const res = await fetch(getUrl('/models'), {
    method: 'GET',
    headers: buildHeaders(apiKey),
  });
  
  if (!res.ok) {
    throw new Error(`Failed to fetch models: ${res.status}`);
  }
  
  const data = await res.json();
  return data.models || [];
}

// Fetch pushed_at timestamp from GitHub API for a repository
export async function fetchGitHubRepoInfo(owner: string, name: string): Promise<{ pushedAt: string } | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${name}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
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
