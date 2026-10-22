'use strict';
// Cola RAW de una sola escritura, con proceso PowerShell persistente.
// No reintentar automáticamente trabajos cuyo envío podría haberse completado.
const {spawn,execFile}=require('node:child_process');
const path=require('node:path'),fs=require('node:fs'),os=require('node:os');
class PersistentSpooler {
 constructor(options={}){
  this.workerPath=options.workerPath||process.env.PARKING_PRINT_WORKER||path.join(__dirname,'..','print-worker.ps1');
  this.spawn=options.spawn||spawn;
  this.process=null;this.readyPromise=null;this.ready=false;this.startError=null;
  this.queue=[];this.busy=null;this.nextId=0;this.stderr='';this.buffer='';this.closed=false;
 }
 warm(){return this._start().catch(()=>false);}
 _start(){
  if(this.closed)return Promise.reject(Error('Impresora detenida'));
  if(this.ready)return Promise.resolve(true);
  if(this.readyPromise)return this.readyPromise;
  this.readyPromise=new Promise((resolve,reject)=>{
   const child=this.spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',this.workerPath],{windowsHide:true,stdio:['pipe','pipe','pipe']});
   this.process=child;this.stderr='';this.buffer='';
   let initialized=false;
   const timeout=setTimeout(()=>failStart(Error('El servicio de impresión tardó demasiado en iniciar')),12000);
   timeout.unref?.();
   const failStart=e=>{
    if(initialized)return;
    initialized=true;clearTimeout(timeout);
    this.ready=false;this.startError=e;
    try{child.kill()}catch(_){}
    reject(e);
   };
   child.stdout.setEncoding('utf8');
   child.stdout.on('data',chunk=>{
    if(this.process!==child)return;
    this.buffer+=chunk;
    while(this.buffer.includes('\n')){
     const i=this.buffer.indexOf('\n');const line=this.buffer.slice(0,i).replace(/\r$/,'');this.buffer=this.buffer.slice(i+1);
     if(line==='READY'&&!initialized){initialized=true;clearTimeout(timeout);this.ready=true;this.startError=null;resolve(true);this._next();continue;}
     if(line.startsWith('STARTERR')&&!initialized){failStart(Error('No se pudo iniciar servicio de impresión: '+line.slice(9)));continue;}
     this._reply(line);
    }
   });
   child.stderr.setEncoding('utf8');child.stderr.on('data',x=>{if(this.process===child)this.stderr=(this.stderr+x).slice(-1200)});
   child.on('error',e=>{failStart(e);this._crash(e,child)});
   child.on('exit',(code)=>{const err=Error('El servicio de impresión terminó ('+code+'). '+this.stderr);failStart(err);this._crash(err,child)});
  }).catch(e=>{this.readyPromise=null;throw e});
  return this.readyPromise;
 }
 _reply(line){
  const [status,id,...tail]=line.split('\t');
  if(!this.busy||id!==String(this.busy.id))return;
  const job=this.busy;this.busy=null;clearTimeout(job.timer);
  if(status==='OK')job.resolve();else job.reject(Error(tail.join(' ').slice(0,600)||'No se pudo enviar el boleto'));
  this._next();
 }
 _next(){
  if(!this.ready||this.busy||!this.queue.length)return;
  const job=this.queue.shift();this.busy=job;
  const child=this.process;
  job.timer=setTimeout(()=>this._crash(Error('No se recibió confirmación de envío a Windows (posible impresión: comprueba la impresora antes de reimprimir)'),child),25000);
  const line=JSON.stringify({id:String(job.id),printer:job.printer,payload:job.payload.toString('base64')})+'\n';
  try{child.stdin.write(line,'utf8',e=>{if(e)this._crash(e,child)})}catch(e){this._crash(e,child)}
 }
 _crash(error,child=this.process){
  // A terminated worker may emit its final exit event after a new worker has
  // started. It must not reject that worker's jobs or kill the replacement.
  if(child!==this.process)return;
  this.ready=false;this.readyPromise=null;
  if(this.busy){clearTimeout(this.busy.timer);this.busy.reject(error);this.busy=null;}
  while(this.queue.length)this.queue.shift().reject(error);
  if(this.process){try{this.process.kill()}catch(_){}this.process=null;}
 }
 async send(printer,payload){
  if(this.closed)throw Error('Impresora detenida');
  if(!printer)throw Error('Configura la impresora');
  if(!Buffer.isBuffer(payload)||payload.length<5||payload.length>131072)throw Error('Boleto ESC/POS inválido');
  // If warm-up has not completed, a cold print waits once here.
  try {await this._start();}
  catch(e){if(this.closed)throw e;return fallbackPrint(printer,payload,e);}
  if(this.closed)throw Error('Impresora detenida');
  if(!this.ready||!this.process)throw Error('El servicio de impresión se interrumpió antes de enviar el trabajo');
  return new Promise((resolve,reject)=>{this.queue.push({id:++this.nextId,printer,payload,resolve,reject,timer:null});this._next()});
 }
 close(){this.closed=true;this._crash(Error('Aplicación cerrada'));}
}
async function fallbackPrint(printer,payload,workerError){
 // Fallback only if the worker failed to initialize, BEFORE a job was sent.
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'parking-raw-'));
 try{
  const filename=path.join(folder,'ticket.raw');fs.writeFileSync(filename,payload);
  const script=process.env.PARKING_PRINT_SCRIPT||path.join(__dirname,'..','print-raw.ps1');
  await new Promise((ok,fail)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-PrinterName',printer,'-PayloadFile',filename],{windowsHide:true,timeout:25000},(e,stdout,stderr)=>e?fail(Error((stderr||e.message||workerError?.message).trim())):ok()));
 } finally{fs.rmSync(folder,{recursive:true,force:true})}
}
const shared=new PersistentSpooler();
module.exports={PersistentSpooler,shared};
