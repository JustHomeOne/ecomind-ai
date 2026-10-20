import test from 'node:test';
import assert from 'node:assert/strict';
import {rollingDayMean,parseAirPayload,aqiTone,AIR_BENCHMARKS} from '../dist/air-data.js';
const end=Date.UTC(2026,9,20,12)/1000;
const times=Array.from({length:48},(_,i)=>end+(i-23)*3600);
test('24-hour comparison uses only complete past hours and preserves a valid zero',()=>{
  const values=times.map(t=>t<=end?0:1000);
  assert.equal(rollingDayMean(times,values,end).average,0);
  const equal=times.map(t=>t<=end?12:1000);
  assert.equal(rollingDayMean(times,equal,end).average,12);
  equal[0]=null;assert.equal(rollingDayMean(times,equal,end).average,null);
  assert.equal(rollingDayMean(times,equal,end).count,23);
  assert.equal(rollingDayMean(times.slice(1),values.slice(1),end).average,null);
  assert.equal(rollingDayMean([times[0],...times], [0,...values],end).average,null);
});
test('Unix timestamps format in source timezone while future hours remain forecast only',()=>{
  const result=parseAirPayload({current:{time:end,pm2_5:0,pm10:4,european_aqi:22,us_aqi:29},timezone:'Asia/Almaty',hourly:{time:times,pm2_5:times.map(()=>0),pm10:times.map(()=>4),european_aqi:times.map(()=>22)}});
  assert.equal(result.current.time,'2026-10-20T17:00');assert.equal(result.current.pm2_5,0);
  assert.equal(result.rolling.pm10.average,4);assert.equal(result.chart.length,24);
  assert.ok(result.chart.every(p=>p.epoch>=end));
  assert.throws(()=>parseAirPayload({current:{time:'2026-10-20'}}));
});
test('European and US reference scales remain distinct at category boundaries',()=>{
  assert.equal(aqiTone(20).label,'Хорошее');assert.equal(aqiTone(21).label,'Удовлетворительное');
  assert.equal(aqiTone(40,'us').label,'Хорошее');assert.notEqual(aqiTone(40).label,aqiTone(40,'us').label);
  assert.equal(aqiTone(null).label,'Нет данных');
  assert.deepEqual(AIR_BENCHMARKS.pm2_5,{hourlyGood:5,daily:15,annual:5});
});
