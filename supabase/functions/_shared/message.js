export function toBase64(bytes){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
export function message(order,bytes,cfg){
 if(!cfg.recipients?.length||cfg.recipients.concat(cfg.cc||[]).some(x=>!/^\S+@\S+\.\S+$/.test(x))||!cfg.subjectPrefix||!cfg.body)throw new Error('Destinatários e mensagem Zolve por configurar');
 if(bytes.length>=3*1024*1024)throw new Error('Anexo excede limite Graph de 3 MB');
 return {message:{subject:`${cfg.subjectPrefix} ${order.id}`,body:{contentType:'Text',content:cfg.body.replaceAll('{{order_id}}',order.id).replaceAll('{{delivery}}',order.delivery)},toRecipients:cfg.recipients.map(address=>({emailAddress:{address}})),ccRecipients:(cfg.cc||[]).map(address=>({emailAddress:{address}})),attachments:[{'@odata.type':'#microsoft.graph.fileAttachment',name:`SalesVision_${order.id}.xlsx`,contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',contentBytes:toBase64(bytes)}]},saveToSentItems:true};
}
