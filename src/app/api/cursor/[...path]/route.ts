import { NextRequest, NextResponse } from 'next/server';
import { isMockApiEnabled, mockCursorApi } from '@/lib/mockApi';
import { RateLimitError, AuthError, MalformedResponseError } from '@/lib/cursorTypes';

const CURSOR_API_BASE = 'https://api.cursor.com/v0';
const DEFAULT_TIMEOUT_MS = 15000;

type Method = 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, path, 'GET');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, path, 'POST');
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, path, 'DELETE');
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, path, 'PUT');
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, path, 'PATCH');
}

async function proxyRequest(
  request: NextRequest,
  pathSegments: string[],
  method: Method
): Promise<NextResponse> {
  const apiKey = request.headers.get('X-Cursor-Api-Key');

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Missing X-Cursor-Api-Key header' },
      { status: 401 }
    );
  }

  // Mock mode: route to in-memory mock API instead of external network
  if (isMockApiEnabled()) {
    try {
      const result = await handleMock(pathSegments, method, apiKey, request);
      return NextResponse.json(result.data, { status: result.status ?? 200 });
    } catch (err) {
      if (err instanceof RateLimitError) {
        return NextResponse.json({ error: err.message }, { status: 429 });
      }
      if (err instanceof AuthError) {
        return NextResponse.json({ error: err.message }, { status: 401 });
      }
      if (err instanceof MalformedResponseError) {
        return NextResponse.json({ error: err.message }, { status: 500 });
      }
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Mock error' }, { status: 500 });
    }
  }

  const path = '/' + pathSegments.join('/');
  const url = new URL(request.url);
  const queryString = url.search;
  const targetUrl = `${CURSOR_API_BASE}${path}${queryString}`;

  const headers: HeadersInit = {
    Authorization: `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
  };

  // Forward content-type if present
  const contentType = request.headers.get('Content-Type');
  if (contentType) {
    headers['Content-Type'] = contentType;
  }

  const fetchOptions: RequestInit = {
    method,
    headers,
  };

  // Forward body for non-GET requests
  if (method !== 'GET') {
    try {
      const body = await request.text();
      if (body) {
        fetchOptions.body = body;
      }
    } catch {
      // ignore
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  fetchOptions.signal = controller.signal;

  try {
    const response = await fetch(targetUrl, fetchOptions);
    const data = await response.text();
    clearTimeout(timeout);

    return new NextResponse(data, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
      },
    });
  } catch (error) {
    clearTimeout(timeout);
    console.error('Proxy error:', error);
    const isAbort = error instanceof DOMException && error.name === 'AbortError';
    return NextResponse.json(
      { error: isAbort ? 'Upstream request timed out' : 'Failed to proxy request to Cursor API' },
      { status: isAbort ? 504 : 500 }
    );
  }
}

async function handleMock(
  pathSegments: string[],
  method: Method,
  apiKey: string,
  request: NextRequest
): Promise<{ data: unknown; status?: number }> {
  const path = pathSegments.join('/');
  const bodyText = method === 'GET' ? null : await request.text().catch(() => null);
  let body: unknown = undefined;
  if (bodyText) {
    try {
      body = JSON.parse(bodyText);
    } catch {
      throw new MalformedResponseError('Invalid request payload');
    }
  }

  // GET routes
  if (method === 'GET' && path === 'me') {
    return { data: await mockCursorApi.validateApiKey(apiKey) };
  }
  if (method === 'GET' && path === 'repositories') {
    return { data: { repositories: await mockCursorApi.listRepositories(apiKey) } };
  }
  if (method === 'GET' && path.startsWith('agents')) {
    const parts = pathSegments;
    if (parts.length === 1) {
      const limit = new URL(request.url).searchParams.get('limit');
      return { data: { agents: await mockCursorApi.listAgents(apiKey, limit ? parseInt(limit, 10) : 20) } };
    }
    const agentId = parts[1];
    if (parts[2] === 'conversation') {
      return { data: await mockCursorApi.getAgentConversation(apiKey, agentId) };
    }
    return { data: await mockCursorApi.getAgentStatus(apiKey, agentId) };
  }

  if (method === 'GET' && path === 'models') {
    return { data: { models: await mockCursorApi.listModels(apiKey) } };
  }

  // POST routes
  if (method === 'POST' && path === 'agents') {
    return { data: await mockCursorApi.launchAgent(apiKey, body) };
  }
  if (method === 'POST' && path.endsWith('followup')) {
    const agentId = pathSegments[1];
    return { data: await mockCursorApi.addFollowUp(apiKey, agentId, body) };
  }
  if (method === 'POST' && path.endsWith('stop')) {
    const agentId = pathSegments[1];
    return { data: await mockCursorApi.stopAgent(apiKey, agentId) };
  }

  // DELETE routes
  if (method === 'DELETE' && pathSegments[0] === 'agents' && pathSegments[1]) {
    return { data: await mockCursorApi.deleteAgent(apiKey, pathSegments[1]) };
  }

  return { data: { error: 'Mock endpoint not implemented' }, status: 404 };
}
