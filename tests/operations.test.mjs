import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyOps,applyOperation,assignFleet,filterSites} from '../dist/operations.js';
import {rowsToContainers} from '../dist/import-data.js';
import {parseAirGrid,gridGeoJSON,AIR_GRID_CENTERS,airColor} from '../dist/air-map.js';
const stamp='2026-10-21T10:00:00.000Z';
test('manual observations append immutable history, zero and missing values stay distinct',()=>{
  const original=emptyOps();const next=applyOperation(original,{id:'op-1',type:'observe',containerId:'EM-001',fill:0,confidence:'high',note:'Empty'},{now:stamp});
  assert.equal(original.containers[0].fill,94);assert.equal(next.containers[0].fill,0);assert.equal(next.events[0].at,stamp);assert.equal(next.events[0].fill,0);
  const unknown=applyOperation(next,{id:'op-2',type:'observe',containerId:'EM-001',fill:null},{now:stamp});assert.equal(unknown.containers[0].fill,null);
  assert.equal(applyOperation(next,{id:'op-1',type:'observe',containerId:'EM-001',fill:50}),next);
});
test('driver completion records empty container only on a confirmed collection',()=>{
  let ops=emptyOps();ops=applyOperation(ops,{id:'publish',type:'publish-runs',runs:[{truckId:'truck-1',truckName:'01',stops:['EM-001','EM-002'],distance:2,duration:200}]});
  const runId=ops.runs[0].id;const blocked=applyOperation(ops,{id:'blocked',type:'service',runId,containerId:'EM-001',status:'blocked',note:'Locked'},{role:'driver'});
  assert.equal(blocked.containers[0].fill,94);assert.equal(blocked.runs[0].tasks[0].status,'blocked');
  const done=applyOperation(blocked,{id:'done',type:'service',runId,containerId:'EM-002',status:'done'},{role:'driver'});assert.equal(done.containers[1].fill,0);assert.ok(done.runs[0].finishedAt);
  assert.throws(()=>applyOperation(done,{id:'duplicate',type:'service',runId,containerId:'EM-002',status:'done'}));
  assert.throws(()=>applyOperation(ops,{id:'invalid',type:'service',runId,containerId:'EM-001',status:'skipped',note:''}));
  assert.throws(()=>applyOperation(ops,{id:'driver-import',type:'import',containers:[]},{role:'driver'}));
});
test('fleet cannot overfill vehicles or silently omit mandatory and unknown-load sites',()=>{
  const sites=[{id:'a',capacity:1000,fill:90,mandatory:true},{id:'b',capacity:1000,fill:90},{id:'c',capacity:1000,fill:null,mandatory:true}];
  const truck={id:'one',capacity:1000,minutes:10},network={points:[{id:'depot'},...sites],durations:Array.from({length:4},()=>[0,60,60,60])};
  const result=assignFleet([network],sites,[truck],{threshold:95,stopMinutes:3});assert.equal(result.selected,2);assert.equal(result.assignments[0].stops[0].id,'a');assert.equal(result.assignments[0].load,900);assert.equal(result.unassigned[0].id,'c');
  const full=assignFleet([network],sites,[truck],{threshold:75});assert.equal(full.assignments[0].stops.length,1);assert.equal(full.unassigned.length,2);
  assert.equal(assignFleet([network],sites,[{...truck,minutes:1}],{threshold:75}).assignments[0].stops.length,0);
});
test('import previews report duplicate IDs, malformed coordinates and preserve empty fill',()=>{
  const rows=[['id','name','lat','lng','capacity','fill'],['REAL-1','A',51.1,71.4,1100,''],['REAL-1','B',51.2,71.4,1100,50],['REAL-3','C',100,71.4,1100,20]];
  const result=rowsToContainers(rows);assert.equal(result.containers.length,1);assert.equal(result.containers[0].fill,null);assert.equal(result.containers[0].locationSource,'real');assert.equal(result.errors.length,2);
  assert.throws(()=>rowsToContainers([['id'],['a']]));
});
test('map filters handle unknown timestamps and search only the registered addresses',()=>{
  const sites=[{id:'a',name:'A',address:'Test 12',fill:80,type:'Mixed',observedAt:stamp},{id:'b',name:'B',address:'Other',fill:null,type:'Mixed'}];
  assert.equal(filterSites(sites,{query:'test 12'}).length,1);assert.equal(filterSites(sites,{attention:true}).length,1);assert.equal(filterSites(sites,{freshDays:1},Date.parse(stamp)).length,1);
});
test('import replacement removes untouched examples while preserving manual observations',()=>{
  const ops=emptyOps();ops.containers[0].source='manual';const incoming={...ops.containers[1],id:'real-site',source:'verified',locationSource:'real',fill:null};
  const result=applyOperation(ops,{id:'real-import',type:'import',containers:[incoming],replaceDemo:true});
  assert.deepEqual(result.containers.map(c=>c.id),['EM-001','real-site']);assert.equal(result.containers[1].fill,null);
});
test('air cells follow source grid coordinates, missing values remain missing and colors use absolute bands',()=>{
  const data=AIR_GRID_CENTERS.map(c=>({latitude:c.lat,longitude:c.lng,current:{time:Date.parse(stamp)/1000,european_aqi:23,pm2_5:null,pm10:4}}));
  const parsed=parseAirGrid(data,Date.parse(stamp));const grid=gridGeoJSON(parsed);assert.equal(grid.features.length,9);assert.equal(grid.features[0].properties.value,23);assert.ok(Math.abs(grid.features[0].geometry.coordinates[0][1][0]-grid.features[0].geometry.coordinates[0][0][0]-.4)<1e-9);
  assert.equal(airColor(22),airColor(23));assert.notEqual(airColor(20),airColor(21));assert.equal(gridGeoJSON(parsed,'pm2_5').features[0].properties.value,null);
  assert.throws(()=>parseAirGrid([]));assert.equal(parseAirGrid(data,Date.parse(stamp)+7*3600000).stale,true);
});
