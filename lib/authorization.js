'use strict';
const {verify}=require('./auth');

// Authorize this action only. The cashier keeps their own session and audit identity.
function createAdminAuthorizer(db){
 const failures=new Map();
 return function authorizeAdmin(req){
  if(req.user.role==='admin')return req.user;
  const current=Date.now(),prior=failures.get(req.user.id);
  const denied=message=>{const error=Error(message);error.status=403;throw error;};
  if(prior&&prior.until>current&&prior.count>=8)denied('Demasiados intentos de autorización. Espera 10 minutos.');
  const authorizer=db.prepare("SELECT id,username,role,password_hash FROM users WHERE username=? AND active=1 AND role='admin'").get(String(req.body.authorization_username||''));
  if(!authorizer||!verify(req.body.authorization_password??req.body.authorization_pin,authorizer.password_hash)){
   failures.set(req.user.id,{count:prior&&prior.until>current?prior.count+1:1,until:current+600000});
   denied('Requiere autorización del administrador con su usuario y PIN.');
  }
  failures.delete(req.user.id);
  return {id:authorizer.id,username:authorizer.username,role:authorizer.role};
 };
}
module.exports={createAdminAuthorizer};
