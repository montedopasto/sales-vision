import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
let db;const uid='00000000-0000-0000-0000-000000000001';
const rpc=(sql,args=[])=>db.query(sql,args);
const day=new Date(Date.now()+86400000).toISOString().slice(0,10);
const late=new Date(Date.now()+86400000*90).toISOString().slice(0,10);
const stock=(sscc,expires,boxes,blocked=false)=>({warehouse:'TEST',sscc,product:'TEST-P',description:'Synthetic test only',lot:sscc,expires,entered:'2020-01-01',boxes,blocked,zone:'TEST',temperature:-18,kg:boxes});
before(async()=>{
 db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;create function auth.role() returns text language sql as $$select coalesce(nullif(current_setting('test.role',true),''),'authenticated')$$;`);
 await db.exec(await readFile(new URL('../db/001_sales_vision.sql',import.meta.url),'utf8'));
 await db.exec(`create function auth.jwt() returns jsonb language sql as $$select '{"email":"synthetic@example.invalid","user_metadata":{"full_name":"Synthetic Test"}}'::jsonb$$`);
 await db.exec(await readFile(new URL('../db/002_daily_reports.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../db/003_github_pages.sql',import.meta.url),'utf8'));
 await db.exec(`insert into auth.users values('${uid}');insert into public.sv_users values('${uid}','test-oid','admin',true);select set_config('test.uid','${uid}',false);`);
 await rpc('select public.sv_import_clients($1::jsonb)',[JSON.stringify([{id:'TEST-C',name:'Synthetic',address:'Test',postal_code:'Test',city:'Test'}])]);
 await rpc('select public.sv_import_stock($1,now()-interval \'1 minute\',$2,$3::jsonb)',['FRZ','a'.repeat(64),JSON.stringify([stock('000000000000000001',day,4),stock('000000000000000002',late,10),stock('000000000000000003',late,20,true)])]);
});
after(()=>db.close());
test('FEFO, all-or-nothing, idempotency and cancellation',async()=>{
 const req='10000000-0000-0000-0000-000000000001';
 const args=[req,'TEST-C',day,JSON.stringify([{product:'TEST-P',boxes:7}])];
 const result=await rpc('select public.sv_reserve($1,$2,$3,$4::jsonb) id',args);const id=result.rows[0].id;
 const reservations=await rpc('select s.expires,r.boxes from sv_reservations r join sv_stock s on s.id=r.stock_id order by s.expires');assert.deepEqual(reservations.rows.map(x=>x.boxes),[4,3]);
 assert.equal((await rpc('select public.sv_reserve($1,$2,$3,$4::jsonb) id',args)).rows[0].id,id);
 await assert.rejects(rpc('select public.sv_reserve($1,$2,$3,$4::jsonb)',['20000000-0000-0000-0000-000000000001','TEST-C',day,JSON.stringify([{product:'TEST-P',boxes:1},{product:'MISSING',boxes:1}])]),/insuficiente/);
 assert.equal((await rpc('select count(*)::int n from sv_orders')).rows[0].n,1);
 await rpc('select public.sv_cancel($1)',[id]);assert.equal((await rpc('select count(*)::int n from sv_reservations where active')).rows[0].n,0);
});
test('rejects duplicate products, fractions, empty lines and unauthorized users',async()=>{
 for(const lines of [[{product:'TEST-P',boxes:1},{product:'TEST-P',boxes:1}],[{product:'TEST-P',boxes:1.5}],[],null])await assert.rejects(rpc('select public.sv_reserve(gen_random_uuid(),$1,$2,$3::jsonb)',['TEST-C',day,JSON.stringify(lines)]));
 await db.exec("select set_config('test.uid','00000000-0000-0000-0000-000000000099',false)");
 await assert.rejects(rpc('select public.sv_reserve(gen_random_uuid(),$1,$2,$3::jsonb)',['TEST-C',day,'[{"product":"TEST-P","boxes":1}]']),/autorizado/);
 await db.exec(`select set_config('test.uid','${uid}',false)`);
});
test('oversubscription refused and reduced snapshot flags conflicts without freeing reservations',async()=>{
 const a=await rpc('select public.sv_reserve(gen_random_uuid(),$1,$2,$3::jsonb) id',['TEST-C',day,'[{"product":"TEST-P","boxes":12}]']);
 await assert.rejects(rpc('select public.sv_reserve(gen_random_uuid(),$1,$2,$3::jsonb)',['TEST-C',day,'[{"product":"TEST-P","boxes":3}]']),/insuficiente/);
 await rpc('select public.sv_import_stock($1,now()-interval \'10 seconds\',$2,$3::jsonb)',['FRZ','b'.repeat(64),JSON.stringify([stock('000000000000000001',day,1),stock('000000000000000002',late,1)])]);
 assert.equal((await rpc('select conflict from sv_orders where id=$1',[a.rows[0].id])).rows[0].conflict,true);
 assert.equal((await rpc('select sum(boxes)::int n from sv_reservations where active')).rows[0].n,12);
 await assert.rejects(rpc('select public.sv_claim_send($1)',[a.rows[0].id]),/indisponível/);
 await rpc('select public.sv_cancel($1)',[a.rows[0].id]);
});
test('send claim is unique and browser cannot forge submission',async()=>{
 const a=await rpc('select public.sv_reserve(gen_random_uuid(),$1,$2,$3::jsonb) id',['TEST-C',day,'[{"product":"TEST-P","boxes":1}]']);const id=a.rows[0].id;
 await rpc('select public.sv_claim_send($1)',[id]);await assert.rejects(rpc('select public.sv_claim_send($1)',[id]),/indisponível/);
 await assert.rejects(rpc("select public.sv_finish_send($1,'submitted',null,null)",[id]),/Servidor/);
 await assert.rejects(rpc('select public.sv_cancel($1)',[id]),/cancelar/);
 await db.exec("select set_config('test.role','service_role',false)");await rpc("select public.sv_finish_send($1,'submitted','test-request',null)",[id]);await db.exec("select set_config('test.role','authenticated',false)");
 assert.equal((await rpc('select state from sv_orders where id=$1',[id])).rows[0].state,'submitted');
});
test('tables are isolated and RLS denies unlisted users and direct writes',async()=>{
 await db.exec('grant usage on schema auth to authenticated;grant select on auth.users to authenticated;set role authenticated;');
 assert.equal((await rpc('select count(*)::int n from sv_orders')).rows[0].n,3);
 await assert.rejects(rpc("update sv_stock set boxes=999"),/permission denied/);
 await db.exec("select set_config('test.uid','00000000-0000-0000-0000-000000000099',false)");assert.equal((await rpc('select count(*)::int n from sv_orders')).rows[0].n,0);
 await db.exec('reset role;');
 assert.equal((await rpc("select count(*)::int n from information_schema.tables where table_name in ('stocks_current','stocks_history')")).rows[0].n,0);
});
test('daily snapshots use report date, preserve empty reports and quarantine incomplete metadata',async()=>{
 await db.exec(`select set_config('test.uid','${uid}',false)`);
 const current=(await rpc("select (now() at time zone 'Europe/Lisbon')::date::text d")).rows[0].d;
 const yesterday=(await rpc("select ((now() at time zone 'Europe/Lisbon')::date-1)::text d")).rows[0].d;
 const older=(await rpc("select ((now() at time zone 'Europe/Lisbon')::date-2)::text d")).rows[0].d;
 const fresh={...stock('000000000000000004',late,5),product:'DAILY-TEST'};
 await rpc('select public.sv_import_daily_stock($1,$2,$3,$4::jsonb)',['FRE',older,'c'.repeat(64),JSON.stringify([fresh])]);
 assert.equal((await rpc("select public.sv_is_fresh('FRE') fresh")).rows[0].fresh,false);
 await rpc('select public.sv_import_daily_stock($1,$2,$3,$4::jsonb)',['FRE',yesterday,'d'.repeat(64),'[]']);
 assert.equal((await rpc("select sum(boxes)::int n from sv_stock where source='FRE'")).rows[0].n,0);
 const bad={...fresh,sscc:'000000000000000005',lot:'',expires:null,kg:-2,blocked:true,quality_issues:['Lote em falta','Validade em falta','Peso negativo no relatório']};
 await rpc('select public.sv_import_daily_stock($1,$2,$3,$4::jsonb)',['FRE',current,'e'.repeat(64),JSON.stringify([fresh,bad])]);
 assert.equal((await rpc("select public.sv_is_fresh('FRE') fresh")).rows[0].fresh,true);
 assert.equal((await rpc("select kg::float8 kg from sv_stock where source='FRE' and lot=''")).rows[0].kg,-2);
 const order=await rpc('select public.sv_reserve(gen_random_uuid(),$1,$2,$3::jsonb) id',['TEST-C',day,'[{"product":"DAILY-TEST","boxes":5}]']);
 assert.equal((await rpc('select owner_contact from sv_orders where id=$1',[order.rows[0].id])).rows[0].owner_contact.email,'synthetic@example.invalid');
 await assert.rejects(rpc('select public.sv_reserve(gen_random_uuid(),$1,$2,$3::jsonb)',['TEST-C',day,'[{"product":"DAILY-TEST","boxes":1}]']),/insuficiente/);
 await assert.rejects(rpc('select public.sv_import_daily_stock($1,$2,$3,$4::jsonb)',['FRE',current,'f'.repeat(64),JSON.stringify([fresh])]),/antigo|ambíguo/);
});
test('Pages integration settings are private and only admins can update them',async()=>{
 await db.exec(`select set_config('test.uid','${uid}',false)`);
 await rpc('select public.sv_set_integration($1::jsonb)',['{"recipients":["synthetic@example.invalid"]}']);
 await db.exec('set role authenticated');assert.equal((await rpc('select count(*)::int n from sv_settings')).rows[0].n,1);
 await assert.rejects(rpc("update sv_settings set value='{}'"),/permission denied/);
 await db.exec("select set_config('test.uid','00000000-0000-0000-0000-000000000099',false)");assert.equal((await rpc('select count(*)::int n from sv_settings')).rows[0].n,0);
 await assert.rejects(rpc("select public.sv_set_integration('{}')"),/Administrador/);
 await db.exec('reset role;set role anon');await assert.rejects(rpc('select * from sv_settings'),/permission denied/);await db.exec('reset role');
});
