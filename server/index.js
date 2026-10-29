import express from 'express';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
import {client,config,unwrap,getOrder,graph,message,env} from './services.js';
import {readRows,zolveWorkbook,sha256,reportDate} from './workbooks.js';
const app=express();app.disable('x-powered-by');app.use(express.json({limit:'1mb'}));
app.use((req,res,next)=>{res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Cache-Control':'no-store'});next();});
app.get('/api/config',(req,res)=>res.json({url:env.SUPABASE_URL||'',key:env.SUPABASE_PUBLISHABLE_KEY||'',configured:!!(env.SUPABASE_URL&&env.SUPABASE_PUBLISHABLE_KEY)}));
app.get('/api/health',(req,res)=>res.json({status:'ok',app:'Sales Vision',configured:!!env.SUPABASE_URL}));
app.use('/api',async(req,res,next)=>{
 try{
  const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];if(!token)return res.status(401).json({error:'Inicie sessão Microsoft'});
  const db=client(token);const {data,error}=await db.auth.getUser(token);if(error||!data.user)return res.status(401).json({error:'Sessão expirada'});
  const member=unwrap(await db.from('sv_users').select('*').eq('id',data.user.id).single());if(!member?.active)return res.status(403).json({error:'Utilizador sem autorização'});
  req.db=db;req.member=member;req.user=data.user;next();
 }catch{res.status(403).json({error:'Acesso não autorizado ou Supabase por configurar'});}
});
async function allRows(db,table,sort,activeOnly=false){
 const rows=[];
 for(let offset=0;offset<100000;offset+=500){
  let q=db.from(table).select('*').order(sort).range(offset,offset+499);
  if(activeOnly)q=q.eq('active',true);
  const page=unwrap(await q);rows.push(...page);if(page.length<500)return rows;
 }
 throw new Error('Mais de 100.000 registos: restringir a consulta');
}
app.get('/api/dashboard',async(req,res)=>{
 const db=req.db;const result=await Promise.all([db.from('sv_orders').select('*').order('created_at',{ascending:false}).limit(200),allRows(db,'sv_clients','id',true),allRows(db,'sv_available','id'),db.from('sv_snapshots').select('*')]);
 res.json({orders:unwrap(result[0]),clients:result[1],stock:result[2],snapshots:unwrap(result[3]),member:req.member,user:{email:req.user.email}});
});
app.post('/api/orders',async(req,res)=>{const b=req.body;res.json({id:unwrap(await req.db.rpc('sv_reserve',{p_request:b.request_id,p_client:b.client_id,p_delivery:b.delivery,p_lines:b.lines}))});});
app.get('/api/orders/:id',async(req,res)=>res.json(await getOrder(req.db,req.params.id)));
app.post('/api/orders/:id/cancel',async(req,res)=>{unwrap(await req.db.rpc('sv_cancel',{p_order:req.params.id}));res.json({ok:true});});
app.post('/api/orders/:id/fulfill',async(req,res)=>{unwrap(await req.db.rpc('sv_fulfill',{p_order:req.params.id}));res.json({ok:true});});
app.get('/api/orders/:id/excel',async(req,res)=>{
 const bytes=await zolveWorkbook(await getOrder(req.db,req.params.id),await config());res.type('xlsx').attachment(`SalesVision_${req.params.id}.xlsx`).send(bytes);
});
app.post('/api/orders/:id/send',async(req,res)=>{
 const order=await getOrder(req.db,req.params.id);if(order.owner!==req.user.id)throw new Error('Envio pela conta do comercial que criou a encomenda');
 const token=req.headers['x-graph-token'];if(typeof token!=='string')throw new Error('Volte a iniciar sessão para autorizar o Outlook');
 // Verify Graph identity against the admin-approved immutable Entra object id.
 const me=await(await graph(token,'/me?$select=id')).json();if(me.id!==req.member.entra_oid)throw new Error('Conta Outlook diferente da conta autorizada');
 const cfg=await config();const bytes=await zolveWorkbook(order,cfg);const payload=message(order,bytes,cfg);const service=client(null,true);
 unwrap(await req.db.rpc('sv_claim_send',{p_order:order.id}));
 try{
  const r=await graph(token,'/me/sendMail',{method:'POST',body:JSON.stringify(payload)});
  unwrap(await service.rpc('sv_finish_send',{p_order:order.id,p_state:'submitted',p_request:r.headers.get('request-id'),p_error:null}));
  res.json({ok:true,state:'submitted'});
 }catch(e){
  // Never repeat sendMail automatically: a timeout may occur after Graph accepted it.
  try{unwrap(await service.rpc('sv_finish_send',{p_order:order.id,p_state:'uncertain',p_request:null,p_error:e.message}));}catch{}
  res.status(409).json({error:'Resultado do envio incerto. Verificar Itens Enviados; não reenviar automaticamente.'});
 }
});
app.post('/api/import/:kind',express.raw({type:'application/octet-stream',limit:'10mb'}),async(req,res)=>{
 if(req.member.role!=='admin')return res.status(403).json({error:'Administrador necessário'});
 const kind=req.params.kind,cfg=await config();if(!['FRZ','FRE','clients'].includes(kind))throw new Error('Tipo de importação inválido');
 const mapping=kind==='clients'?cfg.clients:cfg.stock[kind];const rows=await readRows(req.body,mapping,kind);
 if(kind==='clients')unwrap(await req.db.rpc('sv_import_clients',{p_rows:rows}));
 else {const fileName=decodeURIComponent(req.headers['x-file-name']||'');const day=reportDate(fileName,mapping);unwrap(await req.db.rpc('sv_import_daily_stock',{p_source:kind,p_date:day,p_hash:sha256(req.body),p_rows:rows}));}
 res.json({imported:rows.length,quarantined:rows.filter(r=>r.quality_issues?.length).length,blocked:rows.filter(r=>r.blocked).length});
});
app.use('/api',(req,res)=>res.status(404).json({error:'Operação desconhecida'}));
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(existsSync(path.join(root,'dist')))app.use(express.static(path.join(root,'dist')));
else {const {createServer}=await import('vite');const vite=await createServer({root,server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);}
app.use((err,req,res,next)=>{res.status(400).json({error:err.message||'Operação falhou'});});
app.listen(Number(env.PORT||3000),env.HOST||'127.0.0.1',()=>console.log(`Sales Vision: http://localhost:${env.PORT||3000}`));
