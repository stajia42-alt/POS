"""Optional data-semantic regression: pip install sqlglot duckdb.
Runs generated T-SQL translated to DuckDB, not a SQL Server certification.
Usage: python tests/sql_fixtures.py <schema-diagnostic.json> <queries.json>
"""
import json,sys,re
import duckdb,sqlglot
schema=json.load(open(sys.argv[1]))['columnas'];queries=json.load(open(sys.argv[2]));db=duckdb.connect()
names=['cheques','tempcheques','cheqdet','tempcheqdet','chequespagos','tempchequespagos','turnos','vwrepproductosvendidoscheques','vwrepproductosvendidostempcheques','productos','grupos','meseros','formasdepago','cancela']
for name in names:
 cols=[c for c in schema if c['tabla'].lower()==name]
 assert cols,name
 def dtype(c):
  t=c['tipo'];return 'TIMESTAMP' if t in ['datetime','smalldatetime'] else 'DOUBLE' if t in ['numeric','money','decimal','float','real'] else 'BIGINT' if t in ['bigint','int','smallint','tinyint','bit'] else 'VARCHAR'
 db.execute('CREATE TABLE '+name+' ('+','.join('"'+c['columna']+'" '+dtype(c) for c in cols)+')')
def insert(table,**v):db.execute('INSERT INTO '+table+' ('+','.join(v)+') VALUES ('+','.join('?' for _ in v)+')',list(v.values()))
insert('turnos',idturnointerno=10,idturno=10,idempresa='01',apertura='2026-10-07 08:00:00',cajero='Caja',fondo=100)
insert('productos',idproducto='P1',descripcion='Producto de prueba',idgrupo='G1')
insert('grupos',idgrupo='G1',descripcion='Atún Urbano')
insert('meseros',idmesero='M1',nombre='Mesero de prueba')
insert('formasdepago',idformadepago='EF',descripcion='Efectivo')
def account(table,folio,total,paid=1,canceled=0,linked=None):
 values=dict(folio=folio,numcheque=folio,fecha='2026-10-07 12:00:00',cierre='2026-10-07 12:30:00' if paid else None,mesa='1',idmesero='M1',pagado=paid,cancelado=canceled,idempresa='01',tipodeservicio=1,idturno=10,total=total,propina=0,totaldescuentos=0,totalcortesias=0,totalarticulos=1,propinapagada=0)
 if table=='cheques':values['foliotempcheques']=linked
 insert(table,**values)
def detail(temp,folio,foliodet,total):
 insert('tempcheqdet' if temp else 'cheqdet',foliodet=foliodet,movimiento=1,cantidad=1,idproducto='P1',precio=total,idmeseroproducto='M1')
 insert('vwrepproductosvendidostempcheques' if temp else 'vwrepproductosvendidoscheques',folio=folio,foliodet=foliodet)
 insert('tempchequespagos' if temp else 'chequespagos',folio=folio,idformadepago='EF',importe=total,propina=0)
account('cheques',100,100,linked=9);detail(False,100,101,100)
account('tempcheques',9,100);detail(True,9,109,100)
account('tempcheques',1,200);detail(True,1,101,200)
account('tempcheques',100,30);detail(True,100,110,30)
account('tempcheques',2,50,paid=0);detail(True,2,102,50)
account('tempcheques',3,40,canceled=1);detail(True,3,103,40)
db.execute('UPDATE tempcheques SET propina=20,totaldescuentos=5 WHERE folio=1')
db.execute('UPDATE tempchequespagos SET propina=20 WHERE folio=1')
insert('cancela',foliocheque=1,fecha='2026-10-07 12:15:00',clave='P1',cantidad=1,precio=10,usuario='Caja',idturno_cierre=10)
insert('cancela',foliocheque=800,fecha='2026-10-07 12:15:00',clave='P1',cantidad=1,precio=12,usuario='Caja',idturno_cierre=10)
def execute(name):
 case=queries[name];q=case['sql'];f=case['f'];f={**f,'minuto':f.get('minuto',0),'importe':0}
 def bind(m):
  v=f.get(m[1],'');return str(v) if isinstance(v,(int,float)) else "'"+str(v).replace("'","''")+"'"
 q=re.sub(r'@(\w+)',bind,q)
 q=q.replace("CONVERT(datetime2,'2026-10-07')","CAST('2026-10-07' AS DATETIME2)")
 transpiled=sqlglot.transpile(q,read='tsql',write='duckdb')[0]
 # sqlglot emits OUTER APPLY as LEFT JOIN LATERAL without DuckDB's required ON TRUE.
 for alias in ['tr','cv','pp','enlace']:transpiled=re.sub(r'\) AS '+alias+r'\b',') AS '+alias+' ON TRUE',transpiled)
 try:
  result=db.execute(transpiled);return [dict(zip([c[0] for c in result.description],row)) for row in result.fetchall()]
 except Exception:
  open('/tmp/restaurante-failed-query.sql','w').write(transpiled);raise
for name in queries:
 result=execute(name)
 if name in ['summary','servicios','catalogos','productos','meseros','pagos','diario']:assert round(sum(r['total'] or 0 for r in result),2)==330,(name,result)
 if name=='ventas':assert sum(r['importe'] for r in result)==330,result
 if name=='cancelados':assert len(result)==2 and sum(r['total'] for r in result)==22,result
 if name=='propinas':assert sum(r['total'] for r in result)==20 and sum(r['otros'] for r in result)==20,result
 if name=='descuentos':assert len(result)==1 and result[0]['descuentos']==5,result
 if name=='abiertas':assert len(result)==1 and result[0]['total']==50,result
 if name=='cancelaciones':assert len(result)==1 and result[0]['total']==40,result
 if name in ['turno','cortes']:assert sum(r['venta'] for r in result)==330,result
 if name=='turnoAccounts':assert len(result)==3,result
 print('PASS',name)
# Copy working paid account to history before cleanup: counted once, detail/payment preserved.
account('cheques',201,200,linked=1);detail(False,201,201,200)
for name in ['summary','servicios','meseros','productos','catalogos','pagos','diario']:
 assert sum(r['total'] for r in execute(name))==330,name
assert sum(r['importe'] for r in execute('ventas'))==330
# Remove working copy after closing: total remains identical.
for table in ['tempcheques','tempchequespagos']:db.execute('DELETE FROM '+table+' WHERE folio=1')
db.execute('DELETE FROM tempcheqdet WHERE foliodet=101');db.execute('DELETE FROM vwrepproductosvendidostempcheques WHERE folio=1')
assert execute('summary')[0]['total']==330
# Numeric/internal collisions must not silently attribute one account to two cuts.
insert('turnos',idturnointerno=99,idturno=10,idempresa='01',apertura='2026-10-07 09:00:00')
assert all(r['venta']==0 for r in execute('turno'))
assert execute('summary')[0]['total']==330
print('PASS transitions before/during/after close, source namespaces and ambiguous turns')

account('cheques',500,70)
db.execute("UPDATE cheques SET fecha='2026-10-06 23:00:00',cierre='2026-10-07 02:00:00' WHERE folio=500")
assert execute('summary')[0]['total']==400
assert sum(r['total'] for r in execute('byOpening'))==330
assert sum(r['total'] for r in execute('operational'))==330
print('PASS overnight paid date and 04:00 business-day boundary')
