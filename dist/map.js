import {fillStatus, CENTER, DEPOT} from './data.js';
import {icon} from './icons.js';
let mapInstance=null, cleanup=null;
const project=p=>[75+(p.lng-71.410)/.026*860,550-(p.lat-51.127)/.013*470];
function building(x,y,w,h,z,green=false){
  const dx=z*.55,dy=-z*.85;
  return `<g><path d="M${x+7} ${y+h+5}h${w}l${dx} ${dy}h-${w}Z" fill="#486947" opacity=".08"/><path d="M${x} ${y}h${w}v${h}h-${w}Z" fill="${green?'#c2d3ad':'#d6dccb'}"/><path d="M${x+w} ${y}l${dx} ${dy}v${h}l-${dx} ${-dy}Z" fill="${green?'#a3b993':'#bdc9b4'}"/><path d="M${x} ${y}l${dx} ${dy}h${w}l-${dx} ${-dy}Z" fill="${green?'#e2ead5':'#edf0e5'}" stroke="#d4ddc9" stroke-width=".8"/><path d="M${x} ${y}v${h}h${w}v-${h}" fill="none" stroke="#c5d0ba" stroke-width=".8"/>${Array.from({length:Math.max(0,Math.floor(h/9)-1)},(_,i)=>`<path d="M${x+2} ${y+8+i*9}h${w-4}" stroke="#bcc9b1" stroke-width="1" opacity=".45"/>`).join('')}</g>`;
}
function tree(x,y,r=6){return `<g><ellipse cx="${x+3}" cy="${y+6}" rx="${r}" ry="${r*.5}" fill="#70915e" opacity=".12"/><path d="M${x} ${y}v8" stroke="#a3b58f" stroke-width="2"/><ellipse cx="${x}" cy="${y-3}" rx="${r}" ry="${r*1.13}" fill="#bdd2a5"/><ellipse cx="${x-1.5}" cy="${y-5}" rx="${r*.76}" ry="${r*.8}" fill="#d4e2bf"/></g>`;}
function schematicBase(threeD){
 let s=`<rect width="1000" height="640" fill="#edf1e6"/><defs><pattern id="map-dots" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".6" fill="#cfd9c3" opacity=".35"/></pattern><filter id="marker-shadow" x="-80%" y="-80%" width="260%" height="260%"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#365e32" flood-opacity=".18"/></filter></defs><rect width="1000" height="640" fill="url(#map-dots)"/>
 <path d="M-80 420C130 310 155 570 390 533S720 610 1060 465v210H-80Z" fill="#e2ebd7"/>
 <path d="M570 -60C520 150 740 150 730 300S660 550 980 650h80V-60Z" fill="#e2ebd7"/>
 <path d="M855 -30c-55 160 34 202-5 335s-3 250 143 345" stroke="#d4e3d6" stroke-width="48" fill="none"/>
 <path d="M855 -30c-55 160 34 202-5 335s-3 250 143 345" stroke="#e4eeea" stroke-width="31" fill="none"/>
 <g fill="none" stroke="#d4dfcc" stroke-width="26" stroke-linecap="round"><path d="M-60 95 1040 290M-60 265 1050 465M-40 462 1030 650M156-80-10 720M379-80 218 720M622-80 454 720M827-80 662 720"/></g>
 <g fill="none" stroke="#fafbf6" stroke-width="22" stroke-linecap="round"><path d="M-60 95 1040 290M-60 265 1050 465M-40 462 1030 650M156-80-10 720M379-80 218 720M622-80 454 720M827-80 662 720"/></g>
 <g fill="none" stroke="#e6ebdf" stroke-width="1.5" stroke-dasharray="8 10"><path d="M-60 95 1040 290M-60 265 1050 465M-40 462 1030 650M156-80-10 720M379-80 218 720M622-80 454 720M827-80 662 720"/></g>`;
 const blocks=[ [160,88],[385,126],[625,167],[124,252],[345,295],[582,338],[77,449],[300,490],[542,530] ];
 blocks.forEach(([x,y],i)=>{
  s+=`<path d="M${x-5} ${y+18}l177 31-22 110-174-31Z" fill="${i%3===1?'#dde8cf':'#e8ecdf'}" stroke="#dce3d2" stroke-width="1"/>`;
  for(let j=0;j<4;j++) {
   const bx=x+(j%2)*89- (j>1?13:0),by=y+30+Math.floor(j/2)*62;
   s+=building(bx,by,44+(i%2)*5,19,threeD?25+(i*7+j*4)%38:0,i%3===0);
  }
  s+=`<rect x="${x+55}" y="${y+70}" width="25" height="19" rx="3" fill="#d9e7c8" stroke="#c5d6b2"/><path d="M${x+67} ${y+70}v19m-12-10h25" stroke="#eaf1df" stroke-width="1"/>`;
  for(let j=0;j<4;j++)s+=tree(x+8+j*35,y+118,5);
 });
 for(let i=0;i<24;i++){const y=60+i*23,x=760+Math.sin(i*.63)*40;s+=tree(x,y,6+(i%3)*2);}
 for(let i=0;i<12;i++)s+=tree(30+i*77,603+Math.sin(i)*14,7);
 s+=`<g font-family="Manrope,sans-serif" font-size="9" fill="#a5b09b" letter-spacing="1"><text x="250" y="145" transform="rotate(10 250 145)">УЛИЦА ДОСТЫК</text><text x="495" y="367" transform="rotate(10 495 367)">УЛИЦА САУРАН</text><text x="146" y="511" transform="rotate(10 146 511)">УЛИЦА СЫГАНАК</text><text x="765" y="412" transform="rotate(-76 765 412)">ПРОСПЕКТ ТУРКЕСТАН</text></g><text x="793" y="168" font-size="11" font-family="Manrope,sans-serif" fill="#a2b392" transform="rotate(78 793 168)">Зелёная аллея</text>`;
 return s;
}
export function destroyMap(){if(cleanup){cleanup();cleanup=null;}if(mapInstance){mapInstance.remove();mapInstance=null;}}
export function mountMap(host, {containers,route,onSelect,layer='waste',threeD=true}={}){
 destroyMap();if(!host)return;
 const view=host.querySelector('.map-canvas');let zoom=1,offset={x:0,y:0},pan=null,real=false;
 let currentLayer=layer,is3D=threeD;
 function render(){
  if(real)return;
  const points=(route?.points||[]).map(project);
  let base=schematicBase(is3D);
  if(currentLayer==='air')base+=`<ellipse cx="510" cy="320" rx="260" ry="180" fill="#a9cd80" opacity=".18"/><ellipse cx="510" cy="320" rx="200" ry="130" fill="#a9cd80" opacity=".1"/><text x="440" y="290" font-family="Manrope,sans-serif" font-size="12" fill="#72935b">Открытые модельные данные</text><text x="440" y="310" font-family="Manrope,sans-serif" font-size="9" fill="#8fa277">Не локальное измерение</text>`;
  if(currentLayer==='route' && points.length>1)base+=`<polyline points="${points.map(p=>p.join(',')).join(' ')}" fill="none" stroke="#fff" stroke-width="9" stroke-linejoin="round"/><polyline points="${points.map(p=>p.join(',')).join(' ')}" fill="none" stroke="#2d8f60" stroke-width="4" stroke-dasharray="8 5" stroke-linejoin="round"/>`;
  containers.forEach(c=>{
   const [x,y]=project(c),status=fillStatus(c.fill),highlight=c.fill>=90;
   const stopIndex=route?.points?.findIndex(p=>p.id===c.id);
   base+=`<g class="map-marker" role="button" tabindex="0" aria-label="${c.id}, заполненность ${c.fill===null?'не определена':c.fill+' процентов'}" data-container="${c.id}" transform="translate(${x} ${y})">${highlight?`<ellipse cy="6" rx="32" ry="19" fill="${status.color}" opacity=".08"/><ellipse cy="6" rx="24" ry="14" fill="${status.color}" opacity=".09"/>`:''}<g filter="url(#marker-shadow)"><path d="m-6 11 6 7 6-7" fill="${status.color}"/><rect x="-23" y="-14" width="46" height="29" rx="7" fill="${status.color}" stroke="#fff" stroke-width="2.5"/><text text-anchor="middle" y="5" fill="#fff" font-family="Manrope,sans-serif" font-size="11" font-weight="750">${currentLayer==='route'&&stopIndex>0?stopIndex:c.fill===null?'?':c.fill+'%'}</text></g></g>`;
  });
  if(currentLayer==='route'){const [x,y]=project(DEPOT);base+=`<g transform="translate(${x} ${y})"><circle r="17" fill="#274f38" stroke="#fff" stroke-width="3"/><path d="m-7 0 7-7 7 7v8H-7Z" fill="none" stroke="#fff" stroke-width="1.5"/></g>`;}
  view.innerHTML=`<svg class="city-svg" viewBox="${500-500/zoom+offset.x} ${320-320/zoom+offset.y} ${1000/zoom} ${640/zoom}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-label="Интерактивная демонстрационная схема жилого квартала">${base}</svg>`;
  view.querySelectorAll('[data-container]').forEach(el=>{el.addEventListener('click',()=>onSelect(el.dataset.container));el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(el.dataset.container);}});});
  const svg=view.querySelector('svg');
  svg.addEventListener('pointerdown',e=>{if(e.target.closest('[data-container]'))return;pan={x:e.clientX,y:e.clientY,ox:offset.x,oy:offset.y};svg.setPointerCapture(e.pointerId);});
  svg.addEventListener('pointermove',e=>{if(!pan)return;offset={x:pan.ox-(e.clientX-pan.x)*1000/svg.clientWidth/zoom,y:pan.oy-(e.clientY-pan.y)*640/svg.clientHeight/zoom};svg.setAttribute('viewBox',`${500-500/zoom+offset.x} ${320-320/zoom+offset.y} ${1000/zoom} ${640/zoom}`);});
  svg.addEventListener('pointerup',()=>{pan=null;});
 }
 const handle=async e=>{
  const el=e.target.closest('[data-map-action]');if(!el)return;
  const a=el.dataset.mapAction;
  if(['waste','air','route'].includes(a)){
   currentLayer=a;host.querySelectorAll('.map-chip').forEach(x=>x.classList.toggle('active',x.dataset.mapAction===a));if(real)updateReal();else render();
  }
  if(a==='zoom-in'){if(real)mapInstance?.zoomIn();else{zoom=Math.min(3,zoom+.3);render();}}
  if(a==='zoom-out'){if(real)mapInstance?.zoomOut();else{zoom=Math.max(.7,zoom-.3);render();}}
  if(a==='center'){if(real)mapInstance?.flyTo({center:CENTER,zoom:14.8});else{zoom=1;offset={x:0,y:0};render();}}
  if(a==='3d'){is3D=!is3D;el.classList.toggle('active',is3D);el.setAttribute('aria-pressed',String(is3D));if(real)mapInstance?.easeTo({pitch:is3D?52:0});else render();}
  if(a==='fullscreen'){host.classList.toggle('fullscreen-map');el.setAttribute('aria-label',host.classList.contains('fullscreen-map')?'Закрыть полный экран':'Развернуть карту');mapInstance?.resize();}
  if(a==='real'){
   if(real){mapInstance?.remove();mapInstance=null;real=false;render();el.innerHTML=icon('layers');el.title='Открыть географическую карту';host.querySelector('.map-caption').textContent='Демонстрационная схема ЖК';return;}
   el.disabled=true;
   try{
    if(!window.maplibregl){
     await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://unpkg.com/maplibre-gl@5.6.0/dist/maplibre-gl.js';s.onload=resolve;s.onerror=()=>reject(new Error('Картографический сервис недоступен. Схема продолжает работать.'));document.head.append(s);});
     if(!document.getElementById('maplibre-style')){const css=document.createElement('link');css.id='maplibre-style';css.rel='stylesheet';css.href='https://unpkg.com/maplibre-gl@5.6.0/dist/maplibre-gl.css';document.head.append(css);}
    }
    if(!host.isConnected)return;
    view.innerHTML='<div class="map-maplibre"></div>';
    mapInstance=new window.maplibregl.Map({container:view.firstElementChild,style:'https://tiles.openfreemap.org/styles/positron',center:CENTER,zoom:14.8,pitch:is3D?52:0,bearing:-18,attributionControl:{compact:true}});
    real=true;host.querySelector('.map-caption').textContent='Карта города · точки пилота демонстрационные';
    mapInstance.on('load',()=>{
      const style=mapInstance.getStyle();const source=Object.entries(style.sources).find(([,v])=>v.type==='vector')?.[0];
      if(source)mapInstance.addLayer({id:'ecomind-buildings',type:'fill-extrusion',source,'source-layer':'building',minzoom:13,paint:{'fill-extrusion-color':'#d3deca','fill-extrusion-height':['coalesce',['get','render_height'],8],'fill-extrusion-base':['coalesce',['get','render_min_height'],0],'fill-extrusion-opacity':.85}});
      containers.forEach(c=>{const marker=document.createElement('button');marker.className='real-marker';marker.textContent=c.fill===null?'?':c.fill+'%';marker.style.setProperty('--marker-color',fillStatus(c.fill).color);marker.setAttribute('aria-label',c.id+' — '+c.name);marker.onclick=()=>onSelect(c.id);new window.maplibregl.Marker({element:marker}).setLngLat([c.lng,c.lat]).addTo(mapInstance);});
      mapInstance.addSource('ecomind-route',{type:'geojson',data:{type:'Feature',geometry:{type:'LineString',coordinates:(route?.points||[DEPOT,DEPOT]).map(p=>[p.lng,p.lat])}}});
      mapInstance.addLayer({id:'ecomind-route-line',type:'line',source:'ecomind-route',layout:{'line-cap':'round','line-join':'round',visibility:currentLayer==='route'?'visible':'none'},paint:{'line-color':'#238754','line-width':4,'line-dasharray':[2,1]}});
    });
    let firstError=true;mapInstance.on('error',()=>{if(firstError){firstError=false;showError('Часть карты не загрузилась. Можно вернуться к схеме кнопкой слоёв.');}});
    el.innerHTML=icon('map');el.title='Вернуться к схеме';
   }catch(err){real=false;mapInstance?.remove();mapInstance=null;render();showError(err.message||'Карта недоступна. Используйте схему.');}finally{el.disabled=false;}
  }
 };
 function updateReal(){if(mapInstance?.getLayer('ecomind-route-line'))mapInstance.setLayoutProperty('ecomind-route-line','visibility',currentLayer==='route'?'visible':'none');}
 function showError(message){host.querySelector('.map-error')?.remove();const el=document.createElement('div');el.className='map-error';el.textContent=message;view.append(el);setTimeout(()=>el.remove(),7000);}
 function keyHandler(e){if(e.key==='Escape'&&host.classList.contains('fullscreen-map')){host.classList.remove('fullscreen-map');mapInstance?.resize();}}
 host.addEventListener('click',handle);document.addEventListener('keydown',keyHandler);
 cleanup=()=>{host.removeEventListener('click',handle);document.removeEventListener('keydown',keyHandler);};render();
}
