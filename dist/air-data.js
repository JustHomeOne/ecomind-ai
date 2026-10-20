export const AIR_SOURCES={
  model:'https://open-meteo.com/en/docs/air-quality-api',
  eea:'https://airindex.eea.europa.eu/AQI/',
  who:'https://www.who.int/publications/i/item/9789240034228/',
  whoTable:'https://www.ncbi.nlm.nih.gov/books/NBK574582/table/fm-ch1.tab1/',
  us:'https://www.airnow.gov/aqi/aqi-basics/'
};
export const AIR_BENCHMARKS={pm2_5:{hourlyGood:5,daily:15,annual:5},pm10:{hourlyGood:15,daily:45,annual:15}};
const clean=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;

export function rollingDayMean(times,values,now){
  if(!Array.isArray(times)||!Array.isArray(values)||!Number.isFinite(now))return {average:null,count:0};
  const end=Math.floor(now/3600)*3600;
  const samples=times.map((t,i)=>({time:t,value:clean(values[i])})).filter(s=>Number.isFinite(s.time)&&s.time>end-86400&&s.time<=end).sort((a,b)=>a.time-b.time);
  const complete=samples.length===24&&samples.every((s,i)=>s.time===end-(23-i)*3600&&s.value!==null);
  return {average:complete?samples.reduce((sum,s)=>sum+s.value,0)/24:null,count:samples.filter(s=>s.value!==null).length,from:end-23*3600,to:end};
}
function localStamp(epoch,timeZone){
  const formatter=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const p=Object.fromEntries(formatter.formatToParts(new Date(epoch*1000)).map(item=>[item.type,item.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function parseAirPayload(payload){
  if(payload?.error||!payload?.current||!Number.isFinite(payload.current.time))throw new Error('Источник не вернул корректное время модельных данных.');
  let timezone=payload.timezone||'UTC';
  try{new Intl.DateTimeFormat('en',{timeZone:timezone});}catch{timezone='UTC';}
  const epoch=payload.current.time,current={time:localStamp(epoch,timezone),epoch};
  for(const key of ['pm2_5','pm10','european_aqi','us_aqi'])current[key]=clean(payload.current[key]);
  const hourly=payload.hourly||{},times=hourly.time||[];
  const chart=times.map((time,i)=>({epoch:time,time:Number.isFinite(time)?localStamp(time,timezone):'',value:clean(hourly.european_aqi?.[i])})).filter(p=>Number.isFinite(p.epoch)&&p.epoch>=epoch&&p.value!==null).slice(0,24);
  return {current,chart,timezone,rolling:{pm2_5:rollingDayMean(times,hourly.pm2_5,epoch),pm10:rollingDayMean(times,hourly.pm10,epoch)},fetchedAt:new Date().toISOString()};
}
export function aqiTone(value,scale='eu'){
  if(!Number.isFinite(value))return {color:'#78859a',background:'#eef2f7',label:'Нет данных'};
  const limits=scale==='us'?[50,100,150,200,300]:[20,40,60,80,100];
  const labels=scale==='us'?['Хорошее','Умеренное','Вредно для чувствительных групп','Вредное','Очень вредное','Опасное']:['Хорошее','Удовлетворительное','Умеренное','Плохое','Очень плохое','Крайне плохое'];
  const colors=['#258263','#8c7930','#b47b2d','#c55a4d','#8f5a89','#753f64'];
  const backgrounds=['#edf8f2','#faf6e8','#fff4e5','#fff0eb','#f5edf5','#f5e9ef'];
  const i=limits.findIndex(limit=>value<=limit),index=i<0?5:i;
  return {color:colors[index],background:backgrounds[index],label:labels[index]};
}
