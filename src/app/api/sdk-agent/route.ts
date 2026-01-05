// API route for SDK agent sessions
// The @cursor-ai/january package must run server-side only
// Uses onDelta for maximum granularity - every token, every tool call in real-time

import { NextRequest } from 'next/server';
import { CursorAgent } from '@cursor-ai/january';
import { isMockApiEnabled } from '@/lib/mockApi';

const encoder = new TextEncoder();

function streamUpdates(updates: Array<() => unknown>, intervalMs = 250): ReadableStream<Uint8Array> {
  let isClosed = false;
  return new ReadableStream({
    start(controller) {
      let idx = 0;
      const send = () => {
        if (isClosed || idx >= updates.length) {
          controller.close();
          return;
        }
        const payload = updates[idx++]();
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        setTimeout(send, intervalMs);
      };
      send();
    },
    cancel() {
      isClosed = true;
    },
  });
}

export async function POST(request: NextRequest) {
  let body: { apiKey?: string; model?: string; repository?: string; ref?: string; message?: string };

  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { apiKey, model, repository, ref, message } = body;

  if (!apiKey || !repository || !message) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: apiKey, repository, message' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Mock mode: emit deterministic stream without hitting Cursor SDK
  if (isMockApiEnabled()) {
    const updates = [
      () => ({ type: 'thinking-delta', text: 'Booting mock SDK agent...' }),
      () => ({ type: 'tool-call-started', toolCall: { type: 'shell', args: { command: 'echo "mock"' } } }),
      () => ({ type: 'tool-call-completed', toolCall: { type: 'shell', result: { status: 'ok', value: { exitCode: 0 } } } }),
      () => ({ type: 'text-delta', text: `Plan: ${message.slice(0, 60)}` }),
      () => ({ type: 'text-delta', text: 'Result: completed in mock mode.' }),
      () => ({ type: 'done' }),
    ];

    return new Response(streamUpdates(updates, 180), {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  }

  try {
    const agent = new CursorAgent({
      apiKey,
      model: model || 'claude-4.5-sonnet',
      workingLocation: {
        type: 'github',
        repository,
        ref: ref || 'main',
      },
    });

    // Create a readable stream for the response
    const updateQueue: string[] = [];
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
    let isStreamClosed = false;

    const flushQueue = () => {
      if (!streamController || isStreamClosed) return;
      while (updateQueue.length > 0) {
        const data = updateQueue.shift();
        if (data) {
          streamController.enqueue(encoder.encode(`data: ${data}\n\n`));
        }
      }
    };

    const sendUpdate = (update: unknown) => {
      if (isStreamClosed) return;
      const data = JSON.stringify(update);
      updateQueue.push(data);
      flushQueue();
    };

    const stream = new ReadableStream({
      start(controller) {
        streamController = controller;

        // Start the agent with granular callbacks
        const { stream: agentStream } = agent.submit({
          message,
          // onDelta fires for EVERY update - text tokens, tool calls, etc.
          onDelta: async ({ update }) => {
            sendUpdate(update);
          },
          // onStep fires when a complete step finishes
          onStep: async ({ step }) => {
            sendUpdate({ type: 'step-complete', step });
          },
        });

        // Consume the stream to keep it running and handle completion
        (async () => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            for await (const _ of agentStream) {
              // Updates already sent via onDelta
            }
            // Signal completion
            sendUpdate({ type: 'done' });
          } catch (err) {
            const error = err instanceof Error ? err.message : 'Unknown error';
            sendUpdate({ type: 'error', error });
          } finally {
            isStreamClosed = true;
            controller.close();
          }
        })();
      },
      cancel() {
        isStreamClosed = true;
        agent.abort();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    console.error('SDK Agent Error:', err);

    let error = 'Failed to create agent';
    let details = '';
    let status = 500;

    if (err instanceof Error) {
      error = err.message;

      if (error.includes('503')) {
        error = 'Cursor SDK service unavailable';
        details = 'The SDK may require feature flag access from Cursor team, or the service is temporarily down.';
        status = 503;
      } else if (error.includes('401') || error.includes('403')) {
        error = 'Authentication failed';
        details = 'Check that your API key is valid and has SDK access enabled.';
        status = 401;
      } else if (error.includes('429')) {
        error = 'Rate limited';
        details = 'Too many requests. Please wait a moment and try again.';
        status = 429;
      }
    }

    return new Response(JSON.stringify({ error, details }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
