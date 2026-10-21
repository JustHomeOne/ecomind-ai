import {airColor,AIR_COLORS} from './air-map.js';

export {AIR_COLORS};
export const STATION_METRICS={pm2_5:{label:'PM2.5',unit:'мкг/м³',limits:[5,15,50,90,140]},pm10:{label:'PM10',unit:'мкг/м³',limits:[15,45,120,195,270]}};
export const STATION_SOURCE='https://github.com/qazybekb/AirDatakz-OpenData';
export const STATION_LICENSE='https://creativecommons.org/licenses/by-nc/4.0/';
export const MAX_STATION_AGE=36*3600000;
const DATA_BASE='https://raw.githubusercontent.com/qazybekb/AirDatakz-OpenData/main/astana/';
const CACHE_KEY='ecomind-air-stations-v1',CACHE_TTL=3600000;
const REQUIRED=['datetime_utc','station_id','station_name','source','lat','lon','value_ugm3'];
const finiteNumber=value=>typeof value==='string'&&value.trim()!==''&&Number.isFinite(Number(value))?Number(value):null;

// Streaming RFC 4180 parser: quoted commas, escaped quotes and chunk boundaries
// are handled without holding the 46 MB historical CSV files in memory.
export function csvRows(onRow){
  let field='',row=[],quoted=false,afterQuote=false,skipLF=false;
  function emit(){row.push(field);onRow(row);row=[];field='';}
  function push(chunk){
    for(const char of chunk){
      if(skipLF){skipLF=false;if(char==='\n')continue;}
      if(quoted){if(char==='"'){quoted=false;afterQuote=true;}else field+=char;continue;}
      if(afterQuote&&char==='"'){field+='"';quoted=true;afterQuote=false;continue;}
      afterQuote=false;
      if(char==='"'&&field===''){quoted=true;continue;}
      if(char===','){row.push(field);field='';}
      else if(char==='\n'||char==='\r'){emit();skipLF=char==='\r';}
      else field+=char;
    }
  }
  return {push,finish(){if(quoted)throw new Error('Незавершённая строка в данных станций.');if(field!==''||row.length)emit();}};
}

export function stationCollector(metric,now=Date.now()){
  let columns,records=new Map();
  function accept(row){
    if(!columns){columns=Object.fromEntries(row.map((v,i)=>[v.replace(/^\uFEFF/,''),i]));if(REQUIRED.some(k=>columns[k]===undefined))throw new Error('Источник изменил формат таблицы станций.');return;}
    const get=key=>row[columns[key]]??'';
    if(get('source')!=='kgmt'||!/^kgmt_\d+$/.test(get('station_id')))return;
    const lat=finiteNumber(get('lat')),lng=finiteNumber(get('lon')),value=finiteNumber(get('value_ugm3'));
    if(lat===null||lng===null||lat<50.9||lat>51.35||lng<71.15||lng>71.7||value===null||value<0||value>=1000)return;
    if(!/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\+00:00$/.test(get('datetime_utc')))return;
    const time=Date.parse(get('datetime_utc').replace(' ','T'));
    if(!Number.isFinite(time)||time>now+5*60000||now-time>MAX_STATION_AGE)return;
    const stationId=get('station_id'),key=stationId+'@'+time;
    const record={id:stationId,name:get('station_name').slice(0,120),lat,lng,time:time/1000,metric,value,rawValue:finiteNumber(get('raw_value')),rawUnit:get('raw_unit').slice(0,30),conversion:get('conversion_note').slice(0,160)};
    const previous=records.get(key);
    // Conflicting duplicate observations are excluded, rather than silently
    // choosing a value according to CSV row order.
    if(previous&&(previous.value!==value||previous.lat!==lat||previous.lng!==lng))records.set(key,{...record,conflict:true});
    else if(!previous)records.set(key,record);
  }
  return {accept,records:()=>[...records.values()].filter(r=>!r.conflict)};
}

export function assembleStations(readings,now=Date.now()){
  const valid=readings.filter(r=>r.time*1000<=now+5*60000&&now-r.time*1000<=MAX_STATION_AGE);
  if(!valid.length)throw new Error('Нет опубликованных замеров станций за последние 36 часов. Старые значения не окрашивают карту.');
  const pm25Times=new Set(valid.filter(r=>r.metric==='pm2_5').map(r=>r.time)),pm10Times=new Set(valid.filter(r=>r.metric==='pm10').map(r=>r.time));
  const common=[...pm25Times].filter(time=>pm10Times.has(time));
  if(pm25Times.size&&pm10Times.size&&!common.length)throw new Error('В публикациях PM2.5 и PM10 нет общего часа. Повторите загрузку после обновления источника.');
  const latest=Math.max(...(common.length?common:valid.map(r=>r.time))),byStation=new Map();
  // Compare a single published hour. Values of different hours are never
  // combined into a seemingly simultaneous neighbourhood comparison.
  for(const r of valid.filter(r=>r.time===latest)){
    let station=byStation.get(r.id);
    if(!station){station={id:r.id,name:r.name,lat:r.lat,lng:r.lng,time:r.time,values:{pm2_5:null,pm10:null},readings:{}};byStation.set(r.id,station);}
    if(station.lat!==r.lat||station.lng!==r.lng){station.invalid=true;continue;}
    station.values[r.metric]=r.value;station.readings[r.metric]={value:r.value,rawValue:r.rawValue,rawUnit:r.rawUnit,conversion:r.conversion};
  }
  const stations=[...byStation.values()].filter(s=>!s.invalid).sort((a,b)=>(b.values.pm2_5??-1)-(a.values.pm2_5??-1));
  if(!stations.length)throw new Error('Для последнего часа нет станций с подтверждёнными координатами.');
  return {kind:'stations',stations,time:latest,fetchedAt:now,source:'Казгидромет · публикация AirData.kz',sourceUrl:STATION_SOURCE,stale:now-latest*1000>6*3600000};
}

