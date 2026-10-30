import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {createStockReader} from '../_shared/google-stock.js';
const url=Deno.env.get('SUPABASE_URL')!;
const key=Deno.env.get('SUPABASE_ANON_KEY')!;
Deno.serve(createStockReader({
 origins:(Deno.env.get('SALES_VISION_ALLOWED_ORIGINS')||'').split(',').filter(Boolean),
 userClient:(token:string)=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${token}`}}})
}));
