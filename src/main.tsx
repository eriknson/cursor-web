import React from 'react';
import ReactDOM from 'react-dom/client';

import './app/globals.css';

const App = () => (
  <div className="min-h-dvh bg-black text-white flex items-center justify-center">
    <div className="space-y-4 text-center">
      <img
        src="/cursor-logo.svg"
        alt="Cursor"
        className="h-10 mx-auto"
      />
      <div className="text-lg font-medium text-zinc-200">
        Cursor for macOS (Electron) — scaffolding ready
      </div>
      <p className="text-sm text-zinc-500 max-w-md mx-auto">
        The renderer is powered by Vite + React. We&apos;ll migrate the full UI and direct
        Cursor API integration next.
      </p>
    </div>
  </div>
);

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element not found');
}

ReactDOM.createRoot(root).render(<App />);
