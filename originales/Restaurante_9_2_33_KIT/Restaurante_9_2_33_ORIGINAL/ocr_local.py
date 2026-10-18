"""Puente local: conserva texto, confianza y coordenadas; nunca modifica SQL."""
import base64
import contextlib
import importlib.metadata
import json
import math
import os
import sys
import tempfile

os.environ['FLAGS_use_mkldnn'] = '0'
os.environ['FLAGS_use_onednn'] = '0'
PREFIX = 'RESTAURANTE_OCR:'


def bbox(poly):
    if poly is None:
        return None
    if hasattr(poly, 'tolist'):
        poly = poly.tolist()
    try:
        if len(poly) == 4 and all(isinstance(n, (float, int)) for n in poly):
            box = [float(n) for n in poly]
        else:
            box = [min(float(p[0]) for p in poly), min(float(p[1]) for p in poly),
                   max(float(p[0]) for p in poly), max(float(p[1]) for p in poly)]
        return box if all(math.isfinite(n) for n in box) and box[2] > box[0] and box[3] > box[1] else None
    except (ValueError, TypeError, IndexError):
        return None


def normalizar_resultados(result):
    blocks = []

    def append(text, score, poly, page):
        if not isinstance(text, str):
            raise ValueError('Una línea OCR no es texto; el resultado necesita revisión.')
        text = text.strip()
        if not text:
            return
        try:
            confidence = float(score)
            if not math.isfinite(confidence) or not 0 <= confidence <= 1:
                confidence = None
        except (TypeError, ValueError):
            confidence = None
        blocks.append({'texto': text, 'confianza': confidence, 'caja': bbox(poly), 'pagina': page})

    for page_index, page in enumerate(result if result is not None else []):
        if page is None:
            continue
        if hasattr(page, 'get'):
            data = page.get('res', page)
            if 'rec_texts' not in data:
                raise ValueError('El OCR no devolvió rec_texts; formato incompatible.')
            texts = data.get('rec_texts', [])
            if isinstance(texts, (str, bytes)) or not hasattr(texts, '__len__'):
                raise ValueError('rec_texts debe ser una lista de líneas, no un texto suelto.')
            scores = data.get('rec_scores', [])
            polys = data.get('rec_polys', data.get('rec_boxes', []))
            for i, text in enumerate(texts):
                append(text, scores[i] if i < len(scores) else None, polys[i] if i < len(polys) else None, page_index)
        elif isinstance(page, (tuple, list)):
            for item in page:
                if isinstance(item, (list, tuple)) and len(item) >= 2 and isinstance(item[1], (list, tuple)) and len(item[1]) >= 1:
                    append(item[1][0], item[1][1] if len(item[1]) > 1 else None, item[0], page_index)
                else:
                    raise ValueError('Una línea PaddleOCR 2.x tiene un formato inesperado; no se descartó silenciosamente.')
        else:
            raise ValueError('Formato PaddleOCR no reconocido; no se descartaron líneas silenciosamente.')
    if not blocks:
        raise ValueError('No se reconoció texto en la fotografía (0 líneas). No se considera analizada. Intenta nuevamente o usa una foto más nítida.')
    return {'lineas': [b['texto'] for b in blocks], 'bloques': blocks}


def crear_motor():
    from paddleocr import PaddleOCR
    major = int(importlib.metadata.version('paddleocr').split('.')[0])
    if major == 3:
        return PaddleOCR(lang='es', device='cpu', enable_mkldnn=False, text_rec_score_thresh=0.0,
                         use_doc_orientation_classify=False, use_doc_unwarping=False,
                         use_textline_orientation=False), major
    if major == 2:
        return PaddleOCR(lang='es', use_angle_cls=False, use_gpu=False, show_log=False,
                         enable_mkldnn=False, drop_score=0.0), major
    raise ValueError('Versión principal de PaddleOCR no soportada: ' + str(major))


def extraer(payload, engine):
    raw = base64.b64decode(payload['imagen'], validate=True)
    if not raw or len(raw) > 7000000:
        raise ValueError('La imagen debe ocupar entre 1 byte y 7 MB.')
    from PIL import Image
    from io import BytesIO
    with Image.open(BytesIO(raw)) as img:
        suffix = {'JPEG': '.jpg', 'PNG': '.png', 'WEBP': '.webp'}.get(img.format)
        if suffix is None:
            raise ValueError('Formato no admitido: usa una fotografía JPG, PNG o WebP.')
        if img.width * img.height > 30000000:
            raise ValueError('La foto supera 30 megapíxeles; reduce su tamaño.')
        img.verify()
    if engine is None:
        engine = crear_motor()
    # PaddleX selecciona lectores por formato; no enviar una extensión genérica.
    fd, filename = tempfile.mkstemp(suffix=suffix)
    try:
        with os.fdopen(fd, 'wb') as out:
            out.write(raw)
        ocr, major = engine
        result = ocr.predict(filename) if major == 3 else ocr.ocr(filename, cls=False)
        return normalizar_resultados(result), engine
    finally:
        os.unlink(filename)


def main():
    output = sys.stdout
    if '--diagnostico' in sys.argv:
        data = {'python': sys.version.split()[0], 'python311': sys.version_info[:2] == (3, 11),
                'paddleocr': importlib.metadata.version('paddleocr'),
                'paddlepaddle': importlib.metadata.version('paddlepaddle')}
        with contextlib.redirect_stdout(sys.stderr):
            import paddle
            from paddleocr import PaddleOCR
        print(PREFIX + json.dumps({'correcto': True, **data}), file=output, flush=True)
        return
    engine = None
    for line in sys.stdin:
        try:
            payload = json.loads(line)
            with contextlib.redirect_stdout(sys.stderr):
                data, engine = extraer(payload, engine)
        except Exception as exc:
            data = {'error': str(exc)}
        print(PREFIX + json.dumps(data, ensure_ascii=False, allow_nan=False), file=output, flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(PREFIX + json.dumps({'error': str(exc)}, ensure_ascii=False), flush=True)
        sys.exit(1)
