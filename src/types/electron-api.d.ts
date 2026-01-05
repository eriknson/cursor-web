export {};

declare global {
  interface Window {
    electronAPI?: {
      ping: () => Promise<string>;
      storage: {
        get: (key: string) => unknown;
        set: (key: string, value: unknown) => void;
        delete: (key: string) => void;
        clear: () => void;
      };
    };
  }
}
