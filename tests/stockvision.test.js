import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
test('live StockVision reads reflect source updates, preserve units and deny unsafe reservations and anonymous access',async()=>{
 const db=new PGlite();const uid='00000000-0000-0000-0000-000000000001';
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;create function auth.role() returns text language sql as $$select 'authenticated'::text$$;create function auth.jwt() returns jsonb language sql as $$select '{}'::jsonb$$;`);
 for(const name of ['001_sales_vision.sql','002_daily_reports.sql','003_github_pages.sql'])await db.exec(await readFile(new URL('../db/'+name,import.meta.url),'utf8'));
 await db.exec(`create table public.stocks_current(codigo_artigo text,nome_produto text,sscc text,lote text,data_entrada_lote date,data_validade date,armazem text,kg numeric,created_at timestamp default now());insert into auth.users values('${uid}');insert into sv_users values('${uid}','synthetic-oid','admin',true);select set_config('test.uid','${uid}',false);insert into sv_clients(id,name,address,postal_code,city) values('TEST','Synthetic','Test','Test','Test');`);
 await db.exec(await readFile(new URL('../db/004_stockvision_live.sql',import.meta.url),'utf8'));
 assert.equal((await db.query('select count(*)::int n from sv_available')).rows[0].n,0);
 await db.exec(`insert into stocks_current values('TEST','Synthetic','000000000000000017','LOT','2020-01-01','2099-01-01','TEST',12.75,now());set role authenticated;`);
 let row=(await db.query('select * from sv_available')).rows[0];assert.equal(row.kg,'12.75');assert.equal(row.boxes,null);assert.equal(row.available,0);assert.equal(row.blocked,true);assert.equal(row.fresh,false);assert.equal(row.sscc,'000000000000000017');const id=row.id;
 assert.equal((await db.query('select * from sv_stockvision_snapshots')).rows[0].observed_precision,'import');
 await assert.rejects(db.query(`select sv_reserve(gen_random_uuid(),'TEST',current_date,'[{"product":"TEST","boxes":1}]')`),/insuficiente/);
 assert.equal((await db.query('select count(*)::int n from sv_orders')).rows[0].n,0);
 await assert.rejects(db.query(`select sv_import_stock('FRZ',now(),repeat('a',64),'[]')`),/permission denied/);
 await db.exec('reset role;update stocks_current set kg=9.5;set role authenticated;');row=(await db.query('select * from sv_available')).rows[0];assert.equal(row.kg,'9.5');assert.equal(row.id,id);
 await db.exec(`select set_config('test.uid','00000000-0000-0000-0000-000000000099',false)`);assert.equal((await db.query('select count(*)::int n from sv_available')).rows[0].n,0);
 await db.exec('reset role;set role anon;');await assert.rejects(db.query('select * from sv_available'),/permission denied/);
 await db.exec('reset role;');assert.equal((await db.query("select rowsecurity from pg_tables where tablename='stocks_current'")).rows[0].rowsecurity,false);assert.equal((await db.query("select count(*)::int n from pg_trigger where tgrelid='stocks_current'::regclass and not tgisinternal")).rows[0].n,0);
 await db.exec(await readFile(new URL('../db/005_google_sheets_source.sql',import.meta.url),'utf8'));
 assert.equal((await db.query("select to_regprocedure('public.sv_stockvision_rows()') as removed")).rows[0].removed,null);
 await db.exec(`select set_config('test.uid','${uid}',false)`);
 await assert.rejects(db.query(`select sv_reserve(gen_random_uuid(),'TEST',current_date,'[]')`),/folha STOCKS/);
 }finally{await db.close();}
});
