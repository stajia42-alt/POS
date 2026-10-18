'use strict';
const fs = require('fs');
const path = require('path');
// Un único archivo SQL revisable para SSMS y la descarga JSON de la aplicación.
const consulta = fs.readFileSync(path.join(__dirname, 'DIAGNOSTICO_MENU_SOLO_LECTURA.sql'), 'utf8');
const nombres = ['entorno', 'tablas', 'columnas', 'indices', 'relaciones', 'comprobaciones', 'disparadores'];
async function inspeccionar(request) {
  const result = await request.query(consulta);
  if (!Array.isArray(result.recordsets) || result.recordsets.length !== nombres.length || result.recordsets.some(x=>!Array.isArray(x)))
    throw Error('El diagnóstico no devolvió los siete conjuntos de metadatos.');
  const data = Object.fromEntries(nombres.map((name, i) => [name, result.recordsets[i]]));
  return {...data, completo: data.entorno.length===1 && data.entorno[0].verDefinicionBase===1};
}
module.exports = function ({app, conectar, soloLocal}) {
  app.get('/api/menu-admin/estructura', soloLocal, async (req, res) => {
    try {
      const db = await conectar();
      const data = await inspeccionar(db.request());
      res.json({correcto: true, soloLectura: true, fecha: new Date().toISOString(), ...data,
        completo: data.entorno[0]?.verDefinicionBase === 1,
        nota: 'Revisar metadatos y un ejemplo real de modificadores antes de habilitar nuevas escrituras.'});
    } catch (e) {res.status(503).json({correcto: false, error: e.message});}
  });
};
module.exports.consulta = consulta;
module.exports.inspeccionar = inspeccionar;
