import { contextBridge, ipcRenderer } from 'electron';
import Store from 'electron-store';

const store = new Store({
  name: 'cursor-desktop',
  clearInvalidConfig: true,
});

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('ping'),
  storage: {
    get: (key: string) => store.get(key),
    set: (key: string, value: unknown) => store.set(key, value),
    delete: (key: string) => store.delete(key),
    clear: () => store.clear(),
  },
});
