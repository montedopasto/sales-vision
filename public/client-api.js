import defaults from '../supabase/functions/_shared/defaults.json' with {type:'json'};
import {unwrap,getOrder,allRows,readIntegration} from '../supabase/functions/_shared/data.js';
const json=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
// Static Pages application: every operation uses authenticated Supabase requests.
export function createApi(sb){
 return async(path,options={})=>{
  const current=(await sb.auth.getSession()).data.session;if(!current)throw new Error('Sessão expirada');
  const member=unwrap(await sb.from('sv_users').select('*').eq('id',current.user.id).single());
  if(!member?.active)throw new Error('Utilizador sem autorização');
  const method=options.method||'GET';
  if(path==='/dashboard'&&method==='GET'){
   const [orders,clients,stock,snapshots]=await Promise.all([sb.from('sv_orders').select('*').order('created_at',{ascending:false}).limit(200),allRows(sb,'sv_clients','id',true),allRows(sb,'sv_available','id'),sb.from('sv_snapshots').select('*')]);
   return json({orders:unwrap(orders),clients,stock,snapshots:unwrap(snapshots),member,user:{email:current.user.email}});
  }
  if(path==='/orders'&&method==='POST'){
   const b=JSON.parse(options.body);return json({id:unwrap(await sb.rpc('sv_reserve',{p_request:b.request_id,p_client:b.client_id,p_delivery:b.delivery,p_lines:b.lines}))});
  }
  const match=/^\/orders\/([0-9a-f-]{36})(?:\/(excel|send|cancel|fulfill))?$/i.exec(path);
  if(match){
   const [,id,action]=match;
   if(!action&&method==='GET')return json(await getOrder(sb,id));
   if(action==='excel'&&method==='GET'){
    const [order,cfg,{zolveWorkbook}]=await Promise.all([getOrder(sb,id),readIntegration(sb,defaults),import('../supabase/functions/_shared/workbooks.js')]);
    return new Response(await zolveWorkbook(order,cfg),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});
   }
   if(action==='send'&&method==='POST'){
    const token=options.headers?.['X-Graph-Token'];if(!token)throw new Error('Volte a iniciar sessão Microsoft para autorizar o Outlook');
    const {data,error}=await sb.functions.invoke('send-zolve',{body:{order_id:id,graph_token:token}});
    if(error){let detail;try{detail=await error.context?.json();}catch{}throw new Error(detail?.error||error.message);}
    if(data?.error)throw new Error(data.error);return json(data);
   }
   if(method==='POST'&&['cancel','fulfill'].includes(action)){unwrap(await sb.rpc('sv_'+action,{p_order:id}));return json({ok:true});}
  }
  const imp=/^\/import\/(FRZ|FRE|clients)$/.exec(path);
  if(imp&&method==='POST'){
   if(member.role!=='admin')throw new Error('Administrador necessário');
   const kind=imp[1],cfg=await readIntegration(sb,defaults),{readRows,reportDate,sha256}=await import('../supabase/functions/_shared/workbooks.js');
   const bytes=new Uint8Array(options.body);const mapping=kind==='clients'?cfg.clients:cfg.stock[kind];
   const rows=await readRows(bytes,mapping,kind);
   if(kind==='clients')unwrap(await sb.rpc('sv_import_clients',{p_rows:rows}));
   else unwrap(await sb.rpc('sv_import_daily_stock',{p_source:kind,p_date:reportDate(decodeURIComponent(options.headers['X-File-Name']||''),mapping),p_hash:await sha256(bytes),p_rows:rows}));
   return json({imported:rows.length,quarantined:rows.filter(r=>r.quality_issues?.length).length,blocked:rows.filter(r=>r.blocked).length});
  }
  throw new Error('Operação desconhecida');
 };
}
