export const sheetUrl='https://docs.google.com/spreadsheets/d/1Ckji4wIRpD8ICvoQZ0eYG7oS_-qDreaOLv7wgU2X8dI/edit';
export const stockCsvUrl='https://docs.google.com/spreadsheets/d/1Ckji4wIRpD8ICvoQZ0eYG7oS_-qDreaOLv7wgU2X8dI/gviz/tq?tqx=out:csv&sheet=STOCKS&tq=select%20*%20where%20G%20%3D%20%27ZOLVE%27';
export function parseCsv(input){
 if(typeof input!=='string'||input.length>3000000||/^\s*</.test(input))throw new Error('Resposta Google Sheets inválida');
 const rows=[];let row=[],cell='',quoted=false;
 const s=input.replace(/^\uFEFF/,'');
 for(let i=0;i<s.length;i++){
  const c=s[i];
  if(c==='"'){if(quoted&&s[i+1]==='"'){cell+='"';i++;}else if(quoted||cell==='')quoted=!quoted;else throw new Error('CSV inválido');}
  else if(!quoted&&(c===','||c==='\n'||c==='\r')){row.push(cell);cell='';if(c!==','){rows.push(row);row=[];if(c==='\r'&&s[i+1]==='\n')i++;}}
  else cell+=c;
 }
 if(quoted)throw new Error('CSV incompleto');
 if(cell!==''||row.length){row.push(cell);rows.push(row);}
 if(rows.length>20000)throw new Error('Folha excede o limite de leitura');return rows;
}
function numberPt(value){const s=String(value??'').replace(/[\s\u00a0]/g,'');if(!s)return null;
 const n=s.includes(',')?s.replace(/\./g,'').replace(',','.'):s;
 return /^-?\d+(?:\.\d+)?$/.test(n)&&Number.isFinite(Number(n))?Number(n):null;
}
function isoDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return null;const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value?value:null;}
function validSscc(s){if(!/^\d{18}$/.test(s))return false;let sum=0;for(let i=0;i<17;i++)sum+=Number(s[i])*(i%2===0?3:1);return (10-sum%10)%10===Number(s[17]);}
export async function googleStock(csv,{now=new Date()}={}){
 const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Lisbon"}).format(now);
 const rows=parseCsv(csv),header=rows.shift()||[];
 const expected=['CodigoArtigo','NomeProduto','SSCC','Lote','DataEntradaLote','DataValidade','Armazem','KG'];
 const indices=expected.map(name=>{if(header.filter(h=>h.trim()===name).length!==1)throw new Error('Coluna Google Sheets inválida: '+name);return header.findIndex(h=>h.trim()===name);});
 const extraNames=["CaixasDisponiveis","Bloqueado","MotivoBloqueio","TipoStock","DataRelatorio"];
 const extra=extraNames.map(name=>header.filter(h=>h.trim()===name).length===1?header.findIndex(h=>h.trim()===name):-1);
 const occurrences=new Map(),stock=[];
 for(const cells of rows){
  const values=indices.map(i=>cells[i]??'');if(!values.some(v=>v.trim()))continue;
  const [product,description,sscc,lot,entry,expiry,warehouse,weight]=values;
  if(warehouse.trim().toUpperCase()!=='ZOLVE')continue;
  const kg=numberPt(weight),entered=isoDate(entry),expires=isoDate(expiry);
  const [rawBoxes,rawBlocked,reason,type,rawDate]=extra.map(i=>i<0?'':String(cells[i]??'').trim());
  const parsedBoxes=numberPt(rawBoxes),boxes=Number.isSafeInteger(parsedBoxes)&&parsedBoxes>=0?parsedBoxes:null;
  const warehouseBlocked=rawBlocked==='Sim'?true:rawBlocked==='Não'?false:null;
  const stockType=['FRZ','FRE'].includes(type)?type:null,reportDate=isoDate(rawDate);
  const issues=[];
  if(boxes===null)issues.push('Caixas em falta ou inválidas');
  if(warehouseBlocked===null)issues.push('Estado de bloqueio em falta ou inválido');
  if(!stockType)issues.push('Tipo FRZ/FRE em falta ou inválido');
  if(!reportDate)issues.push('Data do relatório em falta ou inválida');
  else if(reportDate>today)issues.push('Data do relatório no futuro');
  if(reason&&warehouseBlocked===false)issues.push('Motivo de bloqueio incompatível com estado Não');
  if(!validSscc(sscc))issues.push('SSCC sem formato/check digit GS1 válido');
  if(!entered)issues.push('Data de entrada em falta ou inválida');if(!expires)issues.push('Validade em falta ou inválida');
  if(kg===null)issues.push('Quilos em falta ou inválidos');else if(kg<0)issues.push('Peso negativo na origem');
  if(!product||!description||!lot)issues.push('Artigo, descrição ou lote em falta');
  const identity=JSON.stringify([warehouse,sscc,product,lot]);const count=occurrences.get(identity)||0;occurrences.set(identity,count+1);
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity+'#'+count))),b=>b.toString(16).padStart(2,'0')).join('').slice(0,32);
  const id=[digest.slice(0,8),digest.slice(8,12),digest.slice(12,16),digest.slice(16,20),digest.slice(20)].join('-');
  stock.push({id,source:'Google Sheets',warehouse,sscc,product,description,lot,entered,expires,kg,boxes,available:0,blocked:warehouseBlocked!==false||!!reason,warehouse_blocked:warehouseBlocked,zone:stockType||'',stock_type:stockType,temperature:null,block_reason:reason||(warehouseBlocked===true?'Bloqueado no relatório ZOLVE':''),quality_issues:issues,fresh:reportDate===today,observed_at:null,report_date:reportDate});
 }
 return stock;
}
export function createStockReader({userClient,origins,fetchImpl=fetch}){return async req=>{
 const origin=req.headers.get('origin');const headers={'Content-Type':'application/json','Vary':'Origin','Cache-Control':'no-store'};
 if(origin&&origins.includes(origin))headers['Access-Control-Allow-Origin']=origin;
 const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(origin&&!origins.includes(origin))return reply({error:'Origem não autorizada'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}});
 if(!['GET','POST'].includes(req.method))return reply({error:'Método inválido'},405);
 const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];if(!token)return reply({error:'Autenticação necessária'},401);
 try{
  const db=userClient(token),auth=await db.auth.getUser(token);if(auth.error||!auth.data?.user)return reply({error:'Sessão inválida'},401);
  const member=await db.from('sv_users').select('active').eq('id',auth.data.user.id).maybeSingle();if(member.error||!member.data?.active)return reply({error:'Utilizador sem autorização'},403);
  const response=await fetchImpl(stockCsvUrl,{signal:AbortSignal.timeout(25000),cache:'no-store'});
  if(!response.ok)throw new Error('Google Sheets indisponível ('+response.status+')');
  const stock=await googleStock(await response.text()),fetched_at=new Date().toISOString();
  const snapshots=['FRE','FRZ'].flatMap(type=>{const subset=stock.filter(s=>s.stock_type===type);return [...new Set(subset.map(s=>s.report_date))].map(date=>({source:'Google Sheets · ZOLVE · '+type,observed_at:null,report_date:date,observed_precision:'day',fetched_at,row_count:subset.filter(s=>s.report_date===date).length}));});
  if(!snapshots.length)snapshots.push({source:'Google Sheets · STOCKS · ZOLVE',observed_at:null,report_date:null,observed_precision:'read',fetched_at,row_count:stock.length});
  return reply({stock,reservations_enabled:false,snapshots,source:{url:sheetUrl,sheet:'STOCKS',warehouse:'ZOLVE',fetched_at,rows:stock.length}});
 }catch(e){return reply({error:e.message||'Falha na leitura Google Sheets'},502);}
};}
