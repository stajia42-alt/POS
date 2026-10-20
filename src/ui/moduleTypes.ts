import type { Pos } from '../domain/pos';
import type { Actor } from '../domain/access-types';
export interface ModuleProps {
  pos: Pos;
  actor: Actor;
  onChanged: () => Promise<void>;
  onLock: () => void;
}
