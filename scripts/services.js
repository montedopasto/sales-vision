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
export {unwrap,getOrder} from '../supabase/functions/_shared/data.js';
export async function graph(token,path,options={}){
 const response=await fetch(`https://graph.microsoft.com/v1.0${path}`,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw new Error(`Microsoft Graph: ${response.status}`);
 return response;
}
export {message} from '../supabase/functions/_shared/message.js';
