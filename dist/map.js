import {fillStatus, DEPOT, getContainerDataState} from './data.js';
import {icon} from './icons.js';
import {airColor} from './air-map.js';
import {rasterStations,STATION_METRICS as AIR_METRICS,AIR_COLORS,stationValue,stationTime,STATION_SOURCE,STATION_LICENSE} from './air-stations.js';

const CITY_CAMERA={center:[71.439,51.155],zoom:12.3,pitch:0,bearing:0};
const cameras=new Map();
let libraryPromise,activeCleanup;

export function loadMapLibrary(){
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

export function mountMap(host,{containers=[],route,onSelect,layer='waste',routeStatus='idle',routeError='',onRouteRequested,airGrid=null,airMetric='pm2_5',airStatus='idle',airError='',onAirRequested,onAirMetric,onLayerChanged,visibleIds=null}={}){
  destroyMap();if(!host)return;
  const view=host.querySelector('.map-canvas');
  const cameraKey=layer==='route'?'route':'city';
  const savedCamera=cameras.get(cameraKey);
  let map,disposed=false,markers=[],currentLayer=layer,noticeTimer,depotMarker,airPopup,stationMarkers=[],airFitted=false;
  const normalLegend=host.querySelector('.map-legend').innerHTML;
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
    const footer=host.querySelector('.map-footer');if(footer)footer.style.display=air?'none':'';
    markers.forEach(({element,container,marker})=>{
      element.style.display=air||currentLayer!=='route'&&visibleIds&&!visibleIds.includes(container.id)?'none':'';
      element.classList.toggle('compact',(map?.getZoom()??12)<14.2&&currentLayer!=='route');
      const n=routeStatus==='ready'?route?.points?.findIndex(p=>p.id===container.id):-1;
      element.textContent=currentLayer==='route'&&n>0?String(n):container.fill===null?'?':container.fill+'%';
      const snap=currentLayer==='route'&&routeStatus==='ready'?route?.snaps?.find(p=>p.id===container.id):null;
      marker.setLngLat(snap?snap.location:[container.lng,container.lat]);
      element.classList.toggle('route-stop-marker',Boolean(snap));
    });
    const legend=host.querySelector('.map-legend');legend.hidden=false;
    if(air){const info=AIR_METRICS[airMetric];legend.innerHTML=`<strong>${info.label} · ${info.unit}</strong>`+info.limits.map((v,i)=>`<span class="legend-item"><i class="legend-dot" style="background:${AIR_COLORS[i]}"></i>${i?'> '+info.limits[i-1]+'–':'0–'}${v}</span>`).join('')+`<span class="legend-item"><i class="legend-dot" style="background:${AIR_COLORS[5]}"></i>&gt;${info.limits[4]}</span>`;}else legend.innerHTML=normalLegend;
    const toolbar=host.querySelector('.map-search-tools');if(toolbar)toolbar.hidden=currentLayer!=='waste';
    host.querySelector('.map-layer-note')?.remove();
    if(air){
      const note=document.createElement('div');note.className='map-layer-note air-layer-note';
      const title=document.createElement('strong');title.textContent=airStatus==='loading'?'Загружаем замеры станций…':airStatus==='error'?'Замеры станций недоступны':'Воздух · реальные станции';note.append(title);
      const detail=document.createElement('p');detail.textContent=airStatus==='error'?airError:'Почасовые замеры · публикация раз в сутки. Подсветка 2 км помогает сравнить точки; между ними качество воздуха неизвестно.';note.append(detail);
      const controls=document.createElement('div');controls.className='air-layer-controls';const select=document.createElement('select');select.setAttribute('aria-label','Показатель окраски карты');select.dataset.mapAirMetric='';
      for(const [key,value] of Object.entries(AIR_METRICS)){const option=document.createElement('option');option.value=key;option.textContent=value.label;option.selected=key===airMetric;select.append(option);}controls.append(select);
      const button=document.createElement('button');button.className='text-button';button.dataset.mapAction='refresh-air-layer';button.textContent='Обновить';button.disabled=airStatus==='loading';controls.append(button);note.append(controls);
      const source=document.createElement('a');source.href=STATION_SOURCE;source.target='_blank';source.rel='noopener';source.textContent='Казгидромет · подготовка AirData.kz';note.append(source);
      if(airGrid){
        const time=document.createElement('small');time.textContent='Час замера: '+stationTime(airGrid.time)+' · Астана'+(airGrid.stale?' · публикация с задержкой':'');note.append(time);
        const readings=airGrid.stations.filter(s=>Number.isFinite(s.values[airMetric]));
        const count=document.createElement('span');count.className='station-range';count.textContent=readings.length?`${readings.length} станции · ${stationValue(Math.min(...readings.map(s=>s.values[airMetric])))}–${stationValue(Math.max(...readings.map(s=>s.values[airMetric])))} ${AIR_METRICS[airMetric].unit}`:'Для этого показателя нет значений в выбранный час';note.append(count);
        if(airGrid.warnings){const warning=document.createElement('small');warning.textContent=airGrid.warnings;note.append(warning);}
      }
      const explanation=document.createElement('details');explanation.className='station-method';const summary=document.createElement('summary');summary.textContent='Как читать карту и цвета';explanation.append(summary);
      const method=document.createElement('p');method.textContent='Цифры — часовые концентрации частиц в мкг/м³. Цвета используют фиксированные диапазоны EEA для PM. Это не общий AQI и не среднесуточное значение. Прозрачный фон означает отсутствие оценки. Радиус подсветки выбран для оформления, а не как доказанная зона действия датчика. Замеры старше 36 часов исключаются.';explanation.append(method);
      const changes=document.createElement('small');changes.textContent='Обработка EcoMind: последний общий час, проверка координат и свежести; без интерполяции.';explanation.append(changes);
      const license=document.createElement('a');license.href=STATION_LICENSE;license.target='_blank';license.rel='noopener';license.textContent='Данные: CC BY-NC 4.0';explanation.append(license);const scale=document.createElement('a');scale.href='https://airindex.eea.europa.eu/AQI/';scale.target='_blank';scale.rel='noopener';scale.textContent=' · Диапазоны EEA';explanation.append(scale);note.append(explanation);host.append(note);
    }
    if(air&&airStatus==='ready'&&airGrid)renderStationList();else host.querySelector('.station-comparison')?.remove();
    for(const {element} of stationMarkers)element.hidden=!air||airStatus!=='ready';
    for(const id of ['ecomind-air-raster'])if(map?.getLayer(id))map.setLayoutProperty(id,'visibility',air&&airStatus==='ready'?'visible':'none');
    host.dataset.airStatus=airStatus;host.dataset.airStations=String(airGrid?.stations?.length||0);host.dataset.airVisibility=map?.getLayer('ecomind-air-raster')?map.getLayoutProperty('ecomind-air-raster','visibility'):'pending';
    for(const id of ['ecomind-route-line','ecomind-route-casing'])if(map?.getLayer(id))map.setLayoutProperty(id,'visibility',currentLayer==='route'&&routeStatus==='ready'&&route?.geometry?'visible':'none');
    const snap=routeStatus==='ready'&&route?.geometry?route.snaps?.[0]:null;
    if(map&&currentLayer==='route'&&snap){
      if(!depotMarker){const element=document.createElement('button');element.className='depot-marker';element.innerHTML=icon('truck');element.title='Условная база · остановка у дороги';element.setAttribute('aria-label',element.title);depotMarker=new window.maplibregl.Marker({element}).setLngLat(snap.location).addTo(map);}
      else depotMarker.setLngLat(snap.location);
    }else{depotMarker?.remove();depotMarker=null;}
    routeFeedback();
  }
  function stationName(station){return station.name.replace(/^PCP\s*#\s*(\d+)$/i,'Пост №$1');}
  function openStation(station){
    if(!map||currentLayer!=='air')return;
    const info=AIR_METRICS[airMetric],content=document.createElement('div');content.className='air-cell-popup';
    const title=document.createElement('strong');title.textContent=stationName(station);content.append(title);
    for(const [key,metric] of Object.entries(AIR_METRICS)){const p=document.createElement('p');p.textContent=metric.label+': '+stationValue(station.values[key])+' '+metric.unit;content.append(p);}
    const detail=document.createElement('p');detail.textContent='Часовой замер · '+stationTime(station.time)+' · Астана';content.append(detail);
    const coords=document.createElement('small');coords.textContent=station.lat.toFixed(5)+', '+station.lng.toFixed(5)+' · '+station.id;content.append(coords);
    const source=document.createElement('a');source.href=STATION_SOURCE;source.target='_blank';source.rel='noopener';source.textContent='Казгидромет / AirData.kz';content.append(source);
    const raw=station.readings[airMetric];if(raw){const origin=document.createElement('small');const unit=raw.rawUnit==='mg/m3'?'мг/м³':raw.rawUnit==='ug/m3'?'мкг/м³':raw.rawUnit;origin.textContent='Исходное показание: '+(raw.rawValue??'—')+' '+unit+(raw.conversion&&raw.rawUnit==='mg/m3'?' · переведено в мкг/м³':'');content.append(origin);}
    if(Number.isFinite(station.values.pm2_5)&&Number.isFinite(station.values.pm10)&&station.values.pm2_5>station.values.pm10){const quality=document.createElement('small');quality.className='station-quality-note';quality.textContent='PM2.5 немного выше PM10: возможна погрешность каналов. Показания сохранены как в публикации источника.';content.append(quality);}
    airPopup?.remove();airPopup=new window.maplibregl.Popup({maxWidth:'300px',offset:18}).setLngLat([station.lng,station.lat]).setDOMContent(content).addTo(map);
  }
  function renderStationList(){
    host.querySelector('.station-comparison')?.remove();
    const section=document.createElement('section');section.className='station-comparison';section.setAttribute('aria-label','Сравнение станций воздуха');
    const heading=document.createElement('div');heading.className='station-comparison-heading';const title=document.createElement('strong');title.textContent='Один час. Разные точки города.';heading.append(title);const time=document.createElement('small');time.textContent=stationTime(airGrid.time)+' · Астана · '+AIR_METRICS[airMetric].label;heading.append(time);section.append(heading);
    const list=document.createElement('div');list.className='station-comparison-list';
    for(const station of [...airGrid.stations].sort((a,b)=>(b.values[airMetric]??-1)-(a.values[airMetric]??-1))){
      const button=document.createElement('button');button.className='station-comparison-card';button.dataset.airStation=station.id;button.style.setProperty('--station-color',airColor(station.values[airMetric],airMetric));
      const label=document.createElement('span');label.className='station-comparison-name';label.textContent=stationName(station);button.append(label);
      const value=document.createElement('strong');value.textContent=stationValue(station.values[airMetric]);const unit=document.createElement('small');unit.textContent=' '+AIR_METRICS[airMetric].unit;value.append(unit);button.append(value);
      const hint=document.createElement('small');hint.textContent='Показать на карте ↗';button.append(hint);list.append(button);
    }
    section.append(list);host.append(section);
  }
  function syncStations(){
    stationMarkers.forEach(({marker})=>marker.remove());stationMarkers=[];
    if(!map||!map.getSource('ecomind-air-image')||airStatus!=='ready')return;
    for(const station of airGrid?.stations||[]){
      const element=document.createElement('button');element.className='air-station-marker';element.dataset.airStation=station.id;const value=station.values[airMetric];element.style.setProperty('--station-color',airColor(value,airMetric));
      element.setAttribute('aria-label',`${stationName(station)} · ${AIR_METRICS[airMetric].label}: ${stationValue(value)} ${AIR_METRICS[airMetric].unit}`);
      const name=document.createElement('span');name.textContent=stationName(station);const number=document.createElement('strong');number.textContent=stationValue(value);element.append(name,number);element.hidden=currentLayer!=='air';
      const marker=new window.maplibregl.Marker({element,anchor:'bottom'}).setLngLat([station.lng,station.lat]).addTo(map);stationMarkers.push({marker,element});
    }
  }
  function routeFeedback(){
    host.dataset.routingStatus=routeStatus;host.querySelector('.route-map-status')?.remove();
    if(currentLayer!=='route')return;
    const box=document.createElement('div');box.className='route-map-status '+(routeStatus==='error'?'failed':'');
    if(routeStatus==='ready')box.innerHTML=route?.geometry?`${icon('check')}<span>По дорогам · <a href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noopener">OSRM / FOSSGIS</a></span>`:`${icon('info')}<span>Нет остановок по выбранному порогу.</span>`;
    else if(routeStatus==='error'){
      box.innerHTML=icon('warning');const text=document.createElement('span');text.textContent=routeError||'Маршрут по дорогам не получен.';box.append(text);
      const retry=document.createElement('button');retry.className='text-button';retry.dataset.mapAction='retry-route';retry.textContent='Повторить';box.append(retry);
    }else box.innerHTML=`${icon('refresh','spin')}<span>Строим маршрут по дорогам…</span>`;
    view.append(box);
  }
  function updateRoute(next,status='idle',error=''){
    if(disposed)return;route=next;routeStatus=status;routeError=error;
    if(map?.getSource('ecomind-route'))map.getSource('ecomind-route').setData(status==='ready'&&next?.geometry?{type:'Feature',properties:{},geometry:next.geometry}:{type:'FeatureCollection',features:[]});
    syncLayer();
  }
  function updateAir(grid,metric=airMetric,status='ready',error=''){
    if(disposed)return;airGrid=grid;airMetric=metric;airStatus=status;airError=error;
    airPopup?.remove();if(map?.getSource('ecomind-air-image'))map.getSource('ecomind-air-image').updateImage(rasterStations(airStatus==='ready'?airGrid:null,airMetric));syncStations();syncLayer();
    if(map&&currentLayer==='air'&&!savedCamera&&!airFitted&&airGrid&&airStatus==='ready'){focusContainers();airFitted=true;}
  }
  function filter(ids){visibleIds=ids;syncLayer();}
  function focusPoint(lng,lat){if(map)map.flyTo({center:[lng,lat],zoom:16,duration:600});}
  function focusContainers(){
    const points=currentLayer==='air'?(airGrid?.stations||[]):containers;if(!map||!points.length)return;
    const bounds=new window.maplibregl.LngLatBounds();
    points.forEach(c=>bounds.extend([c.lng,c.lat]));
    if(currentLayer==='route')bounds.extend([DEPOT.lng,DEPOT.lat]);
    map.fitBounds(bounds,{padding:65,maxZoom:15,duration:600});
  }
  function sync3D(){
    const button=host.querySelector('[data-map-action="3d"]');if(!button||!map)return;
    const enabled=map.getPitch()>15;button.classList.toggle('active',enabled);button.setAttribute('aria-pressed',String(enabled));
  }
  const handle=e=>{
    const stationButton=e.target.closest('[data-air-station]');if(stationButton){const station=airGrid?.stations.find(s=>s.id===stationButton.dataset.airStation);if(station){if(stationButton.classList.contains('station-comparison-card'))map?.easeTo({center:[station.lng,station.lat],duration:500});openStation(station);}return;}
    const button=e.target.closest('[data-map-action]');if(!button)return;
    const action=button.dataset.mapAction;
    if(action==='retry'){map?.remove();map=null;markers=[];stationMarkers=[];host.dataset.mapStatus='loading';host.querySelector('.map-unavailable')?.remove();startMap();return;}
    if(action==='fullscreen'){host.classList.toggle('fullscreen-map');button.setAttribute('aria-label',host.classList.contains('fullscreen-map')?'Закрыть полный экран':'Развернуть карту');map?.resize();return;}
    if(action==='retry-route'){onRouteRequested?.({force:true});return;}
    if(action==='refresh-air-layer'){onAirRequested?.({force:true});return;}
    if(['waste','air','route'].includes(action)){currentLayer=action;onLayerChanged?.(action);airPopup?.remove();syncLayer();if(action==='route')onRouteRequested?.();if(action==='air')onAirRequested?.();return;}
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
  const changeHandler=e=>{if(e.target.matches('[data-map-air-metric]'))onAirMetric?.(e.target.value);};
  host.addEventListener('click',handle);host.addEventListener('change',changeHandler);document.addEventListener('keydown',keyHandler);
  activeCleanup=()=>{
    disposed=true;clearTimeout(noticeTimer);
    host.removeEventListener('click',handle);host.removeEventListener('change',changeHandler);document.removeEventListener('keydown',keyHandler);airPopup?.remove();
    markers.forEach(({marker})=>marker.remove());stationMarkers.forEach(({marker})=>marker.remove());depotMarker?.remove();map?.remove();
  };

  function startMap(){loadMapLibrary().then(maplibre=>{
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
      map.addSource('ecomind-air-image',{type:'image',...rasterStations(airStatus==='ready'?airGrid:null,airMetric)});
      map.addLayer({id:'ecomind-air-raster',type:'raster',source:'ecomind-air-image',layout:{visibility:'none'},paint:{'raster-opacity':.6,'raster-resampling':'linear','raster-fade-duration':0}},labels);
      if(source)map.addLayer({id:'ecomind-buildings',type:'fill-extrusion',source,'source-layer':'building',minzoom:13,paint:{'fill-extrusion-color':'#cad8ec','fill-extrusion-height':['to-number',['get','render_height'],['get','height'],0],'fill-extrusion-base':['to-number',['get','render_min_height'],0],'fill-extrusion-opacity':.85}},labels);
      containers.forEach(container=>{
        const element=document.createElement('button');element.className='real-marker';
        element.style.setProperty('--marker-color',fillStatus(container.fill).color);
        const demo=getContainerDataState([container]).hasDemo;
        element.title=`${demo?'Выдуманные данные · ':''}${container.id} · ${container.name}`;
        element.setAttribute('aria-label',element.title);element.onclick=()=>onSelect?.(container.id);
        const marker=new maplibre.Marker({element}).setLngLat([container.lng,container.lat]).addTo(map);
        markers.push({marker,element,container});
      });
      map.addSource('ecomind-route',{type:'geojson',data:routeStatus==='ready'&&route?.geometry?{type:'Feature',properties:{},geometry:route.geometry}:{type:'FeatureCollection',features:[]}});
      const before=map.getLayer('ecomind-buildings')?'ecomind-buildings':labels;
      map.addLayer({id:'ecomind-route-casing',type:'line',source:'ecomind-route',layout:{'line-cap':'round','line-join':'round',visibility:'none'},paint:{'line-color':'#ffffff','line-width':8,'line-opacity':.9}},before);
      map.addLayer({id:'ecomind-route-line',type:'line',source:'ecomind-route',layout:{'line-cap':'round','line-join':'round',visibility:'none'},paint:{'line-color':'#246bff','line-width':4.5}},before);
      syncStations();syncLayer();sync3D();
      if(currentLayer==='air'&&!savedCamera&&!airFitted&&airGrid){focusContainers();airFitted=true;}
      if(cameraKey==='route'&&!savedCamera)focusContainers();
    });
    map.on('error',()=>{
      if(disposed)return;
      if(host.dataset.mapStatus==='loading')failed('Не удалось получить карту города от OpenFreeMap. Можно повторить загрузку или открыть Астану по ссылке.');
      else notify('Часть карты не загрузилась. Проверьте интернет и повторите загрузку страницы.');
    });
  }).catch(error=>failed(error.message||'Картографический сервис временно недоступен.'));}
  startMap();
  return {updateRoute,updateAir,filter,focusPoint};
}
