import test from 'node:test';
import assert from 'node:assert/strict';
import {ASTANA_DISTRICTS,districtAt,geometryContains,districtLabelPoint,districtBounds,districtSummary,districtFeatures} from '../dist/districts.js';
const time=Date.parse('2026-10-24T08:00:00Z')/1000;
const station=(id,lng,lat,value,extra={})=>({id,name:'PCP#'+id,lng,lat,time,values:{pm2_5:value,pm10:null},...extra});

test('six city geoportal districts contain their labels and known station coordinates',()=>{
  assert.equal(ASTANA_DISTRICTS.features.length,6);assert.equal(new Set(ASTANA_DISTRICTS.features.map(f=>f.id)).size,6);
  for(const feature of ASTANA_DISTRICTS.features){assert.equal(districtAt(...districtLabelPoint(feature))?.id,feature.id);const bounds=districtBounds(feature);assert.ok(bounds[0][0]<bounds[1][0]);assert.ok(bounds[0][1]<bounds[1][1]);}
  assert.equal(districtAt(71.393202,51.08901)?.id,'nura');assert.equal(districtAt(71.415058185,51.157371472)?.id,'nura');assert.equal(districtAt(71.345104,51.185365)?.id,'saryarka');assert.equal(districtAt(71.467460014,51.158413811)?.id,'almaty');
  assert.equal(districtAt(76.9,43.2),null);assert.equal(districtAt(NaN,51),null);
});

test('point-in-polygon excludes holes and supports detached islands',()=>{
  const polygon={type:'Polygon',coordinates:[[[0,0],[10,0],[10,10],[0,10],[0,0]],[[3,3],[7,3],[7,7],[3,7],[3,3]]]};
  assert.equal(geometryContains([2,2],polygon),true);assert.equal(geometryContains([5,5],polygon),false);assert.equal(geometryContains([3,5],polygon),false);
  const multi={type:'MultiPolygon',coordinates:[polygon.coordinates,[[[20,20],[21,20],[21,21],[20,21],[20,20]]]]};assert.equal(geometryContains([20.5,20.5],multi),true);assert.equal(geometryContains([15,15],multi),false);
});

test('district mean uses only in-boundary same-hour measurements and preserves zero and missing channels',()=>{
  const data={time,stations:[station('12',71.393202,51.08901,50),station('14',71.415058185,51.157371472,0),station('7',71.345104,51.185365,3),station('9',71.467460014,51.158413811,null),station('elsewhere',76.9,43.2,999),station('old',71.393202,51.08901,200,{time:time-3600})]};
  const summaries=districtSummary(data,'pm2_5'),nura=summaries.find(d=>d.id==='nura');assert.equal(nura.count,2);assert.equal(nura.mean,25);assert.equal(nura.min,0);assert.equal(nura.max,50);
  const almaty=summaries.find(d=>d.id==='almaty');assert.equal(almaty.stations.length,1);assert.equal(almaty.mean,null);assert.equal(almaty.count,0);
  const unknown=summaries.find(d=>d.id==='baikonyr');assert.equal(unknown.mean,null);assert.equal(unknown.stations.length,0);
  assert.ok(districtSummary(data,'pm10').every(d=>d.mean===null));
  const features=districtFeatures(summaries,'pm2_5');assert.equal(features.features.length,6);assert.equal(features.features.find(f=>f.id==='nura').properties.value,25);assert.equal(features.features.find(f=>f.id==='baikonyr').properties.measured,false);
});
