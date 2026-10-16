import { createHash, timingSafeEqual } from 'node:crypto';
const digest=value=>createHash('sha256').update(value).digest();
export function authentication(env=process.env){
 const required=env.REQUIRE_AUTH==='true'||env.REQUIRE_AUTH==='1';
 const username=env.APP_USERNAME,password=env.APP_PASSWORD;
 if(required&&(!username||!password||password.length<16))throw Error('Für Hosting sind APP_USERNAME und APP_PASSWORD (mindestens 16 Zeichen) erforderlich');
 if((username&&!password)||(!username&&password))throw Error('APP_USERNAME und APP_PASSWORD müssen gemeinsam gesetzt sein');
 if(!username&&!password)return (req,res,next)=>next();
 return (req,res,next)=>{
   if(req.method==='GET'&&req.path==='/api/health')return next();
   const header=req.headers.authorization||'';
   let user='',pass='';
   if(header.startsWith('Basic ')){const decoded=Buffer.from(header.slice(6),'base64').toString('utf8');const i=decoded.indexOf(':');if(i>=0){user=decoded.slice(0,i);pass=decoded.slice(i+1);}}
   const userOK=timingSafeEqual(digest(user),digest(username));
   const passOK=timingSafeEqual(digest(pass),digest(password));
   if(userOK&&passOK)return next();
   res.setHeader('WWW-Authenticate','Basic realm="ExternPlan", charset="UTF-8"');res.setHeader('Cache-Control','no-store');return res.status(401).send('Anmeldung erforderlich');
 };
}
