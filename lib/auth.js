'use strict';
const crypto=require('crypto');
const hashToken=t=>crypto.createHash('sha256').update(t).digest('hex');
function passwordHash(password){if(typeof password!=='string'||password.length<4||password.length>128)throw Error('Usa un PIN o contraseña de 4 a 128 caracteres');const salt=crypto.randomBytes(16).toString('hex');return salt+':'+crypto.scryptSync(password,salt,64).toString('hex');}
function verify(password,stored){if(typeof password!=='string'||password.length>128||typeof stored!=='string')return false;const [salt,key]=stored.split(':');if(!salt||!key||!/^[0-9a-f]{128}$/i.test(key))return false;const actual=crypto.scryptSync(password,salt,64),expected=Buffer.from(key,'hex');return actual.length===expected.length&&crypto.timingSafeEqual(actual,expected);}
function installAuth(app,db,audit){
 const failures=new Map();
 app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store');if(req.method!=='GET'&&req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host)return res.status(403).json({error:'Origen no permitido'});}catch{return res.status(403).json({error:'Origen inválido'});}}next();});
 app.get('/api/auth/status',(req,res)=>res.json({setupRequired:!db.prepare('SELECT id FROM users LIMIT 1').get()}));
 function startSession(res,u){const token=crypto.randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hashToken(token),u.id,new Date(Date.now()+12*3600000).toISOString());res.cookie('parking_session',token,{httpOnly:true,sameSite:'strict',path:'/',maxAge:12*3600000});return {id:u.id,username:u.username,role:u.role};}
 const wrapper=f=>(req,res,next)=>{try{f(req,res);}catch(e){next(e);}};
 app.post('/api/auth/setup',wrapper((req,res)=>{
  const u=db.transaction(()=>{if(db.prepare('SELECT id FROM users LIMIT 1').get())throw Error('El administrador ya fue configurado');const username=validUsername(req.body.username),hash=passwordHash(req.body.password);const id=db.prepare('INSERT INTO users(username,password_hash,role,created_at) VALUES(?,?,?,?)').run(username,hash,'admin',new Date().toISOString()).lastInsertRowid;audit(null,'ADMIN_SETUP',{username},id);return db.prepare('SELECT * FROM users WHERE id=?').get(id);}).immediate();res.status(201).json({user:startSession(res,u)});
 }));
 app.post('/api/auth/login',wrapper((req,res)=>{
  const key=req.ip,attempt=failures.get(key);if(attempt&&attempt.count>=8&&attempt.until>Date.now())return res.status(429).json({error:'Demasiados intentos. Espera 10 minutos.'});
  const u=db.prepare('SELECT * FROM users WHERE username=? AND active=1').get(String(req.body.username||''));
  if(!u||!verify(req.body.password,u.password_hash)){const n=attempt&&attempt.until>Date.now()?attempt.count+1:1;failures.set(key,{count:n,until:Date.now()+600000});return res.status(401).json({error:'Usuario o contraseña incorrectos'});}
  failures.delete(key);res.json({user:startSession(res,u)});
 }));
 app.use('/api',(req,res,next)=>{
  const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('parking_session='))?.slice(16);
  const u=token&&db.prepare('SELECT u.id,u.username,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1').get(hashToken(token),new Date().toISOString());
  if(!u)return res.status(401).json({error:'Inicia sesión'});req.user=u;req.sessionHash=hashToken(token);next();
 });
 app.get('/api/auth/me',(req,res)=>res.json({user:req.user}));
 app.post('/api/auth/logout',(req,res)=>{db.prepare('DELETE FROM sessions WHERE token_hash=?').run(req.sessionHash);res.clearCookie('parking_session',{path:'/'});res.json({ok:true});});
 app.post('/api/auth/password',wrapper((req,res)=>{const u=db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);if(!verify(req.body.current_password,u.password_hash))throw Error('Contraseña actual incorrecta');const hash=passwordHash(req.body.password);db.transaction(()=>{db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash,u.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);audit(null,'PASSWORD_CHANGED',{},u.id);})();res.clearCookie('parking_session',{path:'/'});res.json({ok:true});}));
 return {allow:(...roles)=>(req,res,next)=>roles.includes(req.user.role)?next():res.status(403).json({error:'Tu usuario no tiene permiso para esta operación'}),verify};
}
function validUsername(v){if(typeof v!=='string'||!/^[a-zA-Z0-9_.-]{3,40}$/.test(v))throw Error('Usuario: 3 a 40 letras, números, punto, guion o guion bajo');return v;}
module.exports={installAuth,passwordHash,verify,validUsername};
