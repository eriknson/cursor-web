import { NextRequest, NextResponse } from 'next/server';

const CURSOR_API_BASE = 'https://api.cursor.com/v0';

// Proxy route to forward requests to Cursor API
// This avoids CORS issues when calling from the browser

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

async function proxyRequest(
  request: NextRequest,
  pathSegments: string[],
  method: string
): Promise<NextResponse> {
  const apiKey = request.headers.get('X-Cursor-Api-Key');
  
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Missing X-Cursor-Api-Key header' },
      { status: 401 }
    );
  }
  
  const path = '/' + pathSegments.join('/');
  const url = new URL(request.url);
  const queryString = url.search;
  const targetUrl = `${CURSOR_API_BASE}${path}${queryString}`;
  
  const headers: HeadersInit = {
    'Authorization': `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
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
  
  // Forward body for POST requests
  if (method === 'POST') {
    try {
      const body = await request.text();
      if (body) {
        fetchOptions.body = body;
      }
    } catch {
      // No body
    }
  }
  
  try {
    const response = await fetch(targetUrl, fetchOptions);
    const data = await response.text();
    
    return new NextResponse(data, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
      },
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to proxy request to Cursor API' },
      { status: 500 }
    );
  }
}
