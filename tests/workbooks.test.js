import {test} from 'node:test';import assert from 'node:assert/strict';import ExcelJS from 'exceljs';
import {readRows,zolveWorkbook,validSSCC} from '../supabase/functions/_shared/workbooks.js';
import {message} from '../supabase/functions/_shared/message.js';
const columns={warehouse:'Warehouse',sscc:'SSCC',product:'Product',description:'Description',lot:'Lot',expires:'Expiry',entered:'Entered',boxes:'Boxes',blocked:'Status'};
const mapping={reviewed:true,sheet:'TEST',headerRow:1,columns,allowedStatuses:['OK','HOLD'],blockedStatuses:['HOLD']};
async function file(changes={}){const b=new ExcelJS.Workbook(),s=b.addWorksheet('TEST');s.addRow(Object.values(columns));const o={warehouse:'TEST',sscc:'000000000000000017',product:'TEST',description:'Synthetic test',lot:'TEST',expires:'2030-01-01',entered:'2026-01-01',boxes:3,blocked:'OK',...changes};s.addRow(Object.keys(columns).map(k=>o[k]));return Buffer.from(await b.xlsx.writeBuffer());}
test('validates SSCC check digit and preserves leading zeroes',async()=>{assert.equal(validSSCC('000000000000000017'),true);assert.equal(validSSCC('000000000000000018'),false);const rows=await readRows(await file(),mapping,'FRZ');assert.equal(rows[0].sscc,'000000000000000017');assert.equal(rows[0].boxes,3);});
test('refuses unreviewed mapping, numeric SSCC, formulas, fractions and unknown status',async()=>{
 await assert.rejects(readRows(await file(),{...mapping,reviewed:false},'FRZ'),/validar/);
 for(const values of [{sscc:17},{sscc:'000000000000000018'},{boxes:2.5},{boxes:{formula:'1+1',result:2}},{blocked:'UNKNOWN'}])await assert.rejects(readRows(await file(values),mapping,'FRZ'));
});
test('Zolve output uses only configured columns, SSCC text and reserved boxes',async()=>{
 const order={id:'TEST',delivery:'2030-01-01',client_snapshot:{id:'C',name:'Synthetic'},sv_lines:[{product:'P',sv_reservations:[{active:true,boxes:2,stock_snapshot:{sscc:'000000000000000017',description:'TEST',lot:'L'}}]}]};
 await assert.rejects(zolveWorkbook(order,{}),/validado/);
 const cfg={zolve:{reviewed:true,sheet:'TEST',columns:[{header:'SSCC',field:'sscc'},{header:'Boxes',field:'boxes'}]}};
 const bytes=await zolveWorkbook(order,cfg),b=new ExcelJS.Workbook();await b.xlsx.load(bytes);assert.equal(b.worksheets[0].getCell('A2').value,'000000000000000017');assert.equal(b.worksheets[0].getCell('B2').value,2);
 assert.throws(()=>message(order,bytes,{}),/configurar/);
 const m=message(order,bytes,{recipients:['test@example.invalid'],cc:[],subjectPrefix:'TEST',body:'{{order_id}} {{delivery}}'});assert.equal(m.message.attachments[0].contentBytes,Buffer.from(bytes).toString('base64'));assert.equal(m.message.body.content,'TEST 2030-01-01');
});
