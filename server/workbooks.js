import ExcelJS from 'exceljs';
import { createHash } from 'node:crypto';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function validSSCC(s) {
 if(!/^\d{18}$/.test(s)) return false;
 const sum=[...s.slice(0,17)].reverse().reduce((n,d,i)=>n+Number(d)*(i%2?1:3),0);
 return (10-sum%10)%10===Number(s[17]);
}
const text = v => {
 if(v && typeof v==='object') throw new Error('Fórmulas, links e células compostas não são aceites nos campos importados');
 return v==null?'':String(v).trim();
};
function date(v) {
 if(v instanceof Date && !isNaN(v)) return v.toISOString().slice(0,10);
 const s=text(v);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s) || new Date(s).toISOString().slice(0,10)!==s) throw new Error('Data inválida; usar data Excel ou AAAA-MM-DD');
 return s;
}
function checkZip(bytes) {
 // Bound ZIP expansion before ExcelJS parses XML.
 let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0)throw new Error('O ficheiro não é um XLSX válido');
 const count=bytes.readUInt16LE(end+10),offset=bytes.readUInt32LE(end+16);
 if(count>2000||count===65535||offset>=end)throw new Error('Estrutura Excel excedida');
 let pos=offset,total=0;
 for(let i=0;i<count;i++){
  if(pos+46>end||bytes.readUInt32LE(pos)!==0x02014b50)throw new Error('Arquivo Excel inválido');
  if(bytes.readUInt16LE(pos+8)&1)throw new Error('Excel encriptado não suportado');
  total+=bytes.readUInt32LE(pos+24);
  if(total>50*1024*1024)throw new Error('Excel expandido excede 50 MB');
  pos+=46+bytes.readUInt16LE(pos+28)+bytes.readUInt16LE(pos+30)+bytes.readUInt16LE(pos+32);
 }
}
export async function readRows(bytes, mapping, kind) {
 if(!mapping?.reviewed || !mapping.sheet || !mapping.columns || !Number.isInteger(mapping.headerRow) || mapping.headerRow<1) throw new Error('Mapeamento dos anexos por validar');
 if(bytes.length>10*1024*1024) throw new Error('Ficheiro demasiado grande');
 checkZip(bytes);
 const book=new ExcelJS.Workbook(); await book.xlsx.load(bytes);
 const sheet=book.getWorksheet(mapping.sheet); if(!sheet) throw new Error('Folha configurada não encontrada');
 if(sheet.rowCount>50000 || sheet.columnCount>200) throw new Error('Dimensões do ficheiro excedidas');
 const headers=new Map(); sheet.getRow(mapping.headerRow).eachCell((cell,col)=>{const k=text(cell.value);if(headers.has(k))throw new Error('Cabeçalho duplicado');headers.set(k,col);});
 const required=kind==='clients'?['id','name','address','postal_code','city']:['warehouse','sscc','product','description','lot','expires','entered','boxes','blocked'];
 for(const k of required) if(!headers.has(mapping.columns[k]))throw new Error(`Coluna obrigatória não encontrada: ${k}`);
 const result=[], seen=new Set();
 for(let n=mapping.headerRow+1;n<=sheet.rowCount;n++) {
  const row=sheet.getRow(n);if(!row.hasValues)continue;
  const get=k=>row.getCell(headers.get(mapping.columns[k])).value;
  try {
   let o;
   if(kind==='clients') {o=Object.fromEntries(required.map(k=>[k,text(get(k))]));if(Object.values(o).some(x=>!x))throw new Error('Dados de cliente incompletos');}
   else {
    if(typeof get('sscc')!=='string')throw new Error('SSCC deve ser texto com os 18 dígitos preservados');
    const boxes=get('boxes'); if(typeof boxes!=='number'||!Number.isSafeInteger(boxes)||boxes<0)throw new Error('Caixas devem ser um inteiro explícito; KG não são caixas');
    const status=text(get('blocked'));if(!Array.isArray(mapping.allowedStatuses)||!Array.isArray(mapping.blockedStatuses)||!mapping.allowedStatuses.includes(status))throw new Error('Estado de stock desconhecido');
    o={...Object.fromEntries(['warehouse','sscc','product','description','lot'].map(k=>[k,text(get(k))])),expires:date(get('expires')),entered:date(get('entered')),boxes,blocked:mapping.blockedStatuses.includes(status)};
    if(!validSSCC(o.sscc)||['warehouse','product','description','lot'].some(k=>!o[k])||o.entered>o.expires)throw new Error('SSCC ou identificação do lote inválidos');
   }
   const key=kind==='clients'?o.id:JSON.stringify([o.warehouse,o.sscc,o.product,o.lot]);if(seen.has(key))throw new Error('Linha duplicada');seen.add(key);result.push(o);
  } catch(e){throw new Error(`Linha ${n}: ${e.message}`);}
 }
 if(!result.length)throw new Error('Ficheiro sem linhas válidas');return result;
}
const fields=new Set(['order_id','client_id','client_name','address','postal_code','city','delivery','product','description','sscc','lot','warehouse','boxes','expires']);
export async function zolveWorkbook(order, config) {
 const z=config.zolve;
 if(!z?.reviewed||!z.sheet||!Array.isArray(z.columns)||!z.columns.length)throw new Error('Layout Zolve ainda não validado com o anexo original');
 if(z.columns.some(c=>!c.header||!fields.has(c.field)))throw new Error('Colunas Zolve inválidas');
 const book=new ExcelJS.Workbook();const sheet=book.addWorksheet(z.sheet);
 sheet.columns=z.columns.map(c=>({header:c.header,key:c.field,width:c.width||24}));
 for(const line of order.sv_lines)for(const r of line.sv_reservations){
  if(!r.active)continue;const s=r.stock_snapshot;const c=order.client_snapshot;
  sheet.addRow({order_id:order.id,client_id:c.id,client_name:c.name,address:c.address,postal_code:c.postal_code,city:c.city,delivery:order.delivery,product:line.product,description:s.description,sscc:s.sscc,lot:s.lot,warehouse:s.warehouse,boxes:r.boxes,expires:s.expires});
 }
 sheet.getRow(1).font={bold:true}; sheet.views=[{state:'frozen',ySplit:1}];
 return Buffer.from(await book.xlsx.writeBuffer());
}
