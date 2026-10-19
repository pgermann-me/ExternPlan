import {randomBytes,randomUUID,createHash,timingSafeEqual,scrypt as scryptCallback} from 'node:crypto';
import {promisify} from 'node:util';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {validateAccessScope} from './access-scope.js';
import {actorContext,accessContext} from './request-context.js';
const scrypt=promisify(scryptCallback),hash=value=>createHash('sha256').update(value).digest('hex');
export const roleViews={admin:['planning','person-planning','pikett-list','people','favorites','master','imports','exports','audit','users'],planner:['planning','person-planning','pikett-list','people','favorites'],user:['planning','person-planning','pikett-list']};
const publicUser=u=>u?{access_scope:JSON.parse(u.access_scope||'{}'),...Object.fromEntries(['id','first_name','last_name','email','role','active','revision','must_change_password'].map(k=>[k,['active','must_change_password'].includes(k)?!!u[k]:u[k]]))}:null;
const fail=(message,status=400)=>{const error=Error(message);error.status=status;throw error;};
const passwordValid=value=>{if(typeof value!=='string'||value.length<12||value.length>256)fail('Das Passwort benötigt 12 bis 256 Zeichen');return value;};
const fields=input=>{const out={};for(const key of ['first_name','last_name','email']){if(typeof input[key]!=='string'||!input[key].trim()||input[key].length>(key==='email'?254:100))fail('Vorname, Name und gültige E-Mail-Adresse sind erforderlich');out[key]=input[key].trim();}out.email=out.email.toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email))fail('Gültige E-Mail-Adresse erforderlich');if(!Object.hasOwn(roleViews,input.role))fail('Ungültige Rolle');out.role=input.role;if(input.active!==undefined&&typeof input.active!=='boolean')fail('Zugriffsstatus muss aktiv oder inaktiv sein');out.active=input.active!==false?1:0;return out;};
async function passwordHash(password){const salt=randomBytes(16).toString('hex');return {password_salt:salt,password_hash:(await scrypt(passwordValid(password),salt,64)).toString('hex')};}
async function verifyPassword(password,user){if(typeof password!=='string'||password.length>256)return false;const value=await scrypt(password,user?.password_salt||'externplan-login-dummy-salt',64);return !!user&&timingSafeEqual(value,Buffer.from(user.password_hash,'hex'));}
export function permitted(role,method,path){
 if(!Object.hasOwn(roleViews,role))return false;
 if(role==='admin')return true;
 if(method==='GET'&&['/api/state','/api/month','/api/person-month','/api/pikett-list','/api/swiss-time'].includes(path))return true;
 if(method==='POST'&&(path==='/api/planning/undo'||/^\/api\/assignments(?:\/[^/]+(?:\/transfer)?)?$/.test(path)||/^\/api\/favorites\/[^/]+\/(preview|apply)$/.test(path)))return true;
 if(['PUT','DELETE'].includes(method)&&/^\/api\/assignments\/[^/]+$/.test(path))return true;
 return role==='planner'&&(['POST','PUT','DELETE'].includes(method)&&(/^\/api\/people(?:\/[^/]+(?:\/groups)?)?$/.test(path)||/^\/api\/favorites(?:\/[^/]+)?$/.test(path)));
}
export function installAccounts(app,db,{env=process.env,dataDir,recordAudit,getState}){
 db.exec(`CREATE TABLE IF NOT EXISTS app_users (id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,first_name TEXT NOT NULL,last_name TEXT NOT NULL,role TEXT NOT NULL,active INTEGER NOT NULL,revision INTEGER NOT NULL,password_hash TEXT NOT NULL,password_salt TEXT NOT NULL,must_change_password INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS app_sessions (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at INTEGER NOT NULL);CREATE INDEX IF NOT EXISTS app_sessions_user ON app_sessions(user_id);`);
 if(!db.prepare('PRAGMA table_info(app_users)').all().some(c=>c.name==='access_scope'))db.exec("ALTER TABLE app_users ADD COLUMN access_scope TEXT NOT NULL DEFAULT '{}'");
 const scopeField=(input,role,previous)=>JSON.stringify(validateAccessScope(getState(),input===undefined?JSON.parse(previous||'{}'):input,role));
 const users=()=>db.prepare('SELECT * FROM app_users ORDER BY last_name,first_name').all(),find=id=>db.prepare('SELECT * FROM app_users WHERE id=?').get(id);
 const testBypass=env.NODE_ENV==='test'&&env.EXTERNPLAN_AUTH_TEST_BYPASS!=='0'&&!env.APP_PASSWORD&&!users().length;
 let setupSecret=env.APP_PASSWORD;
 if(!users().length&&!testBypass){
  if((env.REQUIRE_AUTH==='true'||env.REQUIRE_AUTH==='1')&&(!setupSecret||setupSecret.length<16))throw Error('Für die erste Einrichtung ist APP_PASSWORD mit mindestens 16 Zeichen erforderlich');
  if(!setupSecret){const path=resolve(dataDir,'setup-token.txt');if(!existsSync(path))writeFileSync(path,randomBytes(32).toString('hex'),{mode:0o600,flag:'wx'});setupSecret=readFileSync(path,'utf8').trim();console.log('Ersten Administrator mit dem Einrichtungsschlüssel aus '+path+' anlegen.');}
 }
 const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}};
 const token=req=>{const match=(req.headers.cookie||'').match(/(?:^|;\s*)externplan_session=([a-f0-9]{64})(?:;|$)/);return match?.[1];};
 const session=req=>{const value=token(req);if(!value)return null;const record=db.prepare('SELECT u.*,s.expires_at FROM app_sessions s JOIN app_users u ON u.id=s.user_id WHERE s.token_hash=?').get(hash(value));return record?.active&&record.expires_at>Date.now()?record:null;};
 const cookieOptions=req=>({httpOnly:true,sameSite:'strict',secure:req.secure,path:'/',maxAge:12*60*60*1000});
 const createSession=(req,res,user)=>{const value=randomBytes(32).toString('hex');db.prepare('DELETE FROM app_sessions WHERE expires_at<=?').run(Date.now());db.prepare('INSERT INTO app_sessions VALUES(?,?,?)').run(hash(value),user.id,Date.now()+12*60*60*1000);res.cookie('externplan_session',value,cookieOptions(req));};
 const invalidate=id=>db.prepare('DELETE FROM app_sessions WHERE user_id=?').run(id);
 const save=(u)=>{db.prepare(`INSERT INTO app_users (id,email,first_name,last_name,role,active,revision,password_hash,password_salt,must_change_password,access_scope) VALUES (@id,@email,@first_name,@last_name,@role,@active,@revision,@password_hash,@password_salt,@must_change_password,@access_scope) ON CONFLICT(id) DO UPDATE SET email=excluded.email,first_name=excluded.first_name,last_name=excluded.last_name,role=excluded.role,active=excluded.active,revision=excluded.revision,password_hash=excluded.password_hash,password_salt=excluded.password_salt,must_change_password=excluded.must_change_password,access_scope=excluded.access_scope`).run(u);};
 const uniqueEmail=(email,id)=>{if(db.prepare('SELECT id FROM app_users WHERE email=? AND id<>?').get(email,id||''))fail('Diese E-Mail-Adresse wird bereits verwendet');};
 const guardLastAdmin=(before,after)=>{if(before.role==='admin'&&before.active&&(!after||after.role!=='admin'||!after.active)&&db.prepare("SELECT COUNT(*) AS n FROM app_users WHERE role='admin' AND active=1").get().n<=1)fail('Der letzte aktive Admin kann nicht gelöscht, deaktiviert oder zurückgestuft werden');};
 const attempts=new Map();
 const throttle=req=>{const key=req.ip||'unknown',now=Date.now(),entry=attempts.get(key);if(entry&&entry.until>now&&entry.failures>=15)fail('Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen',429);attempts.set(key,entry&&entry.until>now?{...entry,failures:entry.failures+1}:{failures:1,until:now+15*60*1000});if(attempts.size>10000)for(const [id,e] of attempts)if(e.until<now)attempts.delete(id);return key;};
 app.use('/api',(req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
 app.get('/api/auth/session',(req,res)=>{const user=session(req)||(testBypass?{id:'test-admin',first_name:'Test',last_name:'Admin',email:'test@example.invalid',role:'admin',active:1,must_change_password:0,revision:1}:null);res.json({user:publicUser(user),needs_setup:!testBypass&&!users().length,setup_source:env.APP_PASSWORD?'existing_password':'setup_token'});});
 app.post('/api/auth/setup',async(req,res)=>{
  const key=throttle(req);if(users().length||testBypass)fail('Die Ersteinrichtung wurde bereits abgeschlossen',409);
  if(typeof req.body.setup_secret!=='string'||!timingSafeEqual(Buffer.from(hash(req.body.setup_secret)),Buffer.from(hash(setupSecret)))){fail('Einrichtungsschlüssel oder bisheriges Zugangspasswort ist falsch',401);}
  const values=fields({...req.body,role:'admin',active:true}),password=await passwordHash(req.body.password);
  const user={id:randomUUID(),...values,...password,access_scope:scopeField(req.body.access_scope,values.role),revision:1,must_change_password:0};
  transaction(()=>{if(users().length)fail('Die Ersteinrichtung wurde bereits abgeschlossen',409);save(user);recordAudit('create',null,publicUser(user),user.email);});attempts.delete(key);createSession(req,res,user);res.json({user:publicUser(user)});
 });
 app.post('/api/auth/login',async(req,res)=>{
  const key=throttle(req),email=typeof req.body.email==='string'?req.body.email.trim().toLowerCase():'',user=db.prepare('SELECT * FROM app_users WHERE email=?').get(email);
  if(!await verifyPassword(req.body.password,user)||!user?.active){fail('E-Mail-Adresse oder Passwort ist falsch',401);}
  const current=find(user.id);if(!current?.active||current.revision!==user.revision)fail('E-Mail-Adresse oder Passwort ist falsch',401);attempts.delete(key);createSession(req,res,current);res.json({user:publicUser(current)});
 });
 app.post('/api/auth/logout',(req,res)=>{const value=token(req);if(value)db.prepare('DELETE FROM app_sessions WHERE token_hash=?').run(hash(value));res.clearCookie('externplan_session',{...cookieOptions(req),maxAge:undefined});res.json({ok:true});});
 app.post('/api/auth/password',async(req,res)=>{
  const key=throttle(req),user=session(req);if(!user)fail('Anmeldung erforderlich',401);
  if(!await verifyPassword(req.body.current_password,user)){fail('Das aktuelle Passwort ist falsch',401);}
  if(req.body.password===req.body.current_password)fail('Bitte ein neues Passwort wählen');
  const password=await passwordHash(req.body.password);
  const updated=transaction(()=>{const current=find(user.id);if(!current||current.revision!==user.revision||!current.active)fail('Benutzerzugang wurde inzwischen geändert. Bitte erneut anmelden',409);const updated={...current,...password,must_change_password:0,revision:current.revision+1};save(updated);invalidate(user.id);recordAudit('password',publicUser(current),publicUser(updated),user.email);return updated;});
  attempts.delete(key);createSession(req,res,updated);res.json({user:publicUser(updated)});
 });
 app.use((req,res,next)=>{
  if(req.path==='/api/health'||req.path==='/login.html'||req.path==='/login.js'||!req.path.startsWith('/api/')&&req.path!=='/'&&!req.path.endsWith('.html'))return next();
  const user=session(req)||(testBypass?{id:'test-admin',first_name:'Test',last_name:'Admin',email:'test@example.invalid',role:'admin',active:1,must_change_password:0,revision:1}:null);
  if(!user||user.must_change_password){if(req.path.startsWith('/api/'))return res.status(401).json({error:user?'Bitte zuerst das Passwort ändern':'Anmeldung erforderlich'});return res.redirect('/login.html');}
  res.setHeader('Cache-Control','no-store');req.user=publicUser(user);
  if(req.path.startsWith('/api/')&&!permitted(user.role,req.method,req.path))return res.status(403).json({error:'Für diese Aktion fehlen die Rechte'});
  actorContext.run(`${user.first_name} ${user.last_name} <${user.email}>`,()=>accessContext.run(req.user,next));
 });
 app.get('/api/users',(req,res)=>res.json({users:users().map(publicUser)}));
 app.post('/api/users',async(req,res)=>{
  const values=fields(req.body),password=await passwordHash(req.body.password);
  const user={id:randomUUID(),...values,...password,access_scope:scopeField(req.body.access_scope,values.role),revision:1,must_change_password:1};
  transaction(()=>{uniqueEmail(user.email);save(user);recordAudit('create',null,publicUser(user));});res.json(publicUser(user));
 });
 app.put('/api/users/:id',async(req,res)=>{
  const values=fields(req.body),password=req.body.password?await passwordHash(req.body.password):null;
  const updated=transaction(()=>{const before=find(req.params.id);if(!before)fail('Benutzerzugang nicht gefunden',404);if(req.body.revision!==before.revision)fail('Benutzerzugang wurde inzwischen geändert. Bitte neu laden',409);uniqueEmail(values.email,before.id);const updated={...before,...values,...password,access_scope:scopeField(req.body.access_scope,values.role,before.access_scope),must_change_password:password?1:before.must_change_password,revision:before.revision+1};guardLastAdmin(before,updated);save(updated);invalidate(before.id);recordAudit('update',publicUser(before),publicUser(updated));return updated;});res.json(publicUser(updated));
 });
 app.delete('/api/users/:id',(req,res)=>{
  transaction(()=>{const before=find(req.params.id);if(!before)fail('Benutzerzugang nicht gefunden',404);if(Number(req.query.revision)!==before.revision)fail('Benutzerzugang wurde inzwischen geändert. Bitte neu laden',409);guardLastAdmin(before,null);invalidate(before.id);db.prepare('DELETE FROM app_users WHERE id=?').run(before.id);recordAudit('delete',publicUser(before),null);});res.json({ok:true});
 });
 return {roleViews};
}
