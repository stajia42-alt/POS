import importlib.util
from pathlib import Path
import unittest
import base64
from io import BytesIO
from PIL import Image

spec = importlib.util.spec_from_file_location('ocr_local', Path(__file__).parents[1] / 'ocr_local.py')
ocr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ocr)

class AdapterTest(unittest.TestCase):
    def test_empty_recognition_is_not_success(self):
        for result in [None, [], iter([]), [None], [{'rec_texts': []}], [{'rec_texts': [' ', '']}]]:
            with self.subTest(result=result), self.assertRaisesRegex(ValueError, '0 líneas'):
                ocr.normalizar_resultados(result)

    def test_image_extension_matches_content_and_survives_lazy_inference(self):
        # Doble unitario del motor: no afirma ejecutar PaddleOCR.
        for fmt, suffix in [('JPEG', '.jpg'), ('PNG', '.png'), ('WEBP', '.webp')]:
            buffer = BytesIO()
            Image.new('RGB', (32, 32), 'white').save(buffer, format=fmt)
            payload = {'imagen': base64.b64encode(buffer.getvalue()).decode('ascii')}
            paths = []
            owner = self
            class Engine:
                def predict(self, filename):
                    paths.append(filename)
                    owner.assertEqual(Path(filename).suffix, suffix)
                    owner.assertTrue(Path(filename).exists())
                    owner.assertEqual(Path(filename).read_bytes(), buffer.getvalue())
                    yield {'rec_texts': ['Sopa $10']}
            result, _ = ocr.extraer(payload, (Engine(), 3))
            self.assertEqual(result['lineas'], ['Sopa $10'])
            self.assertFalse(Path(paths[0]).exists())

    def test_empty_inference_removes_temporary_image(self):
        buffer = BytesIO()
        Image.new('RGB', (32, 32), 'white').save(buffer, format='JPEG')
        paths = []
        class Engine:
            def predict(self, filename):
                paths.append(filename)
                return []
        with self.assertRaisesRegex(ValueError, '0 líneas'):
            ocr.extraer({'imagen': base64.b64encode(buffer.getvalue()).decode('ascii')}, (Engine(), 3))
        self.assertFalse(Path(paths[0]).exists())

    def test_v3_preserves_low_confidence_coordinates_and_order(self):
        d = ocr.normalizar_resultados([{'rec_texts': ['Cerdo con napa', '$128'], 'rec_scores': [.2, .99],
                                      'rec_polys': [[[0, 0], [100, 0], [100, 20], [0, 20]], [[200, 0], [250, 0], [250, 20], [200, 20]]]}])
        self.assertEqual(d['lineas'], ['Cerdo con napa', '$128'])
        self.assertEqual(d['bloques'][0]['confianza'], .2)
        self.assertEqual(d['bloques'][1]['caja'], [200, 0, 250, 20])

    def test_v2_and_nested_v3(self):
        v2 = [[[[[0, 0], [100, 0], [100, 10], [0, 10]], ('Texto', .1)]]]
        self.assertEqual(ocr.normalizar_resultados(v2)['lineas'], ['Texto'])
        self.assertEqual(ocr.normalizar_resultados([{'res': {'rec_texts': ['Otro']}}])['bloques'][0]['caja'], None)

    def test_invalid_coordinates_and_nonfinite_confidence(self):
        d = ocr.normalizar_resultados([{'rec_texts': ['Texto'], 'rec_scores': [float('nan')], 'rec_polys': [[0, 0, 0, 0]]}])
        self.assertIsNone(d['bloques'][0]['confianza'])
        self.assertIsNone(d['bloques'][0]['caja'])

    def test_unrecognized_result_is_an_error(self):
        with self.assertRaises(ValueError):
            ocr.normalizar_resultados([object()])

    def test_invalid_v2_rows_are_not_silently_discarded(self):
        for row in ['texto sin estructura', [], [[], []], None]:
            with self.assertRaises(ValueError):
                ocr.normalizar_resultados([[row]])

    def test_v3_strings_and_null_text_are_not_fabricated_lines(self):
        for texts in ['Texto', [None], [123]]:
            with self.assertRaises(ValueError):
                ocr.normalizar_resultados([{'rec_texts': texts}])

    def test_confidence_outside_probability_range_is_unknown(self):
        result = ocr.normalizar_resultados([{'rec_texts': ['Uno', 'Dos'], 'rec_scores': [-1, 9]}])
        self.assertTrue(all(b['confianza'] is None for b in result['bloques']))

if __name__ == '__main__':
    unittest.main()
