import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { validateApiKey, ApiKeyInfo } from './cursorClient';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Cursor API Key',
      credentials: {
        apiKey: { label: 'API Key', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.apiKey) {
          return null;
        }

        try {
          // Validate the API key by calling the Cursor API
          const userInfo = await validateApiKey(credentials.apiKey);
          
          return {
            id: userInfo.userEmail || 'user',
            email: userInfo.userEmail,
            apiKey: credentials.apiKey, // Store API key in the session
          };
        } catch (error) {
          console.error('API key validation failed:', error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Initial sign in - store API key in token
      if (user) {
        token.apiKey = (user as { apiKey?: string }).apiKey;
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      // Add API key to session so it can be used in API routes
      if (session.user) {
        (session.user as { apiKey?: string }).apiKey = token.apiKey as string;
      }
      return session;
    },
  },
  pages: {
    signIn: '/',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: process.env.NEXTAUTH_SECRET || 'your-secret-key-change-in-production',
};
