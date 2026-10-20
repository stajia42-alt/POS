import { Delete, RotateCcw } from 'lucide-react';
export function PinPad({
  value,
  onChange,
  busy,
}: {
  value: string;
  onChange: (value: string) => void;
  busy: boolean;
}) {
  return (
    <div className="pin-pad" role="group" aria-label="Teclado numérico de PIN">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
        <button
          key={digit}
          type="button"
          disabled={busy || value.length >= 8}
          onClick={() => onChange(value + digit)}
        >
          {digit}
        </button>
      ))}
      <button type="button" aria-label="Borrar PIN" disabled={busy} onClick={() => onChange('')}>
        <RotateCcw size={20} />
      </button>
      <button
        type="button"
        disabled={busy || value.length >= 8}
        onClick={() => onChange(value + '0')}
      >
        0
      </button>
      <button
        type="button"
        aria-label="Borrar último dígito"
        disabled={busy || !value.length}
        onClick={() => onChange(value.slice(0, -1))}
      >
        <Delete size={22} />
      </button>
    </div>
  );
}
