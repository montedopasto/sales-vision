import {test} from 'node:test';
import assert from 'node:assert/strict';
import {googleStock,parseCsv,createStockReader,stockCsvUrl} from '../supabase/functions/_shared/google-stock.js';
const header='CodigoArtigo,NomeProduto,SSCC,Lote,DataEntradaLote,DataValidade,Armazem,KG';
const csv=header+'\r\nTEST,"Produto, com ""aspas""",000000000000000017,LOT,2026-01-01,2027-01-01,ZOLVE,"1.234,500"\r\n';
test('Google CSV preserves pt-PT kg and SSCC without inventing boxes or report freshness',async()=>{
 const [s]=await googleStock(csv);assert.equal(s.kg,1234.5);assert.equal(s.sscc,'000000000000000017');assert.equal(s.description,'Produto, com "aspas"');assert.equal(s.boxes,null);assert.equal(s.fresh,false);assert.equal(s.observed_at,null);assert.equal(s.blocked,true);
 assert.deepEqual(parseCsv('"a\nb",c\n'),[['a\nb','c']]);await assert.rejects(googleStock('CodigoArtigo,KG\nA,1'),/Coluna/);assert.throws(()=>parseCsv('<html>Login</html>'),/inválida/);assert.throws(()=>parseCsv('"truncated'),/incompleto/);
 const onlyZolve=await googleStock(csv+'A,Other,000000000000000017,LOT,2026-01-01,2027-01-01,AMOREIRAS,99\n');assert.equal(onlyZolve.length,1);assert.equal(onlyZolve[0].warehouse,'ZOLVE');
 const bad=(await googleStock(header+'\nA,Produto,244306.18,L,-,invalid,ZOLVE,"-2,500"'))[0];assert.equal(bad.kg,-2.5);assert.equal(bad.expires,null);assert.ok(bad.quality_issues.some(x=>x.includes('GS1')));
});
test('Google reader authenticates membership, uses only the fixed sheet URL and never writes stock',async()=>{
 let reads=0;let active=true;const db={auth:{getUser:async()=>({data:{user:{id:'synthetic'}},error:null})},from:name=>{assert.equal(name,'sv_users');const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{active},error:null})};return q;}};
 const handler=createStockReader({origins:['https://example.invalid'],userClient:()=>db,fetchImpl:async url=>{assert.equal(url,stockCsvUrl);reads++;return new Response(csv);}});
 const req=(token=true,origin='https://example.invalid')=>new Request('https://functions.example.invalid',{method:'POST',headers:{origin,...(token?{authorization:'Bearer synthetic'}:{})},body:'{"url":"https://evil.invalid"}'});
 assert.equal((await handler(req(false))).status,401);assert.equal((await handler(req(true,'https://evil.invalid'))).status,403);assert.equal(reads,0);
 active=false;assert.equal((await handler(req())).status,403);assert.equal(reads,0);active=true;
 const r=await handler(req());assert.equal(r.status,200);const d=await r.json();assert.equal(d.stock.length,1);assert.equal(d.source.sheet,'STOCKS');assert.equal(d.snapshots[0].observed_at,null);assert.equal(d.snapshots[0].observed_precision,'read');assert.equal(reads,1);
});
