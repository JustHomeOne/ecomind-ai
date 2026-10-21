import {aqiTone} from './air-data.js';
export const AIR_GRID_CENTERS=Array.from({length:9},(_,i)=>({lat:50.8+(i%3)*.4,lng:70.8+Math.floor(i/3)*.4}));
export const AIR_METRICS={european_aqi:{label:'Европейский AQI',unit:'AQI',limits:[20,40,60,80,100]},pm2_5:{label:'PM2.5',unit:'мкг/м³',limits:[5,15,50,90,140]},pm10:{label:'PM10',unit:'мкг/м³',limits:[15,45,120,195,270]}};
export const AIR_COLORS=['#39a67b','#c1ad45','#e29b42','#db6e55','#ac6298','#85486e'];
export function airColor(value,metric='european_aqi'){if(!Number.isFinite(value)||value<0)return '#91a1b8';const i=AIR_METRICS[metric].limits.findIndex(limit=>value<=limit);return AIR_COLORS[i<0?5:i];}
export function parseAirGrid(payload,now=Date.now()){
  if(!Array.isArray(payload)||payload.length!==AIR_GRID_CENTERS.length)throw new Error('Источник не вернул полную сетку качества воздуха.');
  const cells=payload.map((p,i)=>{
    if(!Number.isFinite(p.current?.time)||!Number.isFinite(p.latitude)||!Number.isFinite(p.longitude))throw new Error('Некорректные координаты или время воздушного слоя.');
    const values={};for(const key of Object.keys(AIR_METRICS)){const v=p.current[key];values[key]=typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;}
    return {id:i,lat:Math.round(p.latitude*10)/10,lng:Math.round(p.longitude*10)/10,time:p.current.time,values};
  });
  return {cells,fetchedAt:now,source:'Copernicus CAMS Global / Open-Meteo',resolution:'0,4° · около 45 км',stale:cells.some(c=>now-c.time*1000>6*3600000)};
}
export function gridGeoJSON(grid,metric='european_aqi'){
  return {type:'FeatureCollection',features:(grid?.cells||[]).map(c=>({type:'Feature',properties:{id:c.id,value:c.values[metric],label:AIR_METRICS[metric].label,unit:AIR_METRICS[metric].unit,color:airColor(c.values[metric],metric),time:c.time,status:metric==='european_aqi'?aqiTone(c.values[metric]).label:''},geometry:{type:'Polygon',coordinates:[[[c.lng-.2,c.lat-.2],[c.lng+.2,c.lat-.2],[c.lng+.2,c.lat+.2],[c.lng-.2,c.lat+.2],[c.lng-.2,c.lat-.2]]]}}))};
}
let pending,cached;
export function rasterGrid(grid,metric='european_aqi'){
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=768;const ctx=canvas.getContext('2d');
  const west=70.6,east=71.8,south=50.6,north=51.8,merc=lat=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
  const x=lng=>(lng-west)/(east-west)*768,y=lat=>(merc(north)-merc(lat))/(merc(north)-merc(south))*768;
  for(const c of grid?.cells||[]){const left=x(c.lng-.2),top=y(c.lat+.2),width=x(c.lng+.2)-left,height=y(c.lat-.2)-top;ctx.fillStyle=airColor(c.values[metric],metric);ctx.fillRect(left,top,width,height);ctx.strokeStyle='#4e668b';ctx.lineWidth=1;ctx.setLineDash([4,5]);ctx.strokeRect(left,top,width,height);}
  return {url:canvas.toDataURL('image/png'),coordinates:[[west,north],[east,north],[east,south],[west,south]]};
}
export async function fetchAirGrid(force=false){
  if(pending)return pending;if(!force&&cached&&Date.now()-cached.fetchedAt<15*60000)return cached;
  pending=(async()=>{const q=new URLSearchParams({latitude:AIR_GRID_CENTERS.map(c=>c.lat.toFixed(1)).join(','),longitude:AIR_GRID_CENTERS.map(c=>c.lng.toFixed(1)).join(','),current:'european_aqi,pm2_5,pm10',domains:'cams_global',timezone:'Asia/Almaty',timeformat:'unixtime',forecast_days:'1'});const response=await fetch('https://air-quality-api.open-meteo.com/v1/air-quality?'+q,{signal:AbortSignal.timeout(25000)});if(!response.ok)throw new Error('Источник воздушного слоя недоступен. Повторите загрузку.');cached=parseAirGrid(await response.json());return cached;})();
  try{return await pending;}finally{pending=null;}
}
