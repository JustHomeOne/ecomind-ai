import {DEPOT,DEMO_CONTAINERS,selectStops} from './data.js';
export const DEFAULT_TRUCKS=[{id:'truck-1',name:'Экипаж 01',capacity:6600,minutes:480,lat:DEPOT.lat,lng:DEPOT.lng},{id:'truck-2',name:'Экипаж 02',capacity:6600,minutes:480,lat:DEPOT.lat,lng:DEPOT.lng}];
export const emptyOps=containers=>({version:2,containers:structuredClone(containers??DEMO_CONTAINERS),events:[],trucks:structuredClone(DEFAULT_TRUCKS),runs:[]});
const text=(v,max=600)=>String(v??'').trim().slice(0,max);
const number=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
export function validateContainer(c){
  if(!c||!text(c.id,80)||!text(c.name,120)||!number(c.lat,-90,90)||!number(c.lng,-180,180)||!number(c.capacity,1,100000)||!(c.fill===null||number(c.fill,0,100)))throw new Error('Проверьте ID, название, координаты, вместимость и заполненность площадки.');
  return {id:text(c.id,80),name:text(c.name,120),address:text(c.address,250),lat:c.lat,lng:c.lng,capacity:c.capacity,fill:c.fill,rate:number(c.rate,0,100)?c.rate:0,type:text(c.type||'Смешанные',50),confidence:['high','medium','low'].includes(c.confidence)?c.confidence:'medium',mandatory:Boolean(c.mandatory),locationSource:c.locationSource==='real'?'real':'demo',source:['manual','sensor','verified','gemini'].includes(c.source)?c.source:'demo',observedAt:c.observedAt&&Number.isFinite(Date.parse(c.observedAt))?new Date(c.observedAt).toISOString():null,explanation:text(c.explanation),limitations:text(c.limitations)};
}
export function validateSnapshot(raw){
  if(!raw||!Array.isArray(raw.containers)||raw.containers.length>39||!Array.isArray(raw.events)||raw.events.length>3000||!Array.isArray(raw.trucks)||raw.trucks.length>6||!Array.isArray(raw.runs)||raw.runs.length>100)throw new Error('Недопустимый размер рабочего пространства.');
  const containers=raw.containers.map(validateContainer);if(new Set(containers.map(c=>c.id)).size!==containers.length)throw new Error('ID площадок должны быть уникальными.');
  if(raw.events.some(e=>!e||!text(e.id,80)||!text(e.kind,80)||!Number.isFinite(Date.parse(e.at))||e.fill!==undefined&&e.fill!==null&&!number(e.fill,0,100)))throw new Error('Некорректная история в резервной копии.');
  if(raw.runs.some(r=>!r||!text(r.id,100)||!text(r.truckId,80)||!number(r.distance,0,100000)||!number(r.duration,0,1e9)||!Array.isArray(r.tasks)||r.tasks.length>39||r.tasks.some(t=>!t||!text(t.containerId,80)||!['pending','done','blocked','skipped'].includes(t.status))))throw new Error('Некорректные рейсы в резервной копии.');
  return {version:2,containers,events:raw.events.slice(-3000),trucks:raw.trucks.map(validateTruck),runs:raw.runs.slice(-100)};
}
export function validateTruck(t){
  if(!t||!text(t.id,80)||!text(t.name,100)||!number(t.capacity,100,100000)||!number(t.minutes,10,1440)||!number(t.lat,-90,90)||!number(t.lng,-180,180))throw new Error('Проверьте вместимость, смену и координаты базы машины.');
  return {id:text(t.id,80),name:text(t.name,100),capacity:t.capacity,minutes:t.minutes,lat:t.lat,lng:t.lng};
}
export function hydrateOps(raw,containers){try{return validateSnapshot(raw);}catch{return emptyOps(containers);}}
export function applyOperation(raw,op,{now=new Date().toISOString(),actor='Наблюдатель',role='owner'}={}){
  if(!op||!op.id||!['owner','dispatcher','driver'].includes(role))throw new Error('Нет права изменять данные.');
  if(raw.events.some(e=>e.id===op.id))return raw;
  const managerial=['import','edit-container','truck-save','truck-delete','publish-runs','seed'];
  if(role==='driver'&&managerial.includes(op.type))throw new Error('Это действие доступно диспетчеру.');
  let next=structuredClone(raw);let event={id:text(op.id,80),at:now,actor:text(actor,120),kind:op.type,note:text(op.note),containerId:op.containerId||null};
  if(op.type==='seed'){next=validateSnapshot(op.snapshot);event.note=text(op.note)||'Восстановлено состояние пространства из сохранённой копии';}
  else if(op.type==='observe'){
    const c=next.containers.find(c=>c.id===op.containerId);if(!c)throw new Error('Площадка не найдена.');
    if(!(op.fill===null||number(op.fill,0,100)))throw new Error('Заполненность должна быть от 0 до 100%.');
    Object.assign(c,{fill:op.fill,confidence:['high','medium','low'].includes(op.confidence)?op.confidence:'medium',source:'manual',observedAt:now,explanation:text(op.note)||'Ручная визуальная оценка'});
    event={...event,fill:c.fill,confidence:c.confidence,photoId:op.photoId?text(op.photoId,80):null};
  }else if(op.type==='import'){
    if(!Array.isArray(op.containers)||!op.containers.length)throw new Error('Нет площадок для импорта.');
    const incoming=op.containers.map(validateContainer),ids=new Set(incoming.map(c=>c.id));
    if(ids.size!==incoming.length)throw new Error('Повторяющиеся ID в файле.');
    const combined=[...next.containers.filter(c=>!ids.has(c.id)&&!(op.replaceDemo&&c.source==='demo'&&c.locationSource!=='real')),...incoming];
    if(combined.length>39)throw new Error('В пилотном пространстве поддерживается до 39 площадок.');
    next.containers=combined;event.note=`Импортировано площадок: ${incoming.length}`;
  }else if(op.type==='edit-container'){
    const i=next.containers.findIndex(c=>c.id===op.containerId);if(i<0)throw new Error('Площадка не найдена.');
    next.containers[i]=validateContainer({...next.containers[i],...op.patch,id:op.containerId});event.note='Обновлены параметры площадки';
  }else if(op.type==='truck-save'){
    const truck=validateTruck(op.truck),i=next.trucks.findIndex(t=>t.id===truck.id);if(i<0){if(next.trucks.length>=6)throw new Error('Поддерживается до шести машин.');next.trucks.push(truck);}else next.trucks[i]=truck;event.note=`Настроена машина: ${truck.name}`;
  }else if(op.type==='truck-delete'){next.trucks=next.trucks.filter(t=>t.id!==op.truckId);event.note='Машина удалена из планирования';}
  else if(op.type==='publish-runs'){
    if(!Array.isArray(op.runs)||!op.runs.length||op.runs.length>6)throw new Error('Нет рейсов для публикации.');
    if(next.runs.some(r=>!r.finishedAt&&r.tasks.some(t=>t.status==='pending')))throw new Error('Сначала завершите или закройте предыдущие рейсы.');
    const allStops=op.runs.flatMap(r=>r.stops||[]);if(new Set(allStops).size!==allStops.length)throw new Error('Одна площадка не может входить в два рейса одновременно.');
    for(const r of op.runs){if(!next.trucks.some(t=>t.id===r.truckId)||!number(r.distance,0,100000)||!number(r.duration,0,1e9)||!Array.isArray(r.stops)||!r.stops.length||r.stops.some(id=>!next.containers.some(c=>c.id===id)))throw new Error('Проверьте остановки, расстояние и машину рейса.');}
    next.runs.push(...op.runs.map((r,i)=>({id:`${op.id}-${i}`,truckId:r.truckId,truckName:text(r.truckName,100),createdAt:now,distance:r.distance,duration:r.duration,geometry:r.geometry,snaps:r.snaps,tasks:r.stops.map(containerId=>({containerId,status:'pending'}))})));event.note=`Рейсов передано водителям: ${op.runs.length}`;
  }else if(op.type==='service'){
    const run=next.runs.find(r=>r.id===op.runId),task=run?.tasks.find(t=>t.containerId===op.containerId);
    if(!task||task.status!=='pending')throw new Error('Эта остановка уже обработана или не входит в рейс.');
    if(!['done','blocked','skipped'].includes(op.status))throw new Error('Неизвестный результат остановки.');
    if(op.status!=='done'&&!text(op.note))throw new Error('Укажите причину пропуска или отсутствия доступа.');
    Object.assign(task,{status:op.status,at:now,note:text(op.note),actor:text(actor,120)});event={...event,runId:run.id,status:op.status};
    if(op.status==='done'){const c=next.containers.find(c=>c.id===op.containerId);Object.assign(c,{fill:0,observedAt:now,source:'manual',confidence:'high',explanation:'Водитель подтвердил вывоз и пустой контейнер.'});event.fill=0;}
    if(run.tasks.every(t=>t.status!=='pending'))run.finishedAt=now;
  }else if(op.type==='close-run'){
    if(role==='driver')throw new Error('Закрыть весь рейс может диспетчер.');
    const run=next.runs.find(r=>r.id===op.runId);if(!run)throw new Error('Рейс не найден.');
    run.tasks.forEach(t=>{if(t.status==='pending')Object.assign(t,{status:'skipped',at:now,note:'Рейс закрыт диспетчером'});});run.finishedAt=now;event.note='Незавершённый рейс закрыт диспетчером';
  }else throw new Error('Неизвестное действие.');
  next.events=[...next.events,event].slice(-3000);next.runs=next.runs.slice(-100);return next;
}
export function filterSites(containers,{query='',type='all',attention=false,freshDays=0}={},now=Date.now()){
  const q=query.toLocaleLowerCase('ru').trim();return containers.filter(c=>(!q||`${c.id} ${c.name} ${c.address}`.toLocaleLowerCase('ru').includes(q))&&(type==='all'||c.type===type)&&(!attention||c.fill>=75)&&(!freshDays||(c.observedAt&&now-Date.parse(c.observedAt)<=freshDays*86400000)));
}
export function fleetStops(containers,policy,threshold,horizon){const chosen=new Set(selectStops(containers,policy,threshold,horizon).map(c=>c.id));return containers.filter(c=>c.mandatory||chosen.has(c.id));}
export function assignFleet(networks,containers,trucks,{policy='current',threshold=75,horizon=12,stopMinutes=3}={}){
  const selected=fleetStops(containers,policy,threshold,horizon),buckets=trucks.map(t=>({truck:t,stops:[],load:0,seconds:0,last:0})),unassigned=[];
  const sorted=[...selected].sort((a,b)=>Number(b.mandatory)-Number(a.mandatory)||(b.fill??0)-(a.fill??0));
  for(const c of sorted){
    if(!Number.isFinite(c.fill)){unassigned.push({id:c.id,reason:'Нужна оценка заполненности для расчёта загрузки'});continue;}
    const load=c.capacity*c.fill/100;
    const choices=buckets.map((b,i)=>{const n=networks[i],index=n.points.findIndex(p=>p.id===c.id),drive=n.durations[b.last]?.[index],home=n.durations[index]?.[0];return {b,index,drive,home,cost:(drive??Infinity)+b.seconds};}).filter(x=>x.index>0&&Number.isFinite(x.drive)&&Number.isFinite(x.home)&&x.b.load+load<=x.b.truck.capacity&&x.b.seconds+x.drive+stopMinutes*60+x.home<=x.b.truck.minutes*60).sort((a,b)=>a.cost-b.cost);
    if(!choices.length){unassigned.push({id:c.id,reason:'Не хватает объёма, времени смены или дорожного доступа'});continue;}
    const {b,index,drive}=choices[0];b.stops.push(c);b.load+=load;b.seconds+=drive+stopMinutes*60;b.last=index;
  }
  return {assignments:buckets,unassigned,selected:selected.length};
}
