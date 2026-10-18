'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {consultarEnSerie}=require('../menu_operaciones');

test('peticiones mssql en la misma transacción deben correr EN SERIE (EREQINPROG)', async ()=>{
 let activa=false,orden=[];
 const query=async nombre=>{
   if(activa){const e=new Error('Requests can only be made in the LoggedIn state, not the SentClientRequest state');e.code='EREQINPROG';throw e;}
   activa=true;orden.push('inicia '+nombre);
   await new Promise(ok=>setTimeout(ok,4));
   orden.push('termina '+nombre);activa=false;
   return nombre;
 };
 const [a,b]=await consultarEnSerie([()=>query('grupos'),()=>query('referencia')]);
 assert.deepEqual([a,b],['grupos','referencia']);
 assert.deepEqual(orden,['inicia grupos','termina grupos','inicia referencia','termina referencia']);
});
