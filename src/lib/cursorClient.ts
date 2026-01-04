// Cursor Cloud Agents API client
// Uses Basic Auth with the API key as username and empty password

const CURSOR_API_BASE = 'https://api.cursor.com/v0';

// Whether to use the proxy route (set to true if CORS blocks direct calls)
const USE_PROXY = true;

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
    // Pass API key in custom header for proxy to use
    headers['X-Cursor-Api-Key'] = apiKey;
  } else {
    // Direct calls use Basic Auth
    headers['Authorization'] = `Basic ${btoa(apiKey + ':')}`;
  }
  
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
    repository: string;
    ref: string;
  };
  target: {
    branchName: string;
    url: string;
    prUrl?: string;
    autoCreatePr: boolean;
    openAsCursorGithubApp: boolean;
    skipReviewerRequest: boolean;
  };
  summary?: string;
  createdAt: string;
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

export async function validateApiKey(apiKey: string): Promise<ApiKeyInfo> {
  const res = await fetch(getUrl('/me'), {
    method: 'GET',
    headers: buildHeaders(apiKey),
  });
  
  if (!res.ok) {
    throw new Error(`Invalid API key: ${res.status}`);
  }
  
  return res.json();
}

export class RateLimitError extends Error {
  constructor(message = 'Rate limited - please wait') {
    super(message);
    this.name = 'RateLimitError';
  }
}

export async function listRepositories(apiKey: string): Promise<Repository[]> {
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
