import {ASTANA_DISTRICTS,DISTRICT_SOURCE,districtSummary,districtFeatures,districtAt,districtBounds,districtLabelPoint} from './districts.js';
import {stationValue,stationTime,STATION_METRICS} from './air-stations.js';

const SOURCE='ecomind-districts',LAYERS=['ecomind-district-fill','ecomind-district-casing','ecomind-district-line'];
const stationName=station=>station.name.replace(/^PCP\s*#\s*(\d+)$/i,'Пост №$1');
const element=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;};
const plural=count=>count===1?'станция':count<5?'станции':'станций';

export function createDistrictMap({map,maplibre,host,before,data=null,metric='pm2_5',status='idle',onOpen}){
  let summaries=districtSummary(status==='ready'?data:null,metric),visible=false,selected=null,popup,markers=[];
  map.addSource(SOURCE,{type:'geojson',data:districtFeatures(summaries,metric),attribution:'Районы: <a href="https://gis.esaulet.kz/portal/" target="_blank">Геопортал Астаны</a>'});
  map.addLayer({id:LAYERS[0],type:'fill',source:SOURCE,layout:{visibility:'none'},paint:{'fill-color':['get','color'],'fill-opacity':['case',['get','measured'],.20,.055]}},before);
  map.addLayer({id:LAYERS[1],type:'line',source:SOURCE,layout:{visibility:'none'},paint:{'line-color':'#ffffff','line-width':4,'line-opacity':.8}},before);
  map.addLayer({id:LAYERS[2],type:'line',source:SOURCE,layout:{visibility:'none'},paint:{'line-color':'#365e9a','line-width':1.6,'line-opacity':.85}},before);

  function valueText(d){return status==='loading'?'Загрузка…':status!=='ready'?'Замеры недоступны':d.count?stationValue(d.mean)+' '+STATION_METRICS[metric].unit:'Нет замеров';}
  function highlight(){
    for(const button of host.querySelectorAll('[data-air-district]')){const active=button.dataset.airDistrict===selected;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));}
    map.setPaintProperty(LAYERS[2],'line-width',['case',['==',['get','id'],selected||''],3.4,1.6]);
  }
  function openDistrict(id,location){
    const d=summaries.find(item=>item.id===id);if(!d||!visible)return;onOpen?.();selected=id;highlight();
    const content=element('div','air-cell-popup district-popup');content.append(element('strong','',d.name+' · район'));
    content.append(element('p','district-popup-value',valueText(d)));
    if(d.count){
      content.append(element('p','',`Среднее по ${d.count} из ${d.stations.length} станций с ${STATION_METRICS[metric].label}. Диапазон: ${stationValue(d.min)}–${stationValue(d.max)} ${STATION_METRICS[metric].unit}.`));
      content.append(element('small','',stationTime(data.time)+' · Астана'));
      content.append(element('p','','Это среднее по доступным станциям внутри границ, а не замер всего района.'));
    }else content.append(element('p','','В этом районе нет доступных показаний за выбранный час. Цвет соседнего района сюда не переносится.'));
    for(const station of d.stations){const button=element('button','district-station-link',`${stationName(station)} · ${stationValue(station.values[metric])} ${STATION_METRICS[metric].unit} ↗`);button.dataset.airStation=station.id;content.append(button);}
    const source=element('a','','Границы · городской геопортал');source.href=DISTRICT_SOURCE.url;source.target='_blank';source.rel='noopener';content.append(source);
    popup?.remove();popup=new maplibre.Popup({maxWidth:'310px',offset:16}).setLngLat(location||districtLabelPoint(d.feature)).setDOMContent(content).addTo(map);
  }
  function syncMarkers(){
    markers.forEach(m=>m.remove());markers=[];
    for(const d of summaries){
      const button=element('button','district-map-label');button.dataset.airDistrict=d.id;button.setAttribute('aria-label',d.name+' · район · '+valueText(d));
      button.append(element('strong','',d.name),element('span','',d.count?stationValue(d.mean)+' · '+d.count+' ст.':status==='loading'?'Загрузка…':status==='ready'?'Нет замеров':'Нет данных'));
      button.classList.toggle('unmeasured',!d.count);button.hidden=!visible;
      markers.push(new maplibre.Marker({element:button,anchor:'center'}).setLngLat(districtLabelPoint(d.feature)).addTo(map));
    }
    highlight();
  }
  function renderPanel(){
    host.querySelector('.district-comparison')?.remove();if(!visible)return;
    const section=element('section','district-comparison');section.setAttribute('aria-label','Качество воздуха по районам Астаны');
    const heading=element('div','district-heading');const title=element('div');title.append(element('span','district-eyebrow','6 АДМИНИСТРАТИВНЫХ РАЙОНОВ'),element('h3','','Воздух по районам Астаны'));heading.append(title);
    const all=element('button','button','Все районы');all.dataset.airDistrictAll='';heading.append(all);section.append(heading);
    section.append(element('p','district-explainer','Цвет района — среднее доступных станций внутри его границ. Это сводка по точкам наблюдения, а не равномерное качество воздуха на всей территории.'));
    section.append(element('p','district-mobile-tip','Приблизьте карту, чтобы увидеть отдельные станции, или выберите станцию в карточке района.'));
    if(data&&status==='ready')section.append(element('p','district-time',stationTime(data.time)+' · время Астаны · '+STATION_METRICS[metric].label+' · мкг/м³'));
    const cards=element('div','district-card-grid');
    for(const d of summaries){
      const button=element('button','district-card'+(!d.count?' unmeasured':''));button.dataset.airDistrict=d.id;button.style.setProperty('--district-color',districtFeatures([d],metric).features[0].properties.color);
      button.append(element('span','district-card-name',d.name),element('strong','district-card-value',d.count?stationValue(d.mean):'—'));
      button.append(element('span','district-card-unit',d.count?'мкг/м³ · среднее станций':status==='loading'?'Получаем замеры…':status==='ready'?'Нет замеров за этот час':'Данные не загружены'));
      if(d.count)button.append(element('small','',(d.count<d.stations.length?d.count+' из '+d.stations.length+' станций':d.count+' '+plural(d.count))+' · '+(d.count>1?'от '+stationValue(d.min)+' до '+stationValue(d.max):stationName(d.stations.find(s=>Number.isFinite(s.values[metric]))))));
      else button.append(element('small','','Оценка отсутствует'));
      cards.append(button);
    }
    section.append(cards);
    const foot=element('div','district-source-note');const link=element('a','','Границы: геопортал Астаны ↗');link.href=DISTRICT_SOURCE.url;link.target='_blank';link.rel='noopener';foot.append(link,element('span','','Картографический слой получен 24.10.2026. Дата актуализации геометрии источником не указана.'));section.append(foot);
    const note=host.querySelector('.air-layer-note');if(note)note.after(section);else host.append(section);highlight();
  }
  function focus(full=false){
    const bounds=new maplibre.LngLatBounds();
    if(full)ASTANA_DISTRICTS.features.forEach(f=>districtBounds(f).forEach(point=>bounds.extend(point)));
    else{ASTANA_DISTRICTS.features.forEach(f=>bounds.extend(districtLabelPoint(f)));for(const station of data?.stations||[])bounds.extend([station.lng,station.lat]);}
    map.fitBounds(bounds,{padding:{top:75,bottom:70,left:65,right:65},maxZoom:12.1,duration:650});
  }
  const handle=e=>{
    const button=e.target.closest('[data-air-district]');if(button){const d=summaries.find(item=>item.id===button.dataset.airDistrict);if(d){if(button.classList.contains('district-card')){host.querySelector('.map-viewport')?.scrollIntoView({behavior:'smooth',block:'center'});map.easeTo({center:districtLabelPoint(d.feature),duration:450});}openDistrict(d.id);}return;}
    if(e.target.closest('[data-air-district-all]')){selected=null;popup?.remove();highlight();focus(true);host.querySelector('.map-viewport')?.scrollIntoView({behavior:'smooth',block:'center'});}
  };
  const clickMap=e=>{if(!visible||e.originalEvent?.target?.closest('button,a,.maplibregl-popup'))return;const feature=districtAt(e.lngLat.lng,e.lngLat.lat);if(feature)openDistrict(feature.properties.id,[e.lngLat.lng,e.lngLat.lat]);};
  host.addEventListener('click',handle);map.on('click',clickMap);syncMarkers();
  return {
    update(next,nextMetric,nextStatus){data=next;metric=nextMetric;status=nextStatus;summaries=districtSummary(status==='ready'?data:null,metric);map.getSource(SOURCE).setData(districtFeatures(summaries,metric));popup?.remove();syncMarkers();renderPanel();},
    setVisible(next){visible=next;for(const id of LAYERS)map.setLayoutProperty(id,'visibility',visible?'visible':'none');for(const m of markers)m.getElement().hidden=!visible;if(!visible)popup?.remove();renderPanel();host.dataset.districtsVisible=String(visible);host.dataset.districtsCount=String(summaries.length);},
    focus,
    closePopup(){popup?.remove();},
    destroy(){host.removeEventListener('click',handle);map.off('click',clickMap);markers.forEach(m=>m.remove());popup?.remove();host.querySelector('.district-comparison')?.remove();}
  };
}
