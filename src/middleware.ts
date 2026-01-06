import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    // Only protect API routes that need authentication
    if (req.nextUrl.pathname.startsWith('/api/cursor')) {
      const token = req.nextauth.token;
      
      if (!token || !(token as { apiKey?: string })?.apiKey) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
    }
    
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        // Only require auth for API cursor routes
        if (req.nextUrl.pathname.startsWith('/api/cursor')) {
          return !!(token as { apiKey?: string })?.apiKey;
        }
        return true; // Allow all other routes
      },
    },
    pages: {
      signIn: '/',
    },
  }
);

export const config = {
  matcher: [
    /*
     * Match API routes that need authentication
     */
    '/api/cursor/:path*',
  ],
};
