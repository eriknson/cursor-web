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

