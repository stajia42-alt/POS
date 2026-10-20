import { useEffect, useRef, useState, type DependencyList } from 'react';
import { SessionError } from '../domain/access';

export function useModule<T>(
  loader: () => Promise<T>,
  onChanged: () => Promise<void>,
  onLock: () => void,
  dependencies: DependencyList = [],
) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  const writing = useRef(false);
  const generation = useRef(0);
  const load = useRef(loader);
  load.current = loader;
  const fail = (error: unknown) => {
    if (error instanceof SessionError) onLock();
    else
      setError(
        (error as Error).message.includes('UNIQUE constraint')
          ? 'Ese identificador ya existe.'
          : (error as Error).message,
      );
  };
  useEffect(() => {
    const ticket = ++generation.current;
    setError('');
    void load
      .current()
      .then((value) => {
        if (ticket === generation.current) setData(value);
      })
      .catch((error) => {
        if (ticket === generation.current) fail(error);
      });
    return () => {
      generation.current++;
    };
  }, dependencies);
  async function run(action: () => Promise<unknown>, message = 'Operación guardada') {
    if (writing.current) return false;
    writing.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
      await onChanged();
      const value = await load.current();
      generation.current++;
      setData(value);
      setNotice(message);
      return true;
    } catch (error) {
      fail(error);
      return false;
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }
  return { data, error, busy, notice, run, setError, setNotice };
}
