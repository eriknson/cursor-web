'use client';

import { createContext, useContext, ReactNode } from 'react';

interface MockContextValue {
  isMockMode: boolean;
}

const MockContext = createContext<MockContextValue>({ isMockMode: false });

export function MockProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  return (
    <MockContext.Provider value={{ isMockMode: enabled }}>
      {children}
    </MockContext.Provider>
  );
}

export function useMockMode(): boolean {
  const ctx = useContext(MockContext);
  return ctx.isMockMode;
}
