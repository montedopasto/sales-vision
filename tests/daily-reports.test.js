import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {readRows,reportDate,zolveWorkbook} from '../supabase/functions/_shared/workbooks.js';
const cfg=JSON.parse(await readFile(new URL('../config/defaults.json',import.meta.url),'utf8'));
const mapping=cfg.stock.FRZ;
async function sample(changes={},empty=false){
 const b=new ExcelJS.Workbook(),s=b.addWorksheet('STOCK');const headers=Object.values(mapping.columns);s.addRow([...headers,null,null]);
 const o={warehouse:'03',sscc:'000000000000000017',product:'SYNTHETIC',description:'Synthetic article',lot:'12345',expires:'2030-01-01',entered:'2026-01-01',boxes:5,blocked:'',zone:'FRZ - Congelados',kg:24,block_reason:'',...changes};
 if(!empty)s.addRow(Object.keys(mapping.columns).map(k=>o[k]));
 return Buffer.from(await b.xlsx.writeBuffer());
}
test('daily filename date is exact and never inferred from upload timestamp',()=>{
 assert.equal(reportDate('Monte do Pasto (FRZ) Montijo_20261029_DailyReport.xlsx',mapping),'2026-10-29');
 assert.throws(()=>reportDate('Monte do Pasto (FRE) Montijo_20261029_DailyReport.xlsx',mapping));
 assert.throws(()=>reportDate('Monte do Pasto (FRZ) Montijo_20260230_DailyReport.xlsx',mapping));
});
test('daily parser preserves missing data and quarantines only affected stock',async()=>{
 const [good]=await readRows(await sample(),mapping,'FRZ');assert.equal(good.temperature,-18);assert.equal(good.kg,24);assert.equal(good.blocked,false);
 for(const change of [{expires:null},{description:null},{lot:null},{zone:'UNKNOWN'},{entered:'2031-01-01'},{kg:-2.844}]){
  const [row]=await readRows(await sample(change),mapping,'FRZ');assert.equal(row.blocked,true);assert.ok(row.quality_issues.length);assert.equal(row.boxes,5);assert.equal(row.raw.row,2);
 }
 const [held]=await readRows(await sample({blocked:'Bloqueado',block_reason:'Pedido do Cliente'}),mapping,'FRZ');assert.equal(held.blocked,true);assert.equal(held.block_reason,'Pedido do Cliente');
 assert.deepEqual(await readRows(await sample({},true),mapping,'FRZ'),[]);
});
test('FM.01107 contains correct fields, frozen/chilled temperature and no hidden sample recipient',async()=>{
 const order={id:'SYNTHETIC-ONLY',created_at:'2026-10-29T10:00:00Z',delivery:'2026-10-30',owner_contact:{name:'Synthetic',email:'synthetic@example.invalid'},client_snapshot:{name:'Synthetic client',address:'Synthetic address',postal_code:'0000-000',city:'Synthetic city'},sv_lines:[{product:'SYNTHETIC',sv_reservations:[{active:true,boxes:2,stock_snapshot:{sscc:'000000000000000017',description:'Synthetic article',temperature:-18}},{active:true,boxes:3,stock_snapshot:{sscc:'000000000000000024',description:'Synthetic chilled article',temperature:4}}]}]};
 const bytes=await zolveWorkbook(order,cfg),b=new ExcelJS.Workbook();await b.xlsx.load(bytes);const s=b.getWorksheet('Folha1');
 assert.equal(s.getCell('A15').value,'CODIGO ARTIGO');assert.equal(s.getCell('D17').value,'000000000000000017');assert.equal(s.getCell('C17').value,2);assert.equal(s.getCell('E17').value,-18);assert.equal(s.getCell('E18').value,4);assert.ok(s.getCell('H17').value.includes('Synthetic client'));assert.equal(s.getCell('J17').value.toISOString().slice(0,10),'2026-10-30');assert.ok(s.rowCount<50);assert.equal(s.getColumn('H').hidden,false);assert.equal(s.getCell('E20').value.result,5);
 // Fulfilled/cancelled historical documents keep their original allocated quantities.
 order.sv_lines[0].sv_reservations[0].active=false;const historical=new ExcelJS.Workbook();await historical.xlsx.load(await zolveWorkbook(order,cfg));assert.equal(historical.getWorksheet('Folha1').getCell('C17').value,2);
 await assert.rejects(zolveWorkbook({...order,sv_lines:[{product:'S',sv_reservations:[{active:true,boxes:1,stock_snapshot:{sscc:'000000000000000017',description:'Missing temperature'}}]}]},cfg),/temperatura/);
});
for(const source of ['FRZ','FRE'])test(`supplied ${source} report imports without fabricating missing data`,{skip:!process.env[`SALES_VISION_${source}_FILE`]},async()=>{
 const rows=await readRows(await readFile(process.env[`SALES_VISION_${source}_FILE`]),cfg.stock[source],source);
 assert.equal(rows.length,source==='FRZ'?394:32);assert.equal(rows.reduce((n,r)=>n+r.boxes,0),source==='FRZ'?6034:805);
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;create function auth.role() returns text language sql as $$select 'service_role'::text$$;create function auth.jwt() returns jsonb language sql as $$select '{}'::jsonb$$;`);
  for(const file of ['001_sales_vision.sql','002_daily_reports.sql'])await db.exec(await readFile(new URL('../db/'+file,import.meta.url),'utf8'));
  await db.query('select public.sv_import_daily_stock($1,$2,$3,$4::jsonb)',[source,'2026-10-29','a'.repeat(64),JSON.stringify(rows)]);
  const check=(await db.query("select count(*)::int n,sum(boxes)::int boxes,sum(kg)::float8 kg,count(*) filter(where jsonb_array_length(quality_issues)>0)::int quarantined from sv_stock")).rows[0];
  assert.equal(check.n,source==='FRZ'?394:32);assert.equal(check.boxes,source==='FRZ'?6034:805);assert.ok(Math.abs(check.kg-(source==='FRZ'?34422.657:3050.72))<0.000001);assert.equal(check.quarantined,source==='FRZ'?8:0);
 }finally{await db.close();}

 if(source==='FRZ'){
  assert.equal(rows.filter(r=>r.quality_issues.length).length,8);assert.equal(rows.filter(r=>r.block_reason).length,38);
  assert.equal(rows.find(r=>r.raw.row===28).expires,null);assert.equal(rows.find(r=>r.raw.row===101).lot,'');
 }else assert.equal(rows.filter(r=>r.blocked).length,0);
});
