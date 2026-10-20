import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEMO_CONTAINERS,getContainerDataState} from '../dist/data.js';
import {dataNotice} from '../dist/provenance.js';

test('seed data and legacy saved records are clearly marked as invented',()=>{
  assert.equal(getContainerDataState(DEMO_CONTAINERS).demoLocations,12);
  assert.equal(getContainerDataState(DEMO_CONTAINERS).demoReadings,12);
  assert.ok(dataNotice(DEMO_CONTAINERS,'map').includes('Данные пока выдуманные'));
  assert.equal(getContainerDataState([{fill:50}]).hasDemo,true);
});
test('a manual reading cannot turn an invented position into a verified site',()=>{
  const c={...DEMO_CONTAINERS[0],fill:40,source:'manual'};
  const status=getContainerDataState([c]);
  assert.equal(status.demoReadings,0);assert.equal(status.demoLocations,1);assert.equal(status.hasDemo,true);
  assert.ok(dataNotice([c],'map').includes('Расположение контейнеров пока условное'));
});
test('real supplied positions and observations automatically remove the invented-data notice',()=>{
  const records=[{...DEMO_CONTAINERS[0],locationSource:'real',source:'sensor'}];
  assert.equal(getContainerDataState(records).hasDemo,false);assert.equal(dataNotice(records,'map'),'');
  assert.ok(dataNotice([]).includes('Реальных данных пока нет'));
});
