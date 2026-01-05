import {
  Agent,
  ApiKeyInfo,
  AuthError,
  ConversationResponse,
  FollowUpParams,
  LaunchAgentParams,
  Message,
  RateLimitError,
  Repository,
  MalformedResponseError,
} from './cursorTypes';

export type MockFailureMode = 'none' | 'rate-limit' | 'network' | 'slow' | 'auth' | 'malformed';

interface MockConfig {
  mode: MockFailureMode;
  latencyMs: number;
  retryAfterMs?: number;
  once?: boolean; // reset mode to none after the next request
}

const DEFAULT_CONFIG: MockConfig = {
  mode: 'none',
  latencyMs: 250,
  retryAfterMs: 1200,
  once: false,
};

const DEFAULT_USER: ApiKeyInfo = {
  apiKeyName: 'mock-key',
  createdAt: new Date().toISOString(),
  userEmail: 'mock@cursor.dev',
};

const DEFAULT_REPOS: Repository[] = [
  { owner: 'cursor-ai', name: 'cursor-web', repository: 'github.com/cursor-ai/cursor-web', pushedAt: undefined },
  { owner: 'cursor-ai', name: 'cursor-server', repository: 'github.com/cursor-ai/cursor-server', pushedAt: undefined },
  { owner: 'acme', name: 'design-system', repository: 'github.com/acme/design-system', pushedAt: undefined },
] as Repository[];

interface MockState {
  config: MockConfig;
  agents: Agent[];
  conversations: Record<string, Message[]>;
}

const state: MockState = {
  config: { ...DEFAULT_CONFIG },
  agents: [],
  conversations: {},
};

function nowIso() {
  return new Date().toISOString();
}

function buildAgent(partial: Partial<Agent>): Agent {
  return {
    id: `mock-${Math.random().toString(36).slice(2, 10)}`,
    name: 'Mock agent task',
    status: 'RUNNING',
    source: { repository: 'github.com/cursor-ai/cursor-web', ref: 'main' },
    target: {
      branchName: 'mock-branch',
      url: 'https://cursor.com/mock',
      autoCreatePr: true,
      openAsCursorGithubApp: false,
      skipReviewerRequest: false,
    },
    createdAt: nowIso(),
    ...partial,
  };
}

// Seed a couple of agents for list view
state.agents = [
  buildAgent({
    id: 'mock-1',
    name: 'Fix flaky tests in cursor-web',
    status: 'FINISHED',
    target: {
      branchName: 'mock-fix-tests',
      url: 'https://cursor.com/mock/fix-tests',
      prUrl: 'https://github.com/cursor-ai/cursor-web/pull/123',
      autoCreatePr: true,
      openAsCursorGithubApp: false,
      skipReviewerRequest: false,
      commitSha: 'abcdef123',
      commitUrl: 'https://github.com/cursor-ai/cursor-web/commit/abcdef123',
    },
    summary: 'Stabilized flaky e2e by waiting for websocket ready signal.',
    createdAt: nowIso(),
  }),
  buildAgent({
    id: 'mock-2',
    name: 'Implement onboarding improvements',
    status: 'RUNNING',
    target: {
      branchName: 'mock-onboarding',
      url: 'https://cursor.com/mock/onboarding',
      autoCreatePr: true,
      openAsCursorGithubApp: false,
      skipReviewerRequest: false,
    },
    createdAt: nowIso(),
  }),
];

state.conversations['mock-1'] = [
  { id: 'u-1', type: 'user_message', text: 'Please fix flaky tests in e2e suite.' },
  { id: 'a-1', type: 'assistant_message', text: 'Identified race in websocket init; adding readiness check.' },
  { id: 'a-2', type: 'assistant_message', text: 'Pushed changes to mock-fix-tests and opened PR #123.' },
];

state.conversations['mock-2'] = [
  { id: 'u-2', type: 'user_message', text: 'Improve onboarding copy and reduce steps.' },
  { id: 'a-3', type: 'assistant_message', text: 'Reviewing current onboarding flows and metrics.' },
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldUseMock(): boolean {
  return process.env.NEXT_PUBLIC_MOCK_API === 'true';
}

function getConfig(): MockConfig {
  if (typeof window !== 'undefined' && (window as unknown as { __cursorMockConfig?: MockConfig }).__cursorMockConfig) {
    return (window as unknown as { __cursorMockConfig: MockConfig }).__cursorMockConfig;
  }
  return state.config;
}

function setConfig(cfg: Partial<MockConfig>) {
  state.config = { ...state.config, ...cfg };
  if (typeof window !== 'undefined') {
    (window as unknown as { __cursorMockConfig: MockConfig }).__cursorMockConfig = state.config;
  }
}

function resetConfig() {
  setConfig({ ...DEFAULT_CONFIG });
}

export async function withMockMode<T>(mode: MockFailureMode, fn: () => Promise<T>): Promise<T> {
  const prev = { ...state.config };
  setConfig({ mode, once: true });
  try {
    return await fn();
  } finally {
    state.config = prev;
  }
}

async function maybeFail(endpoint: string) {
  const cfg = getConfig();

  // Always apply latency, even for failures
  await sleep(cfg.latencyMs);

  switch (cfg.mode) {
    case 'rate-limit': {
      const err = new RateLimitError(`Mock rate limit on ${endpoint}`, cfg.retryAfterMs);
      if (cfg.once) resetConfig();
      throw err;
    }
    case 'network': {
      const err = new Error(`Mock network error on ${endpoint}`);
      if (cfg.once) resetConfig();
      throw err;
    }
    case 'auth': {
      const err = new AuthError('Mock auth failure');
      if (cfg.once) resetConfig();
      throw err;
    }
    case 'malformed': {
      const err = new MalformedResponseError(`Mock malformed JSON for ${endpoint}`);
      if (cfg.once) resetConfig();
      throw err;
    }
    case 'slow': {
      // Already delayed via latency; proceed
      break;
    }
    case 'none':
    default:
      break;
  }

  if (cfg.once) {
    resetConfig();
  }
}

async function respond<T>(endpoint: string, data: T): Promise<T> {
  await maybeFail(endpoint);
  return data;
}

function ensureAgent(agentId: string): Agent {
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }
  return agent;
}

