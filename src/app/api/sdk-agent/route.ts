// API route for SDK agent sessions
// The @cursor-ai/january package must run server-side only
// Uses onDelta for maximum granularity - every token, every tool call in real-time

import { NextRequest } from 'next/server';
import { CursorAgent } from '@cursor-ai/january';

export async function POST(request: NextRequest) {
  const { apiKey, model, repository, ref, message } = await request.json();

  if (!apiKey || !repository || !message) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: apiKey, repository, message' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
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
    const encoder = new TextEncoder();
    
    // Use a queue to handle async updates
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
    
    if (err instanceof Error) {
      error = err.message;
      
      // Check for common issues
      if (error.includes('503')) {
        error = 'Cursor SDK service unavailable';
        details = 'The SDK may require feature flag access from Cursor team, or the service is temporarily down.';
      } else if (error.includes('401') || error.includes('403')) {
        error = 'Authentication failed';
        details = 'Check that your API key is valid and has SDK access enabled.';
      } else if (error.includes('429')) {
        error = 'Rate limited';
        details = 'Too many requests. Please wait a moment and try again.';
      }
    }
    
    return new Response(JSON.stringify({ error, details }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
