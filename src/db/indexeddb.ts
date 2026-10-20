import type { Persistence } from './wasm-driver';

export function indexedDbPersistence(name = 'aviles-pos-v1'): Persistence {
  const open = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('sqlite');
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(new Error('Cierra las otras pestañas de AVILES POS para abrir la base de datos.'));
      request.onsuccess = () => resolve(request.result);
    });
  return {
    async load() {
      const db = await open();
      try {
        return await new Promise<Uint8Array | undefined>((resolve, reject) => {
          const tx = db.transaction('sqlite', 'readonly');
          const req = tx.objectStore('sqlite').get('database');
          tx.oncomplete = () => resolve(req.result ? new Uint8Array(req.result) : undefined);
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    },
    async save(data) {
      const db = await open();
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('sqlite', 'readwrite');
          tx.objectStore('sqlite').put(data, 'database');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    },
  };
}
