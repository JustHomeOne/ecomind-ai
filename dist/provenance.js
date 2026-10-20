import {getContainerDataState} from './data.js';
import {icon} from './icons.js';

export function dataNotice(containers,context='containers'){
  const status=getContainerDataState(containers);
  if(status.total&&!status.hasDemo)return '';
  const allDemo=status.demoLocations===status.total&&status.demoReadings===status.total;
  const title=!status.total?'Реальных данных пока нет':allDemo?'Данные пока выдуманные':'Часть данных пока выдуманная';
  let detail;
  if(context==='map'){
    detail=status.demoLocations?'Карта Астаны настоящая. Расположение контейнеров пока условное'+(status.demoReadings?', а заполненность содержит выдуманные значения.':'; оценки заполненности внесены пользователем.'): 'Карта и расположение площадок реальные; часть оценок заполненности пока выдуманная.';
  }else if(context==='routes'){
    detail='Маршрут и показатели рассчитаны на примерах контейнеров. Это демонстрация, пока нет реальных данных пилота.';
  }else{
    detail=status.demoReadings?'Контейнеры, заполненность и показатели пока используются как примеры для демонстрации.':'Оценки заполненности внесены пользователем, но расположение площадок ещё не подтверждено.';
  }
  return `<div class="demo-data-notice" role="note">${icon('info')}<div><strong>${title}</strong><p>${detail} Заменим примеры, когда появятся реальные данные.</p></div></div>`;
}
