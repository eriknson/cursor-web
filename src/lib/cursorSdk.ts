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
  config: SdkAgentConfig,
  message: string
): AsyncGenerator<AgentStep, void, unknown> {
  const response = await fetch('/api/sdk-agent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      apiKey: config.apiKey,
      model: config.model || 'claude-4.5-sonnet',
      repository: config.repository,
      ref: config.ref || 'main',
      message,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData.error || 'Failed to start SDK agent';
    const details = errorData.details ? `\n${errorData.details}` : '';
    throw new Error(`${message}${details}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        try {
          const update = JSON.parse(data) as Record<string, unknown>;

          if (update.type === 'done') {
            return;
          }

          if (update.type === 'error') {
            throw new Error(update.error as string);
          }

          // Parse the update into an AgentStep
          const step = parseUpdate(update);
          if (step) {
            yield step;
          }
        } catch (e) {
          // Skip malformed JSON
          if (e instanceof SyntaxError) continue;
          throw e;
        }
      }
    }
  }
}

// Parse SDK updates into AgentStep format
function parseUpdate(update: Record<string, unknown>): AgentStep | null {
  const timestamp = new Date();

  switch (update.type) {
    case 'text-delta':
      return {
        type: 'text',
        content: (update.text as string) || '',
        timestamp,
        isStreaming: true,
      };

    case 'thinking-delta':
      return {
        type: 'thinking',
        content: (update.text as string) || '',
        timestamp,
        isStreaming: true,
      };

    case 'thinking-completed':
      return {
        type: 'thinking',
        content: '',
        timestamp,
        isStreaming: false,
      };

    case 'tool-call-started': {
      const toolCall = update.toolCall as { type: string; args?: Record<string, unknown> } | undefined;
      if (!toolCall) return null;

      const content = formatToolStart(toolCall.type, toolCall.args);
      return {
        type: 'tool_start',
        content,
        timestamp,
        toolType: toolCall.type,
        toolArgs: toolCall.args,
      };
    }

    case 'tool-call-completed': {
      const toolCall = update.toolCall as { type: string; result?: unknown } | undefined;
      if (!toolCall) return null;

      const content = formatToolComplete(toolCall.type, toolCall.result);
      return {
        type: 'tool_complete',
        content,
        timestamp,
        toolType: toolCall.type,
      };
    }

    case 'shell-output-delta': {
      // Real-time shell output
      const output = (update.output as string) || '';
      return {
        type: 'tool_output',
        content: output,
        timestamp,
        toolType: 'shell',
        isStreaming: true,
      };
    }

    case 'step-complete': {
      const step = update.step as { type?: string } | undefined;
      return {
        type: 'step_complete',
        content: step?.type ? `Step completed: ${step.type}` : 'Step completed',
        timestamp,
      };
    }

    case 'user-message-appended':
      return {
        type: 'user_message',
        content: 'User message added',
        timestamp,
      };

    default:
      // For unknown types, just show the raw data for debugging
      return null;
  }
}

// Format tool start message
function formatToolStart(toolType: string, args?: Record<string, unknown>): string {
  switch (toolType) {
    case 'shell': {
      const command = args?.command as string | undefined;
      const workingDir = args?.workingDirectory as string | undefined;
      if (command) {
        const dir = workingDir ? ` (in ${workingDir})` : '';
        return `$ ${command}${dir}`;
      }
      return 'Running shell command...';
    }

    case 'read': {
      const path = args?.path as string | undefined;
      return path ? `Reading ${path}` : 'Reading file...';
    }

    case 'write': {
      const path = args?.path as string | undefined;
      return path ? `Writing ${path}` : 'Writing file...';
    }

    case 'edit': {
      const path = args?.path as string | undefined;
      return path ? `Editing ${path}` : 'Editing file...';
    }

    case 'delete': {
      const path = args?.path as string | undefined;
      return path ? `Deleting ${path}` : 'Deleting file...';
    }

    case 'glob': {
      const pattern = args?.pattern as string | undefined;
      return pattern ? `Searching for ${pattern}` : 'Searching files...';
    }

    case 'grep': {
      const pattern = args?.pattern as string | undefined;
      return pattern ? `Grep: ${pattern}` : 'Searching content...';
    }

    case 'ls': {
      const path = args?.path as string | undefined;
      return path ? `Listing ${path}` : 'Listing directory...';
    }

    case 'semSearch': {
      const query = args?.query as string | undefined;
      return query ? `Searching: "${query}"` : 'Semantic search...';
    }

    case 'createPlan':
      return 'Creating plan...';

    case 'updateTodos':
      return 'Updating todos...';

    case 'readLints':
      return 'Checking for lint errors...';

    case 'mcp': {
      const tool = args?.tool as string | undefined;
      return tool ? `MCP: ${tool}` : 'Running MCP tool...';
    }

    default:
      return `Running ${toolType}...`;
  }
}

// Format tool completion message
function formatToolComplete(toolType: string, result?: unknown): string {
  const resultObj = result as { status?: string; value?: unknown } | undefined;
  const status = resultObj?.status;

  if (status === 'error') {
    return `✗ ${toolType} failed`;
  }

  switch (toolType) {
    case 'shell': {
      const value = resultObj?.value as { exitCode?: number } | undefined;
      const exitCode = value?.exitCode;
      if (exitCode === 0) {
        return `✓ Command completed`;
      }
      return `✓ Command exited (${exitCode})`;
    }

    case 'read':
      return '✓ File read';

    case 'write':
      return '✓ File written';

    case 'edit':
      return '✓ File edited';

    case 'delete':
      return '✓ File deleted';

    case 'glob':
    case 'grep':
    case 'ls':
    case 'semSearch':
      return '✓ Search complete';

    default:
      return `✓ ${toolType} complete`;
  }
}

// Get available models for SDK agents
export const SDK_MODELS = [
  'claude-4.5-sonnet',
  'gpt-4.1',
  'claude-4-opus',
  'gemini-2.5-pro',
] as const;

export type SdkModel = (typeof SDK_MODELS)[number];
