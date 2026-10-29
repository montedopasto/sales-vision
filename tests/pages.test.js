import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sha256} from '../supabase/functions/_shared/workbooks.js';
import {createApi} from '../public/client-api.js';
import {createSendHandler} from '../supabase/functions/_shared/send-handler.js';
const id='00000000-0000-0000-0000-000000000007',uid='00000000-0000-0000-0000-000000000001';
const order={id,owner:uid,created_at:'2026-10-29T12:00:00Z',delivery:'2026-10-30',owner_contact:{email:'synthetic@example.invalid'},client_snapshot:{name:'Synthetic client',address:'Synthetic address',postal_code:'0000-000',city:'Synthetic'},sv_lines:[{product:'TEST',sv_reservations:[{active:true,boxes:2,stock_snapshot:{sscc:'000000000000000017',description:'Synthetic article',temperature:-18}}]}]};
function fixture({active=true,owner=uid,graphId='OID',failSend=false,failSettle=false}={}){
 const calls=[],sends=[];let claimed=false;
 const member={id:uid,active,role:'admin',entra_oid:'OID'};
 const values={sv_users:member,sv_orders:{...order,owner},sv_settings:{value:{recipients:['synthetic@example.invalid'],cc:[],subjectPrefix:'TEST',body:'{{order_id}} {{delivery}}'}}};
 const db={auth:{getUser:async()=>({data:{user:{id:uid}},error:null}),getSession:async()=>({data:{session:{user:{id:uid,email:'synthetic@example.invalid'}}}})},from:table=>{const q={select(){return q},eq(){return q},single:async()=>({data:values[table],error:null}),maybeSingle:async()=>({data:values[table],error:null})};return q;},rpc:async(name,args)=>{
  calls.push([name,args]);if(name==='sv_claim_send'){if(claimed)return{error:{message:'Encomenda indisponível para envio'}};claimed=true;}
  if(name==='sv_finish_send'&&args.p_state==='submitted'&&failSettle)return{error:{message:'Storage unavailable'}};
  return{data:null,error:null};
 }};
 const handler=createSendHandler({userClient:()=>db,serviceClient:()=>db,origins:['https://example.invalid'],fetchImpl:async(url,options)=>{
  if(url.includes('/me?'))return new Response(JSON.stringify({id:graphId}),{status:200});
  assert.ok(url.endsWith('/me/sendMail'));sends.push(options);if(failSend)throw new Error('Synthetic timeout');return new Response(null,{status:202,headers:{'request-id':'synthetic-request'}});
 }});
 const req=(body={order_id:id,graph_token:'synthetic-token'},origin='https://example.invalid',auth=true)=>new Request('https://functions.example.invalid/send-zolve',{method:'POST',headers:{Origin:origin,...(auth?{Authorization:'Bearer synthetic-session'}:{}),'Content-Type':'application/json'},body:JSON.stringify(body)});
 return{handler,req,calls,sends,db};
}
test('browser/Edge SHA-256 needs no Node crypto or Buffer',async()=>{assert.equal(await sha256(new TextEncoder().encode('abc')),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');const module=await readFile(new URL('../supabase/functions/_shared/workbooks.js',import.meta.url),'utf8');assert.doesNotMatch(module,/node:|Buffer\.from|readUInt/);});
test('Pages adapter reserves directly through authenticated RPC and never calls a localhost API',async()=>{const f=fixture();const result=await createApi(f.db)('/orders',{method:'POST',body:JSON.stringify({request_id:id,client_id:'TEST-C',delivery:'2026-10-30',lines:[{product:'TEST',boxes:2}]})});assert.equal(result.status,200);assert.equal(f.calls[0][0],'sv_reserve');assert.equal(f.calls[0][1].p_lines[0].boxes,2);const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');assert.doesNotMatch(source,/fetch\('\/api/);assert.match(source,/appBase\.href/);});
test('Edge refuses anonymous, foreign origin, inactive member and mismatched Outlook identity',async()=>{
 for(const options of [{active:false},{owner:'someone-else'},{graphId:'different-oid'}]){const f=fixture(options),r=await f.handler(f.req());assert.equal(r.status,403);assert.equal(f.sends.length,0);assert.equal(f.calls.length,0);}
 const f=fixture();assert.equal((await f.handler(f.req(undefined,'https://evil.invalid'))).status,403);assert.equal((await f.handler(f.req(undefined,'https://example.invalid',false))).status,401);
});
test('Edge submits one immutable attachment and refuses repeated send attempts',async()=>{
 const f=fixture();assert.equal((await f.handler(f.req())).status,200);assert.equal((await f.handler(f.req())).status,400);assert.equal(f.sends.length,1);const payload=JSON.parse(f.sends[0].body);assert.ok(payload.message.attachments[0].contentBytes.length>0);assert.equal(f.calls[0][0],'sv_claim_send');assert.equal(f.calls[1][1].p_state,'submitted');
});
test('Edge keeps uncertain state and never retries after timeout or settlement failure',async()=>{
 for(const options of [{failSend:true},{failSettle:true}]){const f=fixture(options);assert.equal((await f.handler(f.req())).status,409);assert.equal(f.sends.length,1);assert.equal(f.calls.at(-1)[1].p_state,'uncertain');}
});
