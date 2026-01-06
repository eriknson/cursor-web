import { NextRequest, NextResponse } from 'next/server';

const CURSOR_API_BASE = 'https://api.cursor.com/v0';
const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB max body size
const REQUEST_TIMEOUT_MS = 30000; // 30 seconds

// Allowed API paths for security - only allow specific endpoints
const ALLOWED_PATHS = [
  '/me',
  '/repositories',
  '/agents',
  '/models',
];

// Validate API path to prevent path traversal and unauthorized access
function validatePath(pathSegments: string[]): { valid: boolean; path: string } {
  const path = '/' + pathSegments.join('/');
  
  // Check for path traversal attempts
  if (pathSegments.some(segment => segment.includes('..') || segment.includes('//'))) {
    return { valid: false, path };
  }
  
  // Validate path starts with allowed prefix
  const isValid = ALLOWED_PATHS.some(allowed => path.startsWith(allowed));
  if (!isValid) {
    return { valid: false, path };
  }
  
  return { valid: true, path };
}

// Validate API key format (basic check)
function validateApiKey(apiKey: string): boolean {
  if (!apiKey || typeof apiKey !== 'string') {
    return false;
  }
  
  // Basic validation: should be non-empty and reasonable length
  if (apiKey.length < 10 || apiKey.length > 500) {
    return false;
  }
  
  return true;
}

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxyRequest(request, path, 'GET');
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxyRequest(request, path, 'POST');
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxyRequest(request, path, 'DELETE');
}

async function proxyRequest(
  request: NextRequest,
  pathSegments: string[],
  method: string
): Promise<NextResponse> {
  // Validate path
  const pathValidation = validatePath(pathSegments);
  if (!pathValidation.valid) {
    return NextResponse.json(
      { error: 'Invalid API path' },
      { status: 400 }
    );
  }
  
  // Validate API key
  const apiKey = request.headers.get('X-Cursor-Api-Key');
  if (!apiKey || !validateApiKey(apiKey)) {
    return NextResponse.json(
      { error: 'Missing or invalid X-Cursor-Api-Key header' },
      { status: 401 }
    );
  }
  
  const path = pathValidation.path;
  const url = new URL(request.url);
  const queryString = url.search;
  
  // Validate query string length
  if (queryString.length > 2048) {
    return NextResponse.json(
      { error: 'Query string too long' },
      { status: 400 }
    );
  }
  
  const targetUrl = `${CURSOR_API_BASE}${path}${queryString}`;
  
  const headers: HeadersInit = {
    'Authorization': `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
  };
  
  // Forward content-type if present and valid
  const contentType = request.headers.get('Content-Type');
  if (contentType && contentType.startsWith('application/json')) {
    headers['Content-Type'] = contentType;
  }
  
  const fetchOptions: RequestInit = {
    method,
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  };
  
  // Forward body for POST requests with size validation
  if (method === 'POST') {
    try {
      const contentLength = request.headers.get('Content-Length');
      if (contentLength) {
        const size = parseInt(contentLength, 10);
        if (isNaN(size) || size > MAX_BODY_SIZE) {
          return NextResponse.json(
            { error: 'Request body too large' },
            { status: 413 }
          );
        }
      }
      
      const body = await request.text();
      if (body.length > MAX_BODY_SIZE) {
        return NextResponse.json(
          { error: 'Request body too large' },
          { status: 413 }
        );
      }
      
      if (body) {
        // Validate JSON if content-type is JSON
        if (contentType?.includes('application/json')) {
          try {
            JSON.parse(body);
          } catch {
            return NextResponse.json(
              { error: 'Invalid JSON in request body' },
              { status: 400 }
            );
          }
        }
        fetchOptions.body = body;
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return NextResponse.json(
          { error: 'Request timeout' },
          { status: 408 }
        );
      }
      // Other errors - return 400
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }
  }
  
  try {
    const response = await fetch(targetUrl, fetchOptions);
    const data = await response.text();
    
    // Limit response size
    if (data.length > MAX_BODY_SIZE) {
      return NextResponse.json(
        { error: 'Response too large' },
        { status: 500 }
      );
    }
    
    return new NextResponse(data, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
        // Security headers
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
      },
    });
  } catch (error) {
    // Log error details in server logs (not exposed to client)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Proxy error:', {
      path,
      method,
      error: errorMessage,
      timestamp: new Date().toISOString(),
    });
    
    // Don't expose internal error details to client
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Request timeout' },
        { status: 504 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to proxy request to Cursor API' },
      { status: 502 }
    );
  }
}
