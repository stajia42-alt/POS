import { useState, type FormEvent } from 'react';
import { ImagePlus, X } from 'lucide-react';
import type { Category, Product } from '../domain/types';
import { parseMoney } from '../domain/money';

export async function photoData(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('Selecciona una fotografía JPG, PNG o WebP.');
  if (file.size > 20_000_000) throw new Error('La fotografía debe pesar menos de 20 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const ratio = Math.min(1, 900 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * ratio);
    canvas.height = Math.round(image.height * ratio);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo procesar la fotografía.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ProductForm({
  product,
  categories,
  onSave,
  onError,
  busy,
}: {
  product?: Product;
  categories: Category[];
  busy: boolean;
  onSave: (product: Omit<Product, 'id'> & { id?: string }) => void;
  onError: (message: string) => void;
}) {
  const [photo, setPhoto] = useState(product?.photo || '');
  const [processing, setProcessing] = useState(false);
  const [track, setTrack] = useState(!!product?.track_stock);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const text = (key: string) => String(values.get(key) || '');
    try {
      onSave({
        id: product?.id,
        name: text('name'),
        sku: text('sku'),
        barcode: text('barcode'),
        description: text('description'),
        category_id: text('category') || null,
        price: parseMoney(text('price')),
        cost: parseMoney(text('cost') || '0'),
        photo,
        active: values.has('active') ? 1 : 0,
        favorite: values.has('favorite') ? 1 : 0,
        track_stock: track ? 1 : 0,
        stock: Number(text('stock') || product?.stock || 0),
        unit: text('unit'),
      });
    } catch (error) {
      onError((error as Error).message);
    }
  };
  return (
    <form onSubmit={submit} className="form-body">
      <div className="product-form-top">
        <div className="photo-control">
          <label className="photo-upload">
            {photo ? (
              <img src={photo} alt="Fotografía del producto" />
            ) : (
              <>
                <ImagePlus size={30} />
                <span>Agregar fotografía</span>
              </>
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Fotografía del producto"
              disabled={processing || busy}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setProcessing(true);
                try {
                  setPhoto(await photoData(file));
                } catch (error) {
                  onError((error as Error).message);
                } finally {
                  setProcessing(false);
                }
              }}
            />
          </label>
          {photo && (
            <button type="button" className="text-button" onClick={() => setPhoto('')}>
              <X size={15} /> Quitar foto
            </button>
          )}
        </div>
        <div className="form-stack grow">
          <label>
            Nombre del producto
            <input
              data-autofocus
              name="name"
              required
              maxLength={120}
              defaultValue={product?.name}
              placeholder="Ej. Café americano"
            />
          </label>
          <div className="form-row">
            <label>
              Precio de venta (MXN)
              <input
                name="price"
                required
                inputMode="decimal"
                defaultValue={product ? (product.price / 100).toFixed(2) : ''}
                placeholder="0.00"
              />
            </label>
            <label>
              Costo (MXN)
              <input
                name="cost"
                inputMode="decimal"
                defaultValue={((product?.cost || 0) / 100).toFixed(2)}
              />
            </label>
          </div>
        </div>
      </div>
      <div className="form-row">
        <label>
          Categoría
          <select name="category" defaultValue={product?.category_id || ''}>
            <option value="">Sin categoría</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Unidad de medida
          <input name="unit" required maxLength={30} defaultValue={product?.unit || 'pieza'} />
        </label>
      </div>
      <div className="form-row">
        <label>
          Código interno
          <input name="sku" maxLength={120} defaultValue={product?.sku} />
        </label>
        <label>
          Código de barras
          <input
            name="barcode"
            maxLength={120}
            defaultValue={product?.barcode}
            inputMode="numeric"
          />
        </label>
      </div>
      <label>
        Descripción
        <textarea
          name="description"
          maxLength={1000}
          rows={2}
          defaultValue={product?.description}
        />
      </label>
      <div className="checkbox-row">
        <label>
          <input name="active" type="checkbox" defaultChecked={product ? !!product.active : true} />{' '}
          Producto activo
        </label>
        <label>
          <input name="favorite" type="checkbox" defaultChecked={!!product?.favorite} /> Favorito
        </label>
      </div>
      <div className="stock-field">
        <label className="check-label">
          <input type="checkbox" checked={track} onChange={(e) => setTrack(e.target.checked)} />{' '}
          Controlar existencias
        </label>
        {track && (
          <label>
            Existencias actuales
            <input
              name="stock"
              type="number"
              min="0"
              max="999999"
              step="1"
              defaultValue={product?.stock || 0}
              required
            />
          </label>
        )}
      </div>
      <p className="field-hint">
        La fotografía y los datos se guardan en este dispositivo. Las ventas conservarán el precio
        que tenían al agregarse al ticket.
      </p>
      <footer className="form-footer">
        <button className="primary" disabled={busy || processing}>
          {processing ? 'Procesando foto…' : busy ? 'Guardando…' : 'Guardar producto'}
        </button>
      </footer>
    </form>
  );
}
