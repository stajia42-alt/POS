'use strict';
// El guardado antiguo no puede saltarse el contrato y la confirmación por lote.
module.exports = function ({app}) {
  app.use(['/api/menu-admin', '/api/menu-ia'], (req, res, next) => {
    if (req.auth?.user?.role !== 'dueno') return res.status(403).json({correcto:false,error:'La administración del menú requiere permiso de dueño.'});
    if (!['GET','HEAD'].includes(req.method)) {
      let validOrigin = true;
      try {if (req.headers.origin) validOrigin = new URL(req.headers.origin).host === req.headers.host;} catch {validOrigin = false;}
      if (!validOrigin || req.headers['x-csrf-token'] !== req.auth.nonce)
        return res.status(403).json({correcto:false,error:'Sesión de edición no válida. Recarga la página.'});
    }
    next();
  });
  for (const route of ['/api/menu-admin/guardar','/api/menu-admin/ensayo'])
    app.post(route, (req, res) => res.status(409).json({correcto:false,guardado:false,codigo:'ESTRUCTURA_PENDIENTE',
      error:'Usa Revisar importación en el estudio de menú. El guardado antiguo no valida la estructura ni confirma un lote completo.',
      diagnostico:'/api/menu-admin/estructura'}));
};
