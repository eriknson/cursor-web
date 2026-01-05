// Shared Cursor API types and error classes

export interface ApiKeyInfo {
  apiKeyName: string;
  createdAt: string;
  userEmail: string;
}

export interface Repository {
  owner: string;
  name: string;
  repository: string;
  pushedAt?: string;
}

// Agent status values per Cursor API documentation
// EXPIRED is documented, STOPPED may also be returned when manually stopped
export type AgentStatus = 'CREATING' | 'RUNNING' | 'FINISHED' | 'ERROR' | 'EXPIRED' | 'STOPPED';

export interface Agent {
  id: string;
  name: string;
  status: AgentStatus;
  source: {
    repository: string; // Format: "github.com/owner/repo-name"
    ref: string;
  };
  target: {
    branchName: string;
    url: string;
    prUrl?: string;
    autoCreatePr: boolean;
  };
  summary?: string;
  createdAt: string;
  model?: string; // Model that worked on this agent (e.g., "Composer 1")
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

export class RateLimitError extends Error {
  retryAfterMs?: number;

  constructor(message = 'Rate limited - please wait', retryAfterMs?: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

export class AuthError extends Error {
  constructor(message = 'Invalid or expired API key') {
    super(message);
    this.name = 'AuthError';
  }
}

export class MalformedResponseError extends Error {
  constructor(message = 'Malformed response from server') {
    super(message);
    this.name = 'MalformedResponseError';
  }
}
