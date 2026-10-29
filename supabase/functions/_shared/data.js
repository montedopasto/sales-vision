export function unwrap({data,error}){if(error)throw new Error(error.message);return data;}
export async function getOrder(db,id){
 if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('Encomenda inválida');
 return unwrap(await db.from('sv_orders').select('*,sv_lines(*,sv_reservations(*,sv_stock(*))),sv_shipments(*)').eq('id',id).single());
}
export async function allRows(db,table,sort,activeOnly=false){
 const rows=[];
 for(let offset=0;offset<100000;offset+=500){
  let q=db.from(table).select('*').order(sort).range(offset,offset+499);
  if(activeOnly)q=q.eq('active',true);
  const page=unwrap(await q);rows.push(...page);if(page.length<500)return rows;
 }
 throw new Error('Mais de 100.000 registos: restringir a consulta');
}
export function integrationConfig(defaults,overrides={}){
 return {...defaults,...overrides,stock:{...defaults.stock,...overrides.stock},zolve:{...defaults.zolve,...overrides.zolve}};
}
export async function readIntegration(db,defaults){
 const row=unwrap(await db.from('sv_settings').select('value').eq('id','integration').maybeSingle());
 return integrationConfig(defaults,row?.value||{});
}
