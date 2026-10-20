import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react';
import { Armchair, Plus, Pencil, Check, Map, Trash2 } from 'lucide-react';
import type { DiningTable, TableInput } from '../domain/tables';
import { money } from '../domain/money';
import { Modal } from './Modal';
import { useModule } from './useModule';
import type { ModuleProps } from './moduleTypes';
const SHAPES = { round: 'Redonda', square: 'Cuadrada', rectangle: 'Rectangular' } as const;
function elapsed(iso: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}
function TableForm({
  table,
  areas,
  busy,
  onSave,
  onDelete,
}: {
  table: TableInput;
  areas: { id: string; name: string }[];
  busy: boolean;
  onSave: (value: TableInput) => void;
  onDelete: () => void;
}) {
  const [shape, setShape] = useState(table.shape);
  const [width, setWidth] = useState(table.width);
  const [height, setHeight] = useState(table.height);
  const [confirm, setConfirm] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({
      ...table,
      name: String(form.get('name')),
      area_id: String(form.get('area')),
      shape,
      width,
      height: shape === 'rectangle' ? height : width,
      capacity: Number(form.get('capacity')),
      x: Number(form.get('x')),
      y: Number(form.get('y')),
    });
  }
  return (
    <form className="form-body" onSubmit={submit}>
      <label>
        Nombre de la mesa
        <input name="name" required maxLength={80} defaultValue={table.name} data-autofocus />
      </label>
      <div className="form-row">
        <label>
          Área
          <select aria-label="Área de la mesa" name="area" defaultValue={table.area_id}>
            {areas.map((area) => (
              <option value={area.id} key={area.id}>
                {area.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Capacidad
          <input
            name="capacity"
            type="number"
            min="1"
            max="100"
            required
            defaultValue={table.capacity}
          />
        </label>
      </div>
      <label>
        Forma
        <select
          aria-label="Forma de la mesa"
          value={shape}
          onChange={(e) => {
            setShape(e.target.value as TableInput['shape']);
            if (e.target.value === 'rectangle' && shape !== 'rectangle') {
              setWidth(200);
              setHeight(144);
            } else if (e.target.value !== 'rectangle' && width > 240) setWidth(240);
          }}
        >
          {Object.entries(SHAPES).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <div className="form-row">
        <label>
          Ancho de la mesa
          <input
            type="number"
            min="64"
            max={shape === 'rectangle' ? 280 : 240}
            required
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
          />
        </label>
        <label>
          Alto de la mesa
          <input
            name="height"
            type="number"
            min="64"
            max="240"
            required
            value={shape === 'rectangle' ? height : width}
            onChange={(e) => setHeight(Number(e.target.value))}
            disabled={shape !== 'rectangle'}
          />
        </label>
      </div>
      <div className="form-row">
        <label>
          Posición horizontal
          <input
            name="x"
            type="number"
            min="0"
            max={1000 - width}
            required
            defaultValue={table.x}
          />
        </label>
        <label>
          Posición vertical
          <input
            name="y"
            type="number"
            min="0"
            max={600 - (shape === 'rectangle' ? height : width)}
            required
            defaultValue={table.y}
          />
        </label>
      </div>
      <p className="field-hint">
        El plano mide 1000 × 600 unidades. Puedes mover la mesa arrastrándola en edición o con las
        flechas del teclado. Sus bordes deben permanecer dentro del plano.
      </p>
      <footer className="form-footer split">
        {table.id && (
          <button
            type="button"
            className="danger-button"
            onClick={() => setConfirm(true)}
            disabled={busy}
          >
            <Trash2 size={17} />
            Eliminar mesa
          </button>
        )}
        <button className="primary" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar mesa'}
        </button>
      </footer>
      {confirm && (
        <div className="confirmation-box">
          <p>
            Se quitará esta mesa del mapa. Las cuentas históricas se conservarán. No se puede
            eliminar si tiene una cuenta abierta.
          </p>
          <button type="button" className="danger-button" disabled={busy} onClick={onDelete}>
            Confirmar eliminación
          </button>
        </div>
      )}
    </form>
  );
}
export function TablesMap({
  pos,
  actor,
  onChanged,
  onLock,
  selectedId,
}: { selectedId?: string } & ModuleProps) {
  const [areaId, setAreaId] = useState('');
  const [edit, setEdit] = useState(false);
  const [areaForm, setAreaForm] = useState<{ id?: string; name: string } | null>(null);
  const [tableForm, setTableForm] = useState<TableInput | null>(null);
  const [deleteArea, setDeleteArea] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [preview, setPreview] = useState<{ id: string; x: number; y: number }>();
  const board = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: string;
    x: number;
    y: number;
    cx: number;
    cy: number;
    width: number;
    height: number;
  } | null>(null);
  const dragged = useRef(false);
  const module = useModule(() => pos.tables.snapshot(), onChanged, onLock);
  const { data, busy, error, notice, run, setError } = module;
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const selectedArea = data?.areas.find((a) => a.id === areaId) || data?.areas[0];
  const tables = data?.tables.filter((t) => t.area_id === selectedArea?.id) || [];
  const layout = actor.permissions.includes('table_layout');
  async function areaSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    let saved = '';
    if (
      await run(async () => {
        saved = await pos.tables.saveArea(String(form.get('name')), areaForm?.id);
      }, 'Área guardada')
    ) {
      setAreaId(saved);
      setAreaForm(null);
    }
  }
  function createTable() {
    if (!selectedArea) return;
    let x = 24,
      y = 24;
    let found = false;
    for (let cy = 24; cy <= 440 && !found; cy += 24)
      for (let cx = 24; cx <= 840; cx += 24)
        if (
          !tables.some(
            (t) =>
              cx < t.x + t.width + 12 &&
              cx + 140 + 12 > t.x &&
              cy < t.y + t.height + 12 &&
              cy + 140 + 12 > t.y,
          )
        ) {
          x = cx;
          y = cy;
          found = true;
          break;
        }
    setError('');
    setTableForm({
      area_id: selectedArea.id,
      name: '',
      shape: 'square',
      x,
      y,
      width: 140,
      height: 140,
      capacity: 4,
    });
  }
  function pointerDown(event: PointerEvent<HTMLButtonElement>, table: DiningTable) {
    dragged.current = false;
    if (!edit || busy) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragged.current = false;
    drag.current = {
      id: table.id,
      x: table.x,
      y: table.y,
      cx: event.clientX,
      cy: event.clientY,
      width: table.width,
      height: table.height,
    };
  }
  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    const start = drag.current;
    if (!start || !board.current) return;
    const rect = board.current.getBoundingClientRect();
    const dx = ((event.clientX - start.cx) * 1000) / rect.width,
      dy = ((event.clientY - start.cy) * 600) / rect.height;
    if (Math.abs(dx) + Math.abs(dy) > 3) dragged.current = true;
    setPreview({
      id: start.id,
      x: Math.max(0, Math.min(1000 - start.width, Math.round(start.x + dx))),
      y: Math.max(0, Math.min(600 - start.height, Math.round(start.y + dy))),
    });
  }
  async function pointerUp() {
    const start = drag.current;
    drag.current = null;
    if (start && preview && dragged.current)
      await run(() => pos.tables.position(start.id, preview.x, preview.y), 'Posición guardada');
    setPreview(undefined);
  }
  return (
    <section className="floor-content">
      <div className="floor-heading">
        <div>
          <p className="eyebrow">RESTAURANTE</p>
          <h1>Mapa de mesas</h1>
          <p>Selecciona una mesa para abrir su cuenta</p>
        </div>
        <div className="module-actions">
          {layout && (
            <button
              className={edit ? 'primary' : 'secondary'}
              aria-pressed={edit}
              onClick={() => {
                setEdit(!edit);
                dragged.current = false;
                drag.current = null;
                setPreview(undefined);
                setError('');
              }}
            >
              {edit ? <Check size={18} /> : <Pencil size={18} />}{' '}
              {edit ? 'Terminar edición' : 'Editar plano'}
            </button>
          )}
          {layout && edit && (
            <button
              className="secondary"
              onClick={() => {
                setAreaForm({ name: '' });
                setDeleteArea(false);
                setError('');
              }}
            >
              <Plus size={18} />
              Crear área
            </button>
          )}
          {layout && edit && selectedArea && (
            <button className="primary" onClick={createTable}>
              <Plus size={18} />
              Agregar mesa
            </button>
          )}
        </div>
      </div>
      {!areaForm && !tableForm && error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {notice && (
        <p className="module-notice" role="status">
          {notice}
        </p>
      )}
      {data?.areas.length ? (
        <>
          <div className="area-row">
            <div className="area-tabs" role="tablist" aria-label="Áreas del restaurante">
              {data.areas.map((area) => (
                <button
                  role="tab"
                  aria-selected={selectedArea?.id === area.id}
                  key={area.id}
                  onClick={() => setAreaId(area.id)}
                >
                  {area.name}
                  <span>{data.tables.filter((t) => t.area_id === area.id).length}</span>
                </button>
              ))}
            </div>
            {edit && layout && (
              <button
                className="icon-button"
                aria-label="Editar área"
                onClick={() => {
                  setAreaForm(selectedArea!);
                  setDeleteArea(false);
                  setError('');
                }}
              >
                <Pencil size={18} />
              </button>
            )}
          </div>
          <div className="floor-legend">
            <span>
              <i className="available" />
              Disponible
            </span>
            <span>
              <i className="occupied" />
              Ocupada
            </span>
            <span>
              <i className="awaiting" />
              Pendiente de cobro
            </span>
            <span>
              <i className="selected" />
              Seleccionada
            </span>
            {edit && <strong>Edición · arrastra para mover</strong>}
          </div>
          <div className="floor-scroll">
            <div
              ref={board}
              className={`floor-board ${edit ? 'editing' : ''}`}
              aria-label="Plano de mesas"
            >
              {tables.map((table) => {
                const point = preview?.id === table.id ? preview : table;
                const state =
                  table.id === selectedId
                    ? 'selected'
                    : table.bill?.payment_requested
                      ? 'awaiting'
                      : table.bill
                        ? 'occupied'
                        : 'available';
                return (
                  <button
                    key={table.id}
                    className={`dining-table ${table.shape} ${state}`}
                    style={{
                      left: `${point.x / 10}%`,
                      top: `${point.y / 6}%`,
                      width: `${table.width / 10}%`,
                      height: `${table.height / 6}%`,
                    }}
                    disabled={busy || (!edit && !actor.permissions.includes('sell'))}
                    aria-label={`${edit ? 'Editar' : 'Abrir'} mesa ${table.name}`}
                    onPointerDown={(e) => pointerDown(e, table)}
                    onPointerMove={pointerMove}
                    onPointerUp={() => void pointerUp()}
                    onPointerCancel={() => {
                      drag.current = null;
                      setPreview(undefined);
                    }}
                    onKeyDown={(e) => {
                      if (!edit) return;
                      const delta: Record<string, [number, number]> = {
                        ArrowLeft: [-10, 0],
                        ArrowRight: [10, 0],
                        ArrowUp: [0, -10],
                        ArrowDown: [0, 10],
                      };
                      const d = delta[e.key];
                      if (!d) return;
                      e.preventDefault();
                      void run(
                        () =>
                          pos.tables.position(
                            table.id,
                            Math.max(0, Math.min(1000 - table.width, table.x + d[0])),
                            Math.max(0, Math.min(600 - table.height, table.y + d[1])),
                          ),
                        'Posición guardada',
                      );
                    }}
                    onClick={() => {
                      if (dragged.current) {
                        dragged.current = false;
                        return;
                      }
                      if (edit) {
                        setError('');
                        setTableForm(table);
                      } else void run(() => pos.tables.open(table.id), 'Cuenta recuperada');
                    }}
                  >
                    <Armchair size={19} />
                    <strong>{table.name}</strong>
                    <span>
                      {table.bill?.payment_requested
                        ? 'Pendiente de cobro'
                        : table.bill
                          ? 'Ocupada'
                          : 'Disponible'}
                    </span>
                    {table.bill ? (
                      <>
                        <b>{money(table.bill.total)}</b>
                        <small>{elapsed(table.bill.opened_at, now)}</small>
                      </>
                    ) : (
                      <small>{table.capacity} lugares</small>
                    )}
                  </button>
                );
              })}
              {!tables.length && (
                <div className="floor-empty">
                  <Armchair size={36} />
                  <h2>Esta área está lista para tus mesas</h2>
                  <p>
                    {layout
                      ? 'Activa Editar plano y agrega la primera mesa.'
                      : 'El administrador puede crear las mesas de esta área.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="floor-empty">
          <Map size={44} />
          <h2>Organiza tu restaurante</h2>
          <p>
            {layout
              ? 'Crea un área y distribuye las mesas como están en tu negocio.'
              : 'El administrador debe configurar las áreas y mesas.'}
          </p>
          {layout && (
            <button
              className="primary"
              onClick={() => {
                setEdit(true);
                setAreaForm({ name: '' });
                setDeleteArea(false);
              }}
            >
              <Plus size={18} />
              Crear primera área
            </button>
          )}
        </div>
      )}
      {areaForm && (
        <Modal
          title={areaForm.id ? 'Editar área' : 'Nueva área'}
          onClose={() => {
            if (!busy) setAreaForm(null);
          }}
        >
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
          <form className="form-body" onSubmit={(event) => void areaSubmit(event)}>
            <label>
              Nombre del área
              <input
                name="name"
                required
                maxLength={80}
                defaultValue={areaForm.name}
                placeholder="Ej. Salón o terraza"
                data-autofocus
              />
            </label>
            <footer className="form-footer split">
              {areaForm.id && (
                <button
                  className="danger-button"
                  type="button"
                  disabled={busy}
                  onClick={() => setDeleteArea(true)}
                >
                  Eliminar área
                </button>
              )}
              <button className="primary" disabled={busy}>
                Guardar área
              </button>
            </footer>
            {deleteArea && (
              <div className="confirmation-box">
                <p>Solo puedes eliminar un área sin mesas activas.</p>
                <button
                  className="danger-button"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(() => pos.tables.deleteArea(areaForm.id!), 'Área eliminada').then(
                      (ok) => {
                        if (ok) setAreaForm(null);
                      },
                    )
                  }
                >
                  Confirmar eliminación del área
                </button>
              </div>
            )}
          </form>
        </Modal>
      )}
      {tableForm && (
        <Modal
          title={tableForm.id ? 'Editar mesa' : 'Nueva mesa'}
          onClose={() => {
            if (!busy) setTableForm(null);
          }}
        >
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <TableForm
            table={tableForm}
            areas={data?.areas || []}
            busy={busy}
            onSave={(value) =>
              void run(() => pos.tables.save(value), 'Mesa guardada').then((ok) => {
                if (ok) setTableForm(null);
              })
            }
            onDelete={() =>
              void run(() => pos.tables.delete(tableForm.id!), 'Mesa eliminada').then((ok) => {
                if (ok) setTableForm(null);
              })
            }
          />
        </Modal>
      )}
    </section>
  );
}
