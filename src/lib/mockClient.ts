// Mock-aware client - wraps cursorClient functions to use mock API when in mock mode
// This is used by the /mocked route

import { mockCursorApi } from './mockApi';
import {
  ApiKeyInfo,
  Repository,
  Agent,
  ConversationResponse,
  LaunchAgentParams,
  FollowUpParams,
} from './cursorTypes';

// Re-export everything from cursorClient for types and utils
export * from './cursorClient';

// Mock-aware API functions
export function createMockClient() {
  return {
    async validateApiKey(): Promise<ApiKeyInfo> {
      return mockCursorApi.validateApiKey();
    },

    async listRepositories(): Promise<Repository[]> {
      return mockCursorApi.listRepositories();
    },

    async listAgents(limit = 20): Promise<Agent[]> {
      return mockCursorApi.listAgents(limit);
    },

    async getAgentStatus(agentId: string): Promise<Agent> {
      return mockCursorApi.getAgentStatus(agentId);
    },

    async getAgentConversation(agentId: string): Promise<ConversationResponse> {
      return mockCursorApi.getAgentConversation(agentId);
    },

    async launchAgent(params: LaunchAgentParams): Promise<Agent> {
      return mockCursorApi.launchAgent(params);
    },

    async addFollowUp(agentId: string, params: FollowUpParams): Promise<{ id: string }> {
      return mockCursorApi.addFollowUp(agentId, params);
    },

    async stopAgent(agentId: string): Promise<{ id: string }> {
      return mockCursorApi.stopAgent(agentId);
    },

    async deleteAgent(agentId: string): Promise<{ id: string }> {
      return mockCursorApi.deleteAgent(agentId);
    },

    async listModels(): Promise<string[]> {
      return mockCursorApi.listModels();
    },

    async fetchGitHubRepoInfo(): Promise<{ pushedAt: string } | null> {
      return mockCursorApi.fetchGitHubRepoInfo();
    },
  };
}
