-- Restaurante 9.2 / Aviles Tecnologías. Ejecutar en la base del negocio.
-- Sólo metadatos: no consulta ventas, contraseñas ni registros del catálogo.
-- SQL Server 2014. Guardar TODOS los conjuntos de resultados.
-- Si verDefinicionBase es 0 o NULL, el diagnóstico puede estar incompleto.

-- resultado: entorno
SELECT DB_NAME() AS baseDatos, CONVERT(nvarchar(128), SERVERPROPERTY('ProductVersion')) AS versionSQL,
       CONVERT(nvarchar(128), SERVERPROPERTY('ServerName')) AS servidorSQL, DB_ID() AS idBase,
       create_date AS creacionBase,
       compatibility_level AS compatibilidad, collation_name AS intercalacion,
       HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'VIEW DEFINITION') AS verDefinicionBase
FROM sys.databases WHERE name = DB_NAME();

-- resultado: tablas
SELECT s.name AS esquema, t.name AS tabla, t.object_id AS objeto,
       HAS_PERMS_BY_NAME(QUOTENAME(s.name)+'.'+QUOTENAME(t.name),'OBJECT','SELECT') AS puedeLeer,
       HAS_PERMS_BY_NAME(QUOTENAME(s.name)+'.'+QUOTENAME(t.name),'OBJECT','INSERT') AS puedeInsertar
FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
WHERE t.is_ms_shipped=0 ORDER BY s.name,t.name;

-- resultado: columnas
SELECT s.name AS esquema,t.name AS tabla,c.column_id AS orden,c.name AS columna,
       ty.name AS tipo,c.max_length AS longitudBytes,c.precision AS [precision],c.scale AS escala,
       c.is_nullable AS admiteNulo,c.is_identity AS identidad,c.is_computed AS calculada,
       c.collation_name AS intercalacion,dc.definition AS valorDefecto,cc.definition AS expresionCalculada
FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
JOIN sys.columns c ON c.object_id=t.object_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id
LEFT JOIN sys.default_constraints dc ON dc.object_id=c.default_object_id
LEFT JOIN sys.computed_columns cc ON cc.object_id=c.object_id AND cc.column_id=c.column_id
WHERE t.is_ms_shipped=0 ORDER BY s.name,t.name,c.column_id;

-- resultado: indices
SELECT s.name AS esquema,t.name AS tabla,i.name AS indice,i.is_primary_key AS primaria,
       i.is_unique AS unico,i.is_unique_constraint AS restriccionUnica,i.is_disabled AS deshabilitado,
       i.has_filter AS filtrado,i.filter_definition AS filtro,ic.key_ordinal AS orden,
       ic.is_included_column AS incluida,c.name AS columna
FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
JOIN sys.indexes i ON i.object_id=t.object_id
JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id
JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
WHERE t.is_ms_shipped=0 AND i.is_hypothetical=0 ORDER BY s.name,t.name,i.name,ic.key_ordinal,ic.index_column_id;

-- resultado: relaciones
SELECT fk.name AS relacion,ps.name AS esquemaOrigen,pt.name AS tablaOrigen,pc.name AS columnaOrigen,
       rs.name AS esquemaDestino,rt.name AS tablaDestino,rc.name AS columnaDestino,
       fkc.constraint_column_id AS orden,fk.is_disabled AS deshabilitada,fk.is_not_trusted AS noVerificada,
       fk.delete_referential_action_desc AS alBorrar,fk.update_referential_action_desc AS alActualizar
FROM sys.foreign_keys fk JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id=fk.object_id
JOIN sys.tables pt ON pt.object_id=fkc.parent_object_id JOIN sys.schemas ps ON ps.schema_id=pt.schema_id
JOIN sys.columns pc ON pc.object_id=pt.object_id AND pc.column_id=fkc.parent_column_id
JOIN sys.tables rt ON rt.object_id=fkc.referenced_object_id JOIN sys.schemas rs ON rs.schema_id=rt.schema_id
JOIN sys.columns rc ON rc.object_id=rt.object_id AND rc.column_id=fkc.referenced_column_id
ORDER BY ps.name,pt.name,fk.name,fkc.constraint_column_id;

-- resultado: comprobaciones
SELECT s.name AS esquema,t.name AS tabla,ck.name AS nombre,ck.definition AS definicion,
       ck.is_disabled AS deshabilitada,ck.is_not_trusted AS noVerificada
FROM sys.check_constraints ck JOIN sys.tables t ON t.object_id=ck.parent_object_id
JOIN sys.schemas s ON s.schema_id=t.schema_id ORDER BY s.name,t.name,ck.name;

-- resultado: disparadores
SELECT s.name AS esquema,t.name AS tabla,tr.name AS nombre,tr.is_disabled AS deshabilitado,
       tr.is_instead_of_trigger AS enLugarDe,OBJECT_DEFINITION(tr.object_id) AS definicion
FROM sys.triggers tr JOIN sys.tables t ON t.object_id=tr.parent_id
JOIN sys.schemas s ON s.schema_id=t.schema_id ORDER BY s.name,t.name,tr.name;

-- La ausencia de claves foráneas NO demuestra que no haya relaciones lógicas.
-- Para modificadores también hace falta comparar un producto configurado en Soft Restaurant.
