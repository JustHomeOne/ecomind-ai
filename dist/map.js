import {fillStatus, DEPOT, getContainerDataState} from './data.js';
import {icon} from './icons.js';

const CITY_CAMERA={center:[71.439,51.155],zoom:12.3,pitch:0,bearing:0};
const cameras=new Map();
let libraryPromise,activeCleanup;

function loadMapLibrary(){
  if(!document.getElementById('maplibre-style')){
    const css=document.createElement('link');
    css.id='maplibre-style';css.rel='stylesheet';
    css.href='https://unpkg.com/maplibre-gl@5.6.0/dist/maplibre-gl.css';
    document.head.append(css);
  }
  if(window.maplibregl)return Promise.resolve(window.maplibregl);
  if(libraryPromise)return libraryPromise;
  libraryPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    const timer=setTimeout(()=>{script.remove();reject(new Error('Не удалось загрузить карту Астаны. Проверьте подключение к интернету.'));},15000);
    script.src='https://unpkg.com/maplibre-gl@5.6.0/dist/maplibre-gl.js';
    script.onload=()=>{clearTimeout(timer);resolve(window.maplibregl);};
    script.onerror=()=>{clearTimeout(timer);script.remove();reject(new Error('Картографический сервис временно недоступен.'));};
    document.head.append(script);
  }).catch(error=>{libraryPromise=null;throw error;});
  return libraryPromise;
}

export function destroyMap(){activeCleanup?.();activeCleanup=null;}

