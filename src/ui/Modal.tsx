import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

let nextModal = 0;
export function Modal({
  title,
  children,
  onClose,
  wide = false,
  side = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  side?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const label = useRef(`dialog-${++nextModal}`);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = panel.current!;
    const focusable = () =>
      Array.from(
        node.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
        ),
      ).filter((e) => e.offsetParent !== null);
    (node.querySelector<HTMLElement>('[data-autofocus]') || focusable()[0] || node).focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current();
      if (event.key === 'Tab') {
        const items = focusable();
        const first = items[0],
          last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    node.addEventListener('keydown', key);
    return () => {
      node.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className={`modal-backdrop ${side ? 'sidebar-backdrop' : ''}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={label.current}
        className={`modal ${wide ? 'modal-wide' : ''} ${side ? 'side-modal' : ''}`}
      >
        <header className="modal-header">
          <h2 id={label.current}>{title}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Cerrar ventana"
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
