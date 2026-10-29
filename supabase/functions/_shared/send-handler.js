import {unwrap,getOrder,readIntegration} from './data.js';
import defaults from './defaults.json' with {type:'json'};
import {zolveWorkbook} from './workbooks.js';
import {message} from './message.js';
export function createSendHandler({userClient,serviceClient,origins,fetchImpl=fetch}){
 return async req=>{
  const origin=req.headers.get('origin');const headers={'Content-Type':'application/json','Vary':'Origin'};
  if(origin&&origins.includes(origin))headers['Access-Control-Allow-Origin']=origin;
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if(origin&&!origins.includes(origin))return reply({error:'Origem não autorizada'},403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'}});
  if(req.method!=='POST')return reply({error:'Método inválido'},405);
  try{
   const bearer=req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];if(!bearer)return reply({error:'Autenticação necessária'},401);
   const db=userClient(bearer);const {data,error}=await db.auth.getUser(bearer);if(error||!data.user)return reply({error:'Sessão inválida'},401);
   const member=unwrap(await db.from('sv_users').select('*').eq('id',data.user.id).single());if(!member?.active)return reply({error:'Acesso não autorizado'},403);
   const raw=await req.text();if(raw.length>64000)return reply({error:'Pedido demasiado grande'},413);
   const body=JSON.parse(raw);if(typeof body.graph_token!=='string'||!body.graph_token||body.graph_token.length>24000)throw new Error('Autorizar Outlook iniciando sessão novamente');
   const order=await getOrder(db,body.order_id);if(order.owner!==data.user.id)return reply({error:'Envio reservado ao comercial que criou a encomenda'},403);
   const graph=async(path,options={})=>{
    const r=await fetchImpl('https://graph.microsoft.com/v1.0'+path,{...options,headers:{Authorization:`Bearer ${body.graph_token}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(30000)});
    if(!r.ok)throw new Error(`Microsoft Graph: ${r.status}`);return r;
   };
   const me=await(await graph('/me?$select=id')).json();if(me.id!==member.entra_oid)return reply({error:'Conta Outlook diferente da conta autorizada'},403);
   const cfg=await readIntegration(db,defaults),bytes=await zolveWorkbook(order,cfg),payload=message(order,bytes,cfg);
   const admin=serviceClient();
   // Reserve a unique attempt before any external send. Never retry sendMail.
   unwrap(await db.rpc('sv_claim_send',{p_order:order.id}));
   try{
    const r=await graph('/me/sendMail',{method:'POST',body:JSON.stringify(payload)});
    unwrap(await admin.rpc('sv_finish_send',{p_order:order.id,p_state:'submitted',p_request:r.headers.get('request-id'),p_error:null}));
    return reply({ok:true,state:'submitted'});
   }catch(e){
    try{unwrap(await admin.rpc('sv_finish_send',{p_order:order.id,p_state:'uncertain',p_request:null,p_error:e.message}));}catch{}
    return reply({error:'Resultado de envio incerto. Verificar Itens Enviados antes de qualquer intervenção.'},409);
   }
  }catch(e){return reply({error:e.message||'Operação falhou'},400);}
 };
}
