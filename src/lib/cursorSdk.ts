// Cursor SDK client - calls the server-side API route
// The @cursor-ai/january package runs on the server, we stream results back
// Uses onDelta for maximum granularity - every token, every tool call in real-time

export interface SdkAgentConfig {
  apiKey: string;
  model?: string;
  repository: string;
  ref?: string;
}

export type AgentStepType =
  | 'text'
  | 'thinking'
  | 'tool_start'
  | 'tool_complete'
  | 'tool_output'
  | 'step_complete'
  | 'user_message'
  | 'error'
  | 'done';

export interface AgentStep {
  type: AgentStepType;
  content: string;
  timestamp: Date;
  // Additional metadata for tool calls
  toolType?: string;
  toolArgs?: Record<string, unknown>;
  isStreaming?: boolean;
}

// Submit a prompt and stream the response from the SDK agent
export async function* streamSdkAgent(
  _config: SdkAgentConfig,
  _message: string
): AsyncGenerator<AgentStep, void, unknown> {
  yield {
    type: 'error',
    content: 'SDK mode is not available in the current build.',
    timestamp: new Date(),
  };
}

// Other helpers retained for potential future SDK implementation.

// Get available models for SDK agents
export const SDK_MODELS = [
  'claude-4.5-sonnet',
  'gpt-4.1',
  'claude-4-opus',
  'gemini-2.5-pro',
] as const;

export type SdkModel = (typeof SDK_MODELS)[number];