export function mountMap(host,{containers=[],route,onSelect,layer='waste'}={}){
  destroyMap();if(!host)return;
  const view=host.querySelector('.map-canvas');
  const cameraKey=layer==='route'?'route':'city';
  const savedCamera=cameras.get(cameraKey);
  let map,disposed=false,markers=[],currentLayer=layer,noticeTimer;
  host.dataset.mapStatus='loading';
  view.innerHTML=`<div class="map-maplibre" aria-label="Карта Астаны"></div><div class="map-loading">${icon('refresh','spin')}<strong>Загружаем карту Астаны</strong><span>Настоящие улицы и здания · OpenStreetMap</span></div>`;
  const canvas=view.firstElementChild;

  function notify(message){
    if(disposed)return;
    host.querySelector('.map-error')?.remove();clearTimeout(noticeTimer);
    const el=document.createElement('div');el.className='map-error';el.textContent=message;
    view.append(el);noticeTimer=setTimeout(()=>el.remove(),8000);
  }
  function failed(message){
    if(disposed)return;
    host.dataset.mapStatus='error';host.querySelector('.map-loading')?.remove();
    host.querySelector('.map-unavailable')?.remove();
    const el=document.createElement('div');el.className='map-unavailable';
    const p=document.createElement('p');p.textContent=message;
    el.innerHTML=`${icon('map')}<strong>Карта Астаны не загрузилась</strong>`;
    el.append(p);
    const button=document.createElement('button');button.className='button primary';button.dataset.mapAction='retry';button.textContent='Повторить загрузку';el.append(button);
    const link=document.createElement('a');link.className='text-button';link.href='https://www.openstreetmap.org/#map=12/51.1327/71.4249';link.target='_blank';link.rel='noopener';link.textContent='Открыть Астану в OpenStreetMap';el.append(link);
    view.append(el);
  }
  function syncLayer(){
    host.querySelectorAll('.map-chip').forEach(el=>el.classList.toggle('active',el.dataset.mapAction===currentLayer));
    const air=currentLayer==='air';
    markers.forEach(({element,container})=>{
      element.style.display=air?'none':'';
      element.classList.toggle('compact',(map?.getZoom()??12)<14.2&&currentLayer!=='route');
      const n=route?.points?.findIndex(p=>p.id===container.id);
      element.textContent=currentLayer==='route'&&n>0?String(n):container.fill===null?'?':container.fill+'%';
    });
    host.querySelector('.map-legend').hidden=air;
    host.querySelector('.map-layer-note')?.remove();
    if(air){const note=document.createElement('div');note.className='map-layer-note';note.textContent='Локальных датчиков пока нет. Данные воздуха — модель Open-Meteo / CAMS для выбранных координат, без тепловой карты дворов.';view.append(note);}
    if(map?.getLayer('ecomind-route-line'))map.setLayoutProperty('ecomind-route-line','visibility',currentLayer==='route'?'visible':'none');
  }
  function focusContainers(){
    if(!map||!containers.length)return;
    const bounds=new window.maplibregl.LngLatBounds();
    containers.forEach(c=>bounds.extend([c.lng,c.lat]));
    if(currentLayer==='route')bounds.extend([DEPOT.lng,DEPOT.lat]);
    map.fitBounds(bounds,{padding:65,maxZoom:15,duration:600});
  }
  function sync3D(){
    const button=host.querySelector('[data-map-action="3d"]');if(!button||!map)return;
    const enabled=map.getPitch()>15;button.classList.toggle('active',enabled);button.setAttribute('aria-pressed',String(enabled));
  }
  const handle=e=>{
    const button=e.target.closest('[data-map-action]');if(!button)return;
    const action=button.dataset.mapAction;
    if(action==='retry'){mountMap(host,{containers,route,onSelect,layer:currentLayer});return;}
    if(action==='fullscreen'){host.classList.toggle('fullscreen-map');button.setAttribute('aria-label',host.classList.contains('fullscreen-map')?'Закрыть полный экран':'Развернуть карту');map?.resize();return;}
    if(['waste','air','route'].includes(action)){currentLayer=action;syncLayer();return;}
    if(!map)return;
    if(action==='zoom-in')map.zoomIn();
    if(action==='zoom-out')map.zoomOut();
    if(action==='center')focusContainers();
    if(action==='city')map.flyTo({...CITY_CAMERA,duration:800});
    if(action==='3d'){
      const enabled=map.getPitch()>15;
      map.easeTo({pitch:enabled?0:52,zoom:enabled?map.getZoom():Math.max(14,map.getZoom()),duration:650});
    }
  };
  const keyHandler=e=>{if(e.key==='Escape'&&host.classList.contains('fullscreen-map')){host.classList.remove('fullscreen-map');map?.resize();}};
  host.addEventListener('click',handle);document.addEventListener('keydown',keyHandler);
  activeCleanup=()=>{
    disposed=true;clearTimeout(noticeTimer);
    host.removeEventListener('click',handle);document.removeEventListener('keydown',keyHandler);
    markers.forEach(({marker})=>marker.remove());map?.remove();
  };

  loadMapLibrary().then(maplibre=>{
    if(disposed||!host.isConnected)return;
    map=new maplibre.Map({container:canvas,style:'https://tiles.openfreemap.org/styles/positron',...(savedCamera||CITY_CAMERA),attributionControl:{compact:true}});
    map.on('moveend',()=>{
      if(disposed)return;
      cameras.set(cameraKey,{center:map.getCenter().toArray(),zoom:map.getZoom(),pitch:map.getPitch(),bearing:map.getBearing()});sync3D();markers.forEach(({element})=>element.classList.toggle('compact',map.getZoom()<14.2&&currentLayer!=='route'));
    });
    map.on('load',()=>{
      if(disposed)return;
      host.dataset.mapStatus='ready';host.querySelector('.map-loading')?.remove();host.querySelector('.map-unavailable')?.remove();
      const style=map.getStyle();
      for(const item of style.layers){
        if(item.type==='symbol'&&(JSON.stringify(item.layout?.['text-field'])||'').includes('name'))map.setLayoutProperty(item.id,'text-field',['coalesce',['get','name:ru'],['get','name_ru'],['get','name:nonlatin'],['get','name'],['get','name:latin']]);
      }
      const source=Object.entries(style.sources).find(([,value])=>value.type==='vector')?.[0];
      const labels=style.layers.find(item=>item.type==='symbol'&&item.layout?.['text-field'])?.id;
      if(source)map.addLayer({id:'ecomind-buildings',type:'fill-extrusion',source,'source-layer':'building',minzoom:13,paint:{'fill-extrusion-color':'#d3deca','fill-extrusion-height':['to-number',['get','render_height'],['get','height'],0],'fill-extrusion-base':['to-number',['get','render_min_height'],0],'fill-extrusion-opacity':.85}},labels);
      containers.forEach(container=>{
        const element=document.createElement('button');element.className='real-marker';
        element.style.setProperty('--marker-color',fillStatus(container.fill).color);
        const demo=getContainerDataState([container]).hasDemo;
        element.title=`${demo?'Выдуманные данные · ':''}${container.id} · ${container.name}`;
        element.setAttribute('aria-label',element.title);element.onclick=()=>onSelect?.(container.id);
        const marker=new maplibre.Marker({element}).setLngLat([container.lng,container.lat]).addTo(map);
        markers.push({marker,element,container});
      });
      const points=route?.points||[];
      if(points.length>2){
        map.addSource('ecomind-route',{type:'geojson',data:{type:'Feature',geometry:{type:'LineString',coordinates:points.map(point=>[point.lng,point.lat])}}});
        map.addLayer({id:'ecomind-route-line',type:'line',source:'ecomind-route',layout:{'line-cap':'round','line-join':'round',visibility:'none'},paint:{'line-color':'#238754','line-width':4,'line-dasharray':[2,1]}});
      }
      syncLayer();sync3D();
      if(cameraKey==='route'&&!savedCamera)focusContainers();
    });
    map.on('error',()=>{
      if(disposed)return;
      if(host.dataset.mapStatus==='loading')failed('Не удалось получить карту города от OpenFreeMap. Можно повторить загрузку или открыть Астану по ссылке.');
      else notify('Часть карты не загрузилась. Проверьте интернет и повторите загрузку страницы.');
    });
  }).catch(error=>failed(error.message||'Картографический сервис временно недоступен.'));
}
