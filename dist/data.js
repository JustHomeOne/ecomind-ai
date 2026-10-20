export const CENTER = [71.4249, 51.1327];
export const DEPOT = { id: 'depot', name: 'База вывоза', lng: 71.4115, lat: 51.1280 };
const DEMO_SEED = [
  { id:'EM-001', name:'Площадка у дома 12', address:'ул. Достык, 12', lng:71.4184, lat:51.1340, fill:94, rate:9, confidence:'high', type:'Смешанные', capacity:1100, ago:12 },
  { id:'EM-002', name:'Северный двор', address:'ул. Достык, 16', lng:71.4201, lat:51.1366, fill:86, rate:7, confidence:'medium', type:'Смешанные', capacity:1100, ago:28 },
  { id:'EM-003', name:'У детской площадки', address:'ул. Сауран, 8', lng:71.4255, lat:51.1363, fill:42, rate:5, confidence:'high', type:'Переработка', capacity:770, ago:35 },
  { id:'EM-004', name:'Восточный въезд', address:'ул. Туркестан, 10', lng:71.4300, lat:51.1347, fill:78, rate:8, confidence:'high', type:'Смешанные', capacity:1100, ago:18 },
  { id:'EM-005', name:'Площадка у парка', address:'ул. Сауран, 14', lng:71.4269, lat:51.1303, fill:32, rate:4, confidence:'high', type:'Переработка', capacity:770, ago:42 },
  { id:'EM-006', name:'Южный двор', address:'ул. Сыганак, 18', lng:71.4214, lat:51.1301, fill:91, rate:10, confidence:'medium', type:'Смешанные', capacity:1100, ago:8 },
  { id:'EM-007', name:'Паркинг, сектор А', address:'ул. Достык, 20', lng:71.4169, lat:51.1315, fill:56, rate:6, confidence:'high', type:'Смешанные', capacity:1100, ago:54 },
  { id:'EM-008', name:'Площадка у дома 24', address:'ул. Туркестан, 24', lng:71.4326, lat:51.1314, fill:67, rate:5, confidence:'medium', type:'Смешанные', capacity:1100, ago:31 },
  { id:'EM-009', name:'Западный сквер', address:'ул. Сауран, 4', lng:71.4146, lat:51.1360, fill:23, rate:3, confidence:'high', type:'Переработка', capacity:770, ago:63 },
  { id:'EM-010', name:'Площадка у школы', address:'ул. Сыганак, 22', lng:71.4286, lat:51.1286, fill:72, rate:7, confidence:'medium', type:'Смешанные', capacity:1100, ago:25 },
  { id:'EM-011', name:'Центральная аллея', address:'ул. Сауран, 10', lng:71.4240, lat:51.1329, fill:48, rate:4, confidence:'high', type:'Переработка', capacity:770, ago:47 },
  { id:'EM-012', name:'Торговая галерея', address:'ул. Достык, 28', lng:71.4313, lat:51.1382, fill:64, rate:6, confidence:'medium', type:'Смешанные', capacity:1100, ago:21 },
];
export const DEMO_CONTAINERS=DEMO_SEED.map(record=>({...record,source:'demo',locationSource:'demo'}));
export const CONFIDENCE = { high:'Высокая', medium:'Средняя', low:'Низкая' };
// A measured fill value does not verify the position of a demo container.
// Real supplied records use locationSource:'real' and a non-demo observation source.
export function getContainerDataState(containers) {
  const demoLocations=containers.filter(c=>c.locationSource!=='real').length;
  const demoReadings=containers.filter(c=>!['manual','gemini','sensor','verified'].includes(c.source)).length;
  return {total:containers.length,demoLocations,demoReadings,hasDemo:demoLocations>0||demoReadings>0};
}
export function fillStatus(fill) {
  if (fill === null || fill === undefined) return { key:'unknown', label:'Нет оценки', color:'#8b95a0' };
  if (fill >= 90) return { key:'critical', label:'Срочный вывоз', color:'#df6957' };
  if (fill >= 75) return { key:'high', label:'Скоро вывоз', color:'#db9b3d' };
  return { key:'normal', label:'В норме', color:'#329b6b' };
}
export function haversine(a,b) {
  const r = Math.PI / 180, dLat=(b.lat-a.lat)*r, dLng=(b.lng-a.lng)*r;
  const h=Math.sin(dLat/2)**2 + Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLng/2)**2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
}
export function routeDistance(points) { return points.slice(1).reduce((sum,p,i)=>sum+haversine(points[i],p),0); }
export function optimizeRoute(stops, depot=DEPOT) {
  if(!stops.length) return {points:[depot,depot], baseline:[depot,depot], distance:0, originalDistance:0, saving:0};
  const remaining=[...stops], points=[depot];
  while(remaining.length) {
    let best=0;
    for(let i=1;i<remaining.length;i++) if(haversine(points.at(-1),remaining[i])<haversine(points.at(-1),remaining[best])) best=i;
    points.push(remaining.splice(best,1)[0]);
  }
  points.push(depot);
  let changed=true, passes=0;
  while(changed && passes++<80) {
    changed=false;
    for(let i=1;i<points.length-2;i++) for(let j=i+1;j<points.length-1;j++) {
      const before=haversine(points[i-1],points[i])+haversine(points[j],points[j+1]);
      const after=haversine(points[i-1],points[j])+haversine(points[i],points[j+1]);
      if(after<before-1e-8) {points.splice(i,j-i+1,...points.slice(i,j+1).reverse());changed=true;}
    }
  }
  const baseline=[depot,...stops,depot], originalDistance=routeDistance(baseline);
  if(routeDistance(points)>originalDistance) points.splice(0,points.length,...baseline);
  const distance=routeDistance(points);
  return { points, baseline, distance, originalDistance, saving:originalDistance ? Math.max(0,(1-distance/originalDistance)*100) : 0 };
}
export function selectStops(containers, policy='current', threshold=75, horizon=12) {
  return containers.filter(c=>policy==='calendar' || (Number.isFinite(c.fill) && (policy==='forecast' ? c.fill+c.rate*horizon/24 : c.fill)>=threshold));
}
export function aqiLabel(value) {
  if(!Number.isFinite(value)) return 'Нет данных';
  return value<=20?'Хорошее':value<=40?'Удовлетворительное':value<=60?'Умеренное':value<=80?'Плохое':value<=100?'Очень плохое':'Крайне плохое';
}
export const num=(v,d=0)=>Number.isFinite(v)?v.toLocaleString('ru-RU',{maximumFractionDigits:d}):'—';
