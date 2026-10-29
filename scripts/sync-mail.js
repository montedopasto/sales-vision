// Run from a scheduler. No mail is sent by this worker.
import {client,config,unwrap,env} from '../server/services.js';
import {readRows,sha256} from '../server/workbooks.js';
const required=['ENTRA_TENANT_ID','ENTRA_CLIENT_ID','ENTRA_CLIENT_SECRET','GRAPH_MAILBOX','GRAPH_FOLDER_ID','GRAPH_ALLOWED_SENDER'];
for(const name of required)if(!env[name])throw new Error(`Configurar ${name}`);
if(!/^[0-9a-f-]{36}$/i.test(env.ENTRA_TENANT_ID))throw new Error('Tenant Entra inválido');
const auth=await fetch(`https://login.microsoftonline.com/${env.ENTRA_TENANT_ID}/oauth2/v2.0/token`,{method:'POST',body:new URLSearchParams({client_id:env.ENTRA_CLIENT_ID,client_secret:env.ENTRA_CLIENT_SECRET,scope:'https://graph.microsoft.com/.default',grant_type:'client_credentials'}),signal:AbortSignal.timeout(30000)});
if(!auth.ok)throw new Error(`Autenticação Microsoft: ${auth.status}`);const {access_token}=await auth.json();
const cfg=await config(),db=client(null,true);
async function get(url){if(!url.startsWith('https://graph.microsoft.com/v1.0/'))throw new Error('URL Graph inválido');const r=await fetch(url,{headers:{Authorization:`Bearer ${access_token}`},signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error(`Graph: ${r.status}`);return r.json();}
const root=`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(env.GRAPH_MAILBOX)}/mailFolders/${encodeURIComponent(env.GRAPH_FOLDER_ID)}`;
let url=root+'/messages?$top=50&$orderby=receivedDateTime%20desc&$select=id,from,receivedDateTime,subject,hasAttachments';
const candidates=[];let pages=0;
while(url){if(++pages>20)throw new Error('Pasta excede 1000 mensagens; arquivar ou restringir a pasta de integração');const page=await get(url);candidates.push(...page.value);url=page['@odata.nextLink'];}
// Oldest first; monotonic database snapshots reject late/out-of-order files.
for(const mail of candidates.reverse()){
 if(!mail.hasAttachments||mail.from?.emailAddress?.address?.toLowerCase()!==env.GRAPH_ALLOWED_SENDER.toLowerCase())continue;
 let next=`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(env.GRAPH_MAILBOX)}/messages/${encodeURIComponent(mail.id)}/attachments`;const attachments=[];
 while(next){const page=await get(next);attachments.push(...page.value);next=page['@odata.nextLink'];}
 for(const file of attachments){
  if(file['@odata.type']!=='#microsoft.graph.fileAttachment'||!file.name?.toLowerCase().endsWith('.xlsx'))continue;
  const matches=['FRZ','FRE'].filter(source=>cfg.stock[source]?.fileNamePattern&&new RegExp(cfg.stock[source].fileNamePattern).test(file.name));
  if(matches.length!==1)throw new Error('Nome do anexo sem correspondência única FRZ/FRE');
  const source=matches[0],mapping=cfg.stock[source];
  // Received time is not assumed to equal stock observation time.
  const match=new RegExp(mapping.snapshotPattern||'(?!)').exec(file.name);
  if(!match?.groups?.date)throw new Error('Data do snapshot não identificada no anexo');
  const observed=match.groups.date+(mapping.snapshotTimeSuffix||'');if(isNaN(Date.parse(observed)))throw new Error('Data/hora do snapshot inválida');
  if(file.size>10*1024*1024||!file.contentBytes)throw new Error('Anexo inválido ou demasiado grande');
  const bytes=Buffer.from(file.contentBytes,'base64'),hash=sha256(bytes);
  const previous=unwrap(await db.from('sv_snapshots').select('*').eq('source',source).maybeSingle());
  if(previous&&(previous.fingerprint===hash||Date.parse(previous.observed_at)>=Date.parse(observed)))continue;
  const rows=await readRows(bytes,mapping,source);
  unwrap(await db.rpc('sv_import_stock',{p_source:source,p_observed:observed,p_hash:hash,p_rows:rows}));
  console.log(`${source}: ${rows.length} linhas importadas`);
 }
}
