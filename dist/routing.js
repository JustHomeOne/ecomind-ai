import {DEPOT} from './data.js';

export const ROUTING_URL='https://routing.openstreetmap.de/routed-car';
export const ROUTING_SOURCE='OSRM · FOSSGIS · OpenStreetMap';
export class RoutingError extends Error {}

export function networkKey(containers,depot=DEPOT){
  return [depot,...containers].map(p=>`${p.id}:${p.lng},${p.lat}`).join('|');
}
function coordinates(points){
  if(points.length>40)throw new RoutingError('В одном рейсе поддерживается до 39 площадок.');
  return points.map(p=>{
    if(!Number.isFinite(p.lng)||!Number.isFinite(p.lat)||Math.abs(p.lat)>90||Math.abs(p.lng)>180)throw new RoutingError('Проверьте координаты контейнеров.');
    return `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`;
  }).join(';');
}
export function parseNetwork(payload,points){
  const size=points.length;
  if(payload?.code!=='Ok'||!Array.isArray(payload.distances)||!Array.isArray(payload.durations)||payload.distances.length!==size||payload.durations.length!==size)throw new RoutingError('Сервис не вернул дорожную матрицу. Повторите расчёт.');
  for(const matrix of [payload.distances,payload.durations])for(const row of matrix){
    if(!Array.isArray(row)||row.length!==size||row.some(v=>v!==null&&(!Number.isFinite(v)||v<0)))throw new RoutingError('Сервис вернул некорректные расстояния.');
  }
  return {points,distances:payload.distances,durations:payload.durations,snaps:payload.sources||[],fetchedAt:Date.now(),source:ROUTING_SOURCE};
}
function pathCost(order,matrix){
  let sum=0;
  for(let i=1;i<order.length;i++){const v=matrix[order[i-1]]?.[order[i]];if(!Number.isFinite(v))return Infinity;sum+=v;}
  return sum;
}
export function planOnNetwork(network,stops){
  const byId=new Map(network.points.map((p,i)=>[p.id,i]));
  const selected=stops.map(p=>byId.get(p.id));
  if(selected.some(i=>i===undefined))throw new RoutingError('Координаты изменились. Обновите дорожную матрицу.');
  const baseline=[0,...selected,0];
  if(!Number.isFinite(pathCost(baseline,network.distances)))throw new RoutingError('Между выбранными остановками нет автомобильного проезда в дорожных данных.');
  let order=[0],remaining=[...selected];
  while(remaining.length){
    const last=order.at(-1);let best=0;
    for(let i=1;i<remaining.length;i++)if((network.distances[last][remaining[i]]??Infinity)<(network.distances[last][remaining[best]]??Infinity))best=i;
    order.push(remaining.splice(best,1)[0]);
  }
  order.push(0);
  // The matrix is directed: reversing a section changes all internal road costs.
  let changed=true,passes=0;
  while(changed&&passes++<30){
    changed=false;
    for(let i=1;i<order.length-2;i++)for(let j=i+1;j<order.length-1;j++){
      const candidate=[...order.slice(0,i),...order.slice(i,j+1).reverse(),...order.slice(j+1)];
      if(pathCost(candidate,network.distances)+.01<pathCost(order,network.distances)){order=candidate;changed=true;}
    }
  }
  if(pathCost(order,network.distances)>pathCost(baseline,network.distances))order=baseline;
  if(!Number.isFinite(pathCost(order,network.durations))||!Number.isFinite(pathCost(baseline,network.durations)))throw new RoutingError('Не получено время движения между остановками. Повторите расчёт.');
  const distance=pathCost(order,network.distances)/1000,originalDistance=pathCost(baseline,network.distances)/1000;
  return {points:order.map(i=>network.points[i]),baseline:baseline.map(i=>network.points[i]),distance,originalDistance,duration:pathCost(order,network.durations),originalDuration:pathCost(baseline,network.durations),saving:originalDistance?Math.max(0,(1-distance/originalDistance)*100):0,geometry:null,source:ROUTING_SOURCE};
}
export function parseRoadRoute(payload,points){
  const route=payload?.routes?.[0],line=route?.geometry;
  if(payload?.code!=='Ok'||line?.type!=='LineString'||!Array.isArray(line.coordinates)||line.coordinates.length<2||line.coordinates.some(p=>!Array.isArray(p)||p.length<2||!Number.isFinite(p[0])||!Number.isFinite(p[1])||Math.abs(p[0])>180||Math.abs(p[1])>90)||!Number.isFinite(route.distance)||route.distance<0||!Number.isFinite(route.duration)||route.duration<0)throw new RoutingError('Дорожный маршрут не получен. Прямые линии вместо дорог не отображаются.');
  if(!Array.isArray(payload.waypoints)||payload.waypoints.length!==points.length||payload.waypoints.some(p=>!Array.isArray(p.location)||p.location.length!==2||!p.location.every(Number.isFinite)||!Number.isFinite(p.distance)||p.distance>400))throw new RoutingError('Для одной из площадок не найден подъезд в пределах 400 метров.');
  return {geometry:line,distance:route.distance/1000,duration:route.duration,snaps:payload.waypoints.map((p,i)=>({id:points[i].id,location:p.location,offset:p.distance,name:p.name||''})),source:ROUTING_SOURCE};
}
export function createRoadRouter({fetcher=globalThis.fetch,baseUrl=ROUTING_URL,intervalMs=1200,timeoutMs=22000,cacheMs=600000}={}){
  const cache=new Map();let tail=Promise.resolve(),lastStart=0;
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  function request(path){
    const cached=cache.get(path);if(cached&&cached.until>Date.now())return cached.promise;
    const promise=tail.catch(()=>{}).then(async()=>{
      const wait=lastStart+intervalMs-Date.now();if(wait>0)await sleep(wait);lastStart=Date.now();
      let response;
      try{response=await fetcher(baseUrl+path,{signal:AbortSignal.timeout(timeoutMs)});}catch(error){throw new RoutingError(error.name==='TimeoutError'?'Сервис маршрутов не ответил вовремя. Попробуйте ещё раз.':'Не удалось связаться с сервисом дорожных маршрутов. Проверьте интернет.');}
      if(!response.ok)throw new RoutingError(response.status===429?'Сервис маршрутов просит снизить частоту запросов. Повторите чуть позже.':'Сервис дорожных маршрутов временно недоступен.');
      let result;try{result=await response.json();}catch{throw new RoutingError('Сервис маршрутов вернул некорректный ответ.');}
      if(result.code!=='Ok')throw new RoutingError(result.code==='NoRoute'||result.code==='NoSegment'?'Не найден автомобильный проезд между выбранными точками.':'Не удалось рассчитать дорожный маршрут.');
      return result;
    });
    tail=promise.catch(()=>{});cache.set(path,{promise,until:Date.now()+cacheMs});
    promise.catch(()=>{if(cache.get(path)?.promise===promise)cache.delete(path);});
    return promise;
  }
  async function getNetwork(containers,depot=DEPOT){
    const points=[depot,...containers],coords=coordinates(points);
    const radiuses=points.map(()=>400).join(';');
    const payload=await request(`/table/v1/driving/${coords}?annotations=distance,duration&generate_hints=false&radiuses=${radiuses}`);
    return parseNetwork(payload,points);
  }
  async function getRoute(points){
    const coords=coordinates(points),radiuses=points.map(()=>400).join(';');
    const payload=await request(`/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false&generate_hints=false&continue_straight=false&radiuses=${radiuses}`);
    return parseRoadRoute(payload,points);
  }
  async function buildPlan(network,stops){
    const plan=planOnNetwork(network,stops);
    if(!stops.length)return {...plan,geometry:null,snaps:[]};
    const optimized=await getRoute(plan.points);
    const same=plan.points.every((p,i)=>p.id===plan.baseline[i].id);
    const baseline=same?optimized:await getRoute(plan.baseline);
    const chooseBaseline=optimized.distance>baseline.distance+.001;
    const chosen=chooseBaseline?baseline:optimized;
    return {...plan,...chosen,points:chooseBaseline?plan.baseline:plan.points,originalDistance:baseline.distance,originalDuration:baseline.duration,saving:baseline.distance?Math.max(0,(1-chosen.distance/baseline.distance)*100):0};
  }
  return {getNetwork,getRoute,buildPlan};
}