async function loadParameter(metric,file,now,fetchImpl){
  const response=await fetchImpl(DATA_BASE+file+'.csv.gz',{signal:AbortSignal.timeout(60000),cache:'no-cache'});
  if(!response.ok||!response.body)throw new Error('AirData.kz не ответил. Попробуйте обновить данные позже.');
  const collector=stationCollector(metric,now),parser=csvRows(collector.accept);
  // GitHub serves .gz as a gzip file (not Content-Encoding). Some proxies
  // decompress it; inspecting the first bytes supports both responses.
  const raw=response.body.getReader();const first=await raw.read();
  if(first.done)throw new Error('Источник вернул пустой файл станций.');
  const compressed=first.value[0]===31&&first.value[1]===139;
  const body=new ReadableStream({start(controller){controller.enqueue(first.value);},async pull(controller){try{const next=await raw.read();if(next.done)controller.close();else controller.enqueue(next.value);}catch(e){controller.error(e);}},cancel(reason){return raw.cancel(reason);}});
  const stream=(compressed?body.pipeThrough(new DecompressionStream('gzip')):body).pipeThrough(new TextDecoderStream());
  const reader=stream.getReader();let size=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>80*1024*1024)throw new Error('Файл станций превышает допустимый размер.');parser.push(value);}parser.finish();return collector.records();}
  finally{await reader.cancel().catch(()=>{});}
}

let pending,cached;
export async function fetchAirStations(force=false){
  if(pending)return pending;
  if(!force&&cached&&Date.now()-cached.fetchedAt<CACHE_TTL&&Date.now()-cached.time*1000<=MAX_STATION_AGE)return cached;
  if(!force){try{const saved=JSON.parse(localStorage.getItem(CACHE_KEY));if(saved?.kind==='stations'&&Array.isArray(saved.stations)&&saved.stations.length&&Number.isFinite(saved.time)&&Date.now()-saved.fetchedAt<CACHE_TTL&&Date.now()-saved.time*1000<=MAX_STATION_AGE){cached=saved;return cached;}}catch{}}
  pending=(async()=>{
    const now=Date.now();
    // Keep either parameter useful when the other publication is unavailable.
    const results=await Promise.allSettled([loadParameter('pm2_5','pm25',now,fetch),loadParameter('pm10','pm10',now,fetch)]);
    const readings=results.flatMap(result=>result.status==='fulfilled'?result.value:[]);
    if(!readings.length)throw new Error(results.find(r=>r.status==='rejected')?.reason?.message||'Свежие данные станций отсутствуют.');
    cached=assembleStations(readings,now);cached.warnings=results.some(r=>r.status==='rejected')?'Часть показателей не загрузилась. Отсутствующие значения не заменяются оценкой.':'';
    try{localStorage.setItem(CACHE_KEY,JSON.stringify(cached));}catch{}
    return cached;
  })();
  try{return await pending;}finally{pending=null;}
}

export function stationValue(value){return Number.isFinite(value)?value.toLocaleString('ru-RU',{maximumFractionDigits:1}):'—';}
export function stationTime(time){return new Date(time*1000).toLocaleString('ru-RU',{timeZone:'Asia/Almaty',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});}

// The 2 km circles are a visual highlight around each measurement point,
// not interpolation, district boundaries or a claim of sensor coverage.
export function rasterStations(data,metric='pm2_5'){
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=768;const ctx=canvas.getContext('2d');
  const west=71.22,east=71.62,south=51.025,north=51.255,merc=lat=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
  const x=lng=>(lng-west)/(east-west)*768,y=lat=>(merc(north)-merc(lat))/(merc(north)-merc(south))*768;
  for(const s of data?.stations||[]){const value=s.values[metric];if(!Number.isFinite(value))continue;
    const cx=x(s.lng),cy=y(s.lat),radius=x(s.lng+2/(111.32*Math.cos(s.lat*Math.PI/180)))-cx;
    const gradient=ctx.createRadialGradient(cx,cy,0,cx,cy,radius);const color=airColor(value,metric);gradient.addColorStop(0,color+'dd');gradient.addColorStop(.65,color+'99');gradient.addColorStop(1,color+'00');
    ctx.fillStyle=gradient;ctx.beginPath();ctx.ellipse(cx,cy,radius,Math.abs(y(s.lat+2/111.32)-cy),0,0,Math.PI*2);ctx.fill();
  }
  return {url:canvas.toDataURL('image/png'),coordinates:[[west,north],[east,north],[east,south],[west,south]]};
}
