import ExcelJS from 'exceljs';
export async function sha256(bytes){
 const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
 return [...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
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
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 // Bound ZIP expansion before ExcelJS parses XML.
 let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break;}
 if(end<0)throw new Error('O ficheiro não é um XLSX válido');
 const count=view.getUint16(end+10,true),offset=view.getUint32(end+16,true);
 if(count>2000||count===65535||offset>=end)throw new Error('Estrutura Excel excedida');
 let pos=offset,total=0;
 for(let i=0;i<count;i++){
  if(pos+46>end||view.getUint32(pos,true)!==0x02014b50)throw new Error('Arquivo Excel inválido');
  if(view.getUint16(pos+8,true)&1)throw new Error('Excel encriptado não suportado');
  total+=view.getUint32(pos+24,true);
  if(total>50*1024*1024)throw new Error('Excel expandido excede 50 MB');
  pos+=46+view.getUint16(pos+28,true)+view.getUint16(pos+30,true)+view.getUint16(pos+32,true);
 }
}
export async function readRows(bytes, mapping, kind) {
 bytes=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 if(!mapping?.reviewed || !mapping.sheet || !mapping.columns || !Number.isInteger(mapping.headerRow) || mapping.headerRow<1) throw new Error('Mapeamento dos anexos por validar');
 if(bytes.length>10*1024*1024) throw new Error('Ficheiro demasiado grande');
 checkZip(bytes);
 const book=new ExcelJS.Workbook(); await book.xlsx.load(bytes);
 const sheet=book.getWorksheet(mapping.sheet); if(!sheet) throw new Error('Folha configurada não encontrada');
 if(sheet.rowCount>50000 || sheet.columnCount>200) throw new Error('Dimensões do ficheiro excedidas');
 const headers=new Map(); sheet.getRow(mapping.headerRow).eachCell((cell,col)=>{const k=text(cell.value);if(!k)return;if(headers.has(k))throw new Error('Cabeçalho duplicado');headers.set(k,col);});
 const required=kind==='clients'?['id','name','address','postal_code','city']:['warehouse','sscc','product','description','lot','expires','entered','boxes','blocked',...(mapping.profile==='zolve-daily-v1'?['zone','kg','block_reason']:[])];
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
    const base=Object.fromEntries(['warehouse','sscc','product','description','lot'].map(k=>[k,text(get(k))]));
    if(!validSSCC(base.sscc)||!base.warehouse||!base.product)throw new Error('SSCC ou identificação do artigo inválidos');
    if(mapping.profile==='zolve-daily-v1'){
     const issues=[];
     const parseDate=(k)=>{if(get(k)==null||get(k)===''){issues.push(k==='expires'?'Validade em falta':'Data de entrada em falta');return null;}return date(get(k));};
     const expires=parseDate('expires'),entered=parseDate('entered');
     if(!base.description)issues.push('Descrição em falta');if(!base.lot)issues.push('Lote em falta');
     if(entered&&expires&&entered>expires)issues.push('Entrada posterior à validade');
     const zone=text(get('zone')),temperature=mapping.temperatures?.[zone];
     if(typeof temperature!=='number')issues.push('Temperatura da zona não configurada');
     const kg=get('kg');if(typeof kg!=='number'||!Number.isFinite(kg))throw new Error('Peso inválido');if(kg<0)issues.push('Peso negativo no relatório');
     const reason=text(get('block_reason'));
     // Preserve blank source values and quarantine the affected line; do not invent missing data.
     o={...base,expires,entered,boxes,zone,temperature:temperature??null,kg,block_reason:reason,quality_issues:issues,
      blocked:mapping.blockedStatuses.includes(status)||!!reason||issues.length>0,
      raw:{sheet:mapping.sheet,row:n,values:Object.fromEntries([...headers].map(([h,c])=>[h,row.getCell(c).value??null]))}};
    }else{
     o={...base,expires:date(get('expires')),entered:date(get('entered')),boxes,blocked:mapping.blockedStatuses.includes(status)};
     if(['description','lot'].some(k=>!o[k])||o.entered>o.expires)throw new Error('Identificação do lote inválida');
    }
   }
   const key=kind==='clients'?o.id:JSON.stringify([o.warehouse,o.sscc,o.product,o.lot]);if(seen.has(key))throw new Error('Linha duplicada');seen.add(key);result.push(o);
  } catch(e){throw new Error(`Linha ${n}: ${e.message}`);}
 }
 if(!result.length&&!mapping.allowEmpty)throw new Error('Ficheiro sem linhas válidas');return result;
}
const fields=new Set(['order_id','client_id','client_name','address','postal_code','city','delivery','product','description','sscc','lot','warehouse','boxes','expires']);
export async function zolveWorkbook(order, config) {
 const z=config.zolve;
 if(z?.profile==='zolve-fm01107-v1')return zolveForm(order,config);
 if(!z?.reviewed||!z.sheet||!Array.isArray(z.columns)||!z.columns.length)throw new Error('Layout Zolve ainda não validado com o anexo original');
 if(z.columns.some(c=>!c.header||!fields.has(c.field)))throw new Error('Colunas Zolve inválidas');
 const book=new ExcelJS.Workbook();const sheet=book.addWorksheet(z.sheet);
 sheet.columns=z.columns.map(c=>({header:c.header,key:c.field,width:c.width||24}));
 for(const line of order.sv_lines)for(const r of line.sv_reservations){
  if(!r.active)continue;const s=r.stock_snapshot;const c=order.client_snapshot;
  sheet.addRow({order_id:order.id,client_id:c.id,client_name:c.name,address:c.address,postal_code:c.postal_code,city:c.city,delivery:order.delivery,product:line.product,description:s.description,sscc:s.sscc,lot:s.lot,warehouse:s.warehouse,boxes:r.boxes,expires:s.expires});
 }
 sheet.getRow(1).font={bold:true}; sheet.views=[{state:'frozen',ySplit:1}];
 return new Uint8Array(await book.xlsx.writeBuffer());
}


