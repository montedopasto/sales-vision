import {createClient} from '@supabase/supabase-js';
import {createSendHandler} from '../_shared/send-handler.js';
const url=Deno.env.get('SUPABASE_URL')!;
const key=Deno.env.get('SUPABASE_PUBLISHABLE_KEY')||Deno.env.get('SUPABASE_ANON_KEY')!;
const options={auth:{persistSession:false,autoRefreshToken:false}};
Deno.serve(createSendHandler({
 origins:(Deno.env.get('SALES_VISION_ALLOWED_ORIGINS')||'').split(',').map(x=>x.trim()).filter(Boolean),
 userClient:(token:string)=>createClient(url,key,{...options,global:{headers:{Authorization:`Bearer ${token}`}}}),
 serviceClient:()=>createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,options)
}));
