const fs=require('fs'),r=require('../reportes').internals;
const f=r.normalize({desde:'2026-10-07',hasta:'2026-10-07'}),cases={};
for(const type of Object.keys(r.cols))cases[type]={sql:r.reportQuery(type,f),f};
cases.turno={sql:r.reportQuery('cortes',{...f,periodo:'todo'}),f};
cases.turnoAccounts={sql:r.reportQuery('cuentas',{...f,turno:'i:10',estado:'pagadas'}),f:{...f,turno:'i:10'}};
cases.summary={sql:r.buildScope(f).cte+' SELECT COUNT(*) cuentas,SUM(c.total) total FROM Cuentas c WHERE c.pagado=1 AND c.cancelado=0',f};
cases.byOpening={sql:r.reportQuery('servicios',{...f,fechaCampo:'fecha'}),f};
cases.operational={sql:r.reportQuery('servicios',{...f,jornada:true,minuto:240,horaInicio:'04:00'}),f:{...f,minuto:240}};
fs.writeFileSync(process.argv[2]||'/tmp/restaurante-sql-cases/queries.json',JSON.stringify(cases));