// The daily report identifies a calendar date, not a measurement timestamp.
export function reportDate(fileName,mapping){
 const match=new RegExp(mapping.fileNamePattern||'(?!)').exec(fileName);
 if(!match?.groups?.date)throw new Error('Nome de ficheiro não corresponde ao relatório esperado');
 const d=match.groups.date;if(!/^\d{8}$/.test(d))throw new Error('Data de relatório inválida');
 return date(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6)}`);
}
function formRows(order){
 return order.sv_lines.flatMap(line=>line.sv_reservations.map(r=>({line,r,s:r.stock_snapshot})));
}
async function zolveForm(order,config){
 const z=config.zolve;if(!z.reviewed)throw new Error('Modelo FM.01107 por validar');
 const items=formRows(order);if(!items.length)throw new Error('Encomenda sem alocações');
 const c=order.client_snapshot;if(!c?.name||!c.address||!c.postal_code||!c.city)throw new Error('Morada de entrega incompleta');
 if(items.some(({s})=>!s.sscc||!s.description||typeof s.temperature!=='number'))throw new Error('Dados de SSCC, designação ou temperatura em falta');
 const book=new ExcelJS.Workbook();const sheet=book.addWorksheet('Folha1',{views:[{showGridLines:false}],pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'15:16'}});
 // Keep the form coordinates and visible fields from the supplied FM.01107.
 // Remove stale sample orders, hidden conflicting addresses, and 1M formatted empty rows.
 const widths=[18,43,11,25,18,3,3,3,43,20,3,3];
 widths.forEach((width,i)=>sheet.getColumn(i+1).width=width);
 ['A2:G2','H2:L2','A4:G4','H4:L4','A6:G6','H6:L6','A8:G8','A10:G10','A15:A16','B15:B16','C15:C16','D15:D16','E15:G15','E16:G16','H15:I16','J15:L16'].forEach(r=>sheet.mergeCells(r));
 const contact=order.owner_contact||{};
 sheet.getCell('A2').value='Empresa: Monte do Pasto, Lda';sheet.getCell('H2').value='Para: Zolve - Logística e Transporte, S.A.';
 sheet.getCell('A4').value=`Contacto: ${contact.name||contact.email||''}`;
 if(z.logisticsPhone)sheet.getCell('H4').value=`Telefone: ${z.logisticsPhone}`;
 if(order.created_at)sheet.getCell('A6').value=`Data: ${new Intl.DateTimeFormat('pt-PT',{timeZone:'Europe/Lisbon'}).format(new Date(order.created_at))}`;
 if(z.formEmail)sheet.getCell('H6').value=`E-mail: ${z.formEmail}`;
 sheet.getCell('A8').value=contact.phone?`Telefone: ${contact.phone}`:'Telefone:';
 sheet.getCell('A10').value=`E-mail: ${contact.email||''}`;
 sheet.getCell('A12').value='ASSUNTO:';sheet.getCell('B12').value='SAIDA STOCK';
 const headers={A15:'CODIGO ARTIGO',B15:'DESIGNAÇÃO ARTIGO',C15:'Nº CXS',D15:'NºPALETE (SSCC)',E15:'MERCADORIA',E16:'TEMPERATURA',H15:'DESTINATARIO',J15:'DATA E HORA DE ENTREGA'};
 for(const [cell,value] of Object.entries(headers))sheet.getCell(cell).value=value;
 const recipient=`${c.name}\n${c.address}\n${c.postal_code} ${c.city}`;
 for(let i=0;i<items.length;i++){
  const n=17+i,{line,r,s}=items[i];sheet.mergeCells(`E${n}:G${n}`);sheet.mergeCells(`H${n}:I${n}`);sheet.mergeCells(`J${n}:L${n}`);
  for(const [col,value] of Object.entries({A:line.product,B:s.description,C:r.boxes,D:s.sscc,E:s.temperature,H:recipient,J:new Date(order.delivery+'T00:00:00Z')}))sheet.getCell(`${col}${n}`).value=value;
  sheet.getCell(`D${n}`).numFmt='@';sheet.getCell(`C${n}`).numFmt='0';sheet.getCell(`E${n}`).numFmt='0" °C"';sheet.getCell(`J${n}`).numFmt='dd/mm/yyyy';sheet.getRow(n).height=Math.max(58,Math.ceil(Math.max(s.description.length/40,recipient.length/43))*14);
 }
 const last=16+items.length,footer=last+2;sheet.getCell(`A${footer}`).value='OBSERVAÇÕES:';
 sheet.mergeCells(`B${footer}:D${footer}`);sheet.getCell(`B${footer}`).value=`Sales Vision · ${order.id}`;
 sheet.getCell(`E${footer}`).value={formula:`SUM(C17:C${last})`,result:items.reduce((sum,x)=>sum+x.r.boxes,0)};
 for(let n=1;n<=footer;n++)for(let col=1;col<=12;col++){
  const cell=sheet.getCell(n,col);cell.font={name:'Arial',size:10};cell.alignment={vertical:'middle',wrapText:true};
  if(n>=15&&n<=last)cell.border={top:{style:'thin',color:{argb:'FFD6DED6'}},bottom:{style:'thin',color:{argb:'FFD6DED6'}}};
 }
 for(const n of [15,16]){sheet.getRow(n).height=25;for(let col=1;col<=12;col++){const cell=sheet.getCell(n,col);cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE9EEE5'}};cell.font={name:'Arial',size:10,bold:true};cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};}}
 sheet.getRow(2).height=30;sheet.getRow(12).height=26;
 sheet.getCell(`E${footer}`).font={name:'Arial',size:10,bold:true};sheet.pageSetup.printArea=`A1:L${footer}`;
 book.calcProperties.fullCalcOnLoad=true;return new Uint8Array(await book.xlsx.writeBuffer());
}