// -------------------------
// Public mock API surface
// -------------------------

export function isMockApiEnabled(): boolean {
  return shouldUseMock();
}

export const mockCursorApi = {
  setConfig,
  resetConfig,
  getConfig,
  withMockMode,

  async validateApiKey(apiKey?: string): Promise<ApiKeyInfo> {
    void apiKey;
    return respond('validateApiKey', DEFAULT_USER);
  },

  async listRepositories(apiKey?: string): Promise<Repository[]> {
    void apiKey;
    return respond('listRepositories', DEFAULT_REPOS);
  },

  async listAgents(apiKey: string, limit = 20): Promise<Agent[]> {
    void apiKey;
    const agents = state.agents.slice(0, limit);
    return respond('listAgents', agents);
  },

  async getAgentStatus(apiKey: string, agentId: string): Promise<Agent> {
    void apiKey;
    const agent = ensureAgent(agentId);
    return respond('getAgentStatus', agent);
  },

  async getAgentConversation(apiKey: string, agentId: string): Promise<ConversationResponse> {
    void apiKey;
    const agent = ensureAgent(agentId);
    const messages = state.conversations[agent.id] || [];
    const response: ConversationResponse = {
      id: agent.id,
      messages,
    };
    return respond('getAgentConversation', response);
  },

  async launchAgent(apiKey: string, params: LaunchAgentParams): Promise<Agent> {
    void apiKey;
    const agent = buildAgent({
      name: params.prompt?.text
        ? params.prompt.text.slice(0, 80)
        : 'New mock agent',
      source: {
        repository: params.source.repository,
        ref: params.source.ref || 'main',
      },
      target: {
        branchName: params.target?.branchName || `mock-${Date.now()}`,
        url: 'https://cursor.com/mock/launch',
        autoCreatePr: params.target?.autoCreatePr ?? true,
        openAsCursorGithubApp: false,
        skipReviewerRequest: false,
      },
      status: 'RUNNING',
    });

    state.agents = [agent, ...state.agents];
    state.conversations[agent.id] = [
      { id: `${agent.id}-u`, type: 'user_message', text: params.prompt?.text || 'Do the thing' },
      { id: `${agent.id}-a`, type: 'assistant_message', text: 'Starting work in mock environment...' },
    ];

    // Simulate completion after a short delay
    setTimeout(() => {
      const targetAgent = ensureAgent(agent.id);
      targetAgent.status = 'FINISHED';
      targetAgent.summary = 'Completed mock task successfully.';
      targetAgent.target.prUrl = `https://github.com/${targetAgent.source.repository.replace(
        /^github\.com\//,
        ''
      )}/pull/1`;
      state.conversations[agent.id].push({
        id: `${agent.id}-a-finish`,
        type: 'assistant_message',
        text: 'All done! Check the mock PR for details.',
      });
    }, 800);

    return respond('launchAgent', agent);
  },

  async addFollowUp(apiKey: string, agentId: string, params: FollowUpParams): Promise<{ id: string }> {
    void apiKey;
    const agent = ensureAgent(agentId);
    const id = `${agentId}-follow-${Date.now()}`;
    const convo = state.conversations[agent.id] || [];
    convo.push({ id: `${id}-u`, type: 'user_message', text: params.prompt?.text || '' });
    convo.push({ id: `${id}-a`, type: 'assistant_message', text: 'Acknowledged follow-up (mock).' });
    state.conversations[agent.id] = convo;
    agent.status = 'RUNNING';
    return respond('addFollowUp', { id });
  },

  async stopAgent(apiKey: string, agentId: string): Promise<{ id: string }> {
    void apiKey;
    const agent = ensureAgent(agentId);
    agent.status = 'STOPPED';
    return respond('stopAgent', { id: agentId });
  },

  async deleteAgent(apiKey: string, agentId: string): Promise<{ id: string }> {
    void apiKey;
    state.agents = state.agents.filter((a) => a.id !== agentId);
    delete state.conversations[agentId];
    return respond('deleteAgent', { id: agentId });
  },

  async listModels(apiKey?: string): Promise<string[]> {
    void apiKey;
    return respond('listModels', ['composer-1', 'opus-4.5', 'gpt-5.2', 'claude-4.5-sonnet']);
  },

  async fetchGitHubRepoInfo(owner?: string, name?: string): Promise<{ pushedAt: string } | null> {
    void owner;
    void name;
    return respond('fetchGitHubRepoInfo', {
      pushedAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    });
  },
};

// Expose controls for manual testing in the browser console
if (typeof window !== 'undefined') {
  (window as unknown as { __cursorMock?: unknown }).__cursorMock = {
    setConfig,
    resetConfig,
    getConfig,
  };
}
