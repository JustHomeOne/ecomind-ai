export const CLOUD_URL='https://ecomind-ai-city.brave-ridge-2075.chatgpt.site';
export function cloudAvailable(){return location.hostname.endsWith('.chatgpt.site')||['localhost','127.0.0.1'].includes(location.hostname);}
export async function cloudRequest(path,options={}){
  const response=await fetch('/api/team/'+path,{...options,headers:{...(options.body&&typeof options.body==='string'?{'Content-Type':'application/json'}:{}),...options.headers},signal:AbortSignal.timeout(15000)});
  const result=await response.json().catch(()=>({error:'Сервер вернул некорректный ответ.'}));if(!response.ok){const error=new Error(result.error||'Не удалось связаться с общей базой.');error.status=response.status;throw error;}return result;
}
