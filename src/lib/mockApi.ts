// Mock API layer for testing without real credentials
// Access via /mocked route - completely isolated from production code paths

import {
  Agent,
  ApiKeyInfo,
  ConversationResponse,
  FollowUpParams,
  LaunchAgentParams,
  Message,
  Repository,
} from './cursorTypes';

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

// Mock state - in-memory storage for the session
interface MockState {
  agents: Agent[];
  conversations: Record<string, Message[]>;
}

const state: MockState = {
  agents: [],
  conversations: {},
};

// Initialize with sample data
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

const DEFAULT_REPOS: Repository[] = [
  { owner: 'cursor-ai', name: 'cursor-web', repository: 'github.com/cursor-ai/cursor-web' },
  { owner: 'cursor-ai', name: 'cursor-server', repository: 'github.com/cursor-ai/cursor-server' },
  { owner: 'acme', name: 'design-system', repository: 'github.com/acme/design-system' },
];

const DEFAULT_USER: ApiKeyInfo = {
  apiKeyName: 'mock-key',
  createdAt: new Date().toISOString(),
  userEmail: 'demo@cursor.dev',
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureAgent(agentId: string): Agent {
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }
  return agent;
}

// Simulated latency for realism
const MOCK_LATENCY_MS = 200;

// -------------------------
// Public mock API surface
// -------------------------

export const mockCursorApi = {
  async validateApiKey(): Promise<ApiKeyInfo> {
    await sleep(MOCK_LATENCY_MS);
    return DEFAULT_USER;
  },

  async listRepositories(): Promise<Repository[]> {
    await sleep(MOCK_LATENCY_MS);
    return DEFAULT_REPOS;
  },

  async listAgents(limit = 20): Promise<Agent[]> {
    await sleep(MOCK_LATENCY_MS);
    return state.agents.slice(0, limit);
  },

  async getAgentStatus(agentId: string): Promise<Agent> {
    await sleep(MOCK_LATENCY_MS);
    return ensureAgent(agentId);
  },

  async getAgentConversation(agentId: string): Promise<ConversationResponse> {
    await sleep(MOCK_LATENCY_MS);
    const agent = ensureAgent(agentId);
    const messages = state.conversations[agent.id] || [];
    return {
      id: agent.id,
      messages,
    };
  },

  async launchAgent(params: LaunchAgentParams): Promise<Agent> {
    await sleep(MOCK_LATENCY_MS * 2);
    
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

    // Simulate completion after a delay
    setTimeout(() => {
      const targetAgent = state.agents.find(a => a.id === agent.id);
      if (targetAgent) {
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
      }
    }, 3000);

    return agent;
  },

  async addFollowUp(agentId: string, params: FollowUpParams): Promise<{ id: string }> {
    await sleep(MOCK_LATENCY_MS);
    const agent = ensureAgent(agentId);
    const id = `${agentId}-follow-${Date.now()}`;
    const convo = state.conversations[agent.id] || [];
    convo.push({ id: `${id}-u`, type: 'user_message', text: params.prompt?.text || '' });
    convo.push({ id: `${id}-a`, type: 'assistant_message', text: 'Acknowledged follow-up (mock).' });
    state.conversations[agent.id] = convo;
    agent.status = 'RUNNING';
    
    // Complete again after delay
    setTimeout(() => {
      agent.status = 'FINISHED';
    }, 2000);
    
    return { id };
  },

  async stopAgent(agentId: string): Promise<{ id: string }> {
    await sleep(MOCK_LATENCY_MS);
    const agent = ensureAgent(agentId);
    agent.status = 'STOPPED';
    return { id: agentId };
  },

  async deleteAgent(agentId: string): Promise<{ id: string }> {
    await sleep(MOCK_LATENCY_MS);
    state.agents = state.agents.filter((a) => a.id !== agentId);
    delete state.conversations[agentId];
    return { id: agentId };
  },

  async listModels(): Promise<string[]> {
    await sleep(MOCK_LATENCY_MS);
    return ['composer-1', 'opus-4.5', 'gpt-5.2', 'claude-4.5-sonnet'];
  },

  async fetchGitHubRepoInfo(): Promise<{ pushedAt: string } | null> {
    await sleep(MOCK_LATENCY_MS);
    return {
      pushedAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    };
  },
};
