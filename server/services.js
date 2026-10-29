import {createClient} from '@supabase/supabase-js';
import {readFile} from 'node:fs/promises';
export const env=process.env;
export function client(token,service=false){
 if(!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY)throw new Error('Configurar Supabase no servidor');
 const key=service?env.SUPABASE_SERVICE_ROLE_KEY:env.SUPABASE_PUBLISHABLE_KEY;
 if(!key)throw new Error('Configurar chave do serviço no servidor');
 return createClient(env.SUPABASE_URL,key,{auth:{persistSession:false,autoRefreshToken:false},global:token?{headers:{Authorization:`Bearer ${token}`}}:undefined});
}
export async function config(){
 const defaults=JSON.parse(await readFile(new URL('../config/defaults.json',import.meta.url),'utf8'));
 let overrides={};try{overrides=JSON.parse(await readFile(env.INTEGRATION_CONFIG||'config/live.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 return {...defaults,...overrides,stock:{...defaults.stock,...overrides.stock},zolve:{...defaults.zolve,...overrides.zolve}};
}
export function unwrap({data,error}){if(error)throw new Error(error.message);return data;}
export async function getOrder(db,id){
 if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('Encomenda inválida');
 return unwrap(await db.from('sv_orders').select('*,sv_lines(*,sv_reservations(*,sv_stock(*))),sv_shipments(*)').eq('id',id).single());
}
export async function graph(token,path,options={}){
 const response=await fetch(`https://graph.microsoft.com/v1.0${path}`,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw new Error(`Microsoft Graph: ${response.status}`);
 return response;
}
export function message(order,bytes,cfg){
 if(!cfg.recipients?.length||cfg.recipients.concat(cfg.cc||[]).some(x=>!/^\S+@\S+\.\S+$/.test(x))||!cfg.subjectPrefix||!cfg.body)throw new Error('Destinatários e mensagem Zolve por configurar');
 if(bytes.length>=3*1024*1024)throw new Error('Anexo excede limite Graph de 3 MB');
 return {message:{subject:`${cfg.subjectPrefix} ${order.id}`,body:{contentType:'Text',content:cfg.body.replaceAll('{{order_id}}',order.id).replaceAll('{{delivery}}',order.delivery)},toRecipients:cfg.recipients.map(address=>({emailAddress:{address}})),ccRecipients:(cfg.cc||[]).map(address=>({emailAddress:{address}})),attachments:[{'@odata.type':'#microsoft.graph.fileAttachment',name:`SalesVision_${order.id}.xlsx`,contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',contentBytes:bytes.toString('base64')}]},saveToSentItems:true};
}
