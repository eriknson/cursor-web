import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface User {
    apiKey?: string;
  }

  interface Session {
    user: {
      email?: string | null;
      apiKey?: string;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    apiKey?: string;
  }
}
