import test from 'node:test';
import assert from 'node:assert/strict';
import {csvRows,stationCollector,assembleStations,MAX_STATION_AGE} from '../dist/air-stations.js';
import {airColor} from '../dist/air-map.js';

const now=Date.parse('2026-10-21T13:30:00Z');
const header=['datetime_utc','station_id','station_name','source','lat','lon','value_ugm3','raw_value','raw_unit','conversion_note'];
const row=(id,value,time='2026-10-21 08:00:00+00:00',extras={})=>header.map(key=>({datetime_utc:time,station_id:id,station_name:'PCP#6',source:'kgmt',lat:'51.08901',lon:'71.393202',value_ugm3:String(value),raw_value:'0.05017',raw_unit:'mg/m³',conversion_note:'mg/m3 -> ug/m3 (x1000)',...extras})[key]);
function read(rows,metric='pm2_5'){const c=stationCollector(metric,now);c.accept(header);rows.forEach(c.accept);return c.records();}

test('CSV streaming handles quoted commas, escaped quotes, CRLF and arbitrary chunk boundaries',()=>{
  const result=[],parser=csvRows(r=>result.push(r));
  const csv='id,name,note\r\n1,"Station, North","line 1\nline ""2"""\r\n2,South,0';
  for(const char of csv)parser.push(char);parser.finish();
  assert.deepEqual(result,[['id','name','note'],['1','Station, North','line 1\nline "2"'],['2','South','0']]);
  const broken=csvRows(()=>{});broken.push('"unfinished');assert.throws(()=>broken.finish());
});

test('only recent Astana KGMT stations with valid units and coordinates are kept; zero stays zero',()=>{
  const rows=[row('kgmt_12',50.17),row('kgmt_14',0),row('kgmt_7',''),row('kgmt_9',-1),row('kgmt_1',1000),row('kgmt_2',3,'2025-10-21 08:00:00+00:00'),row('kgmt_3',4,'2026-10-22 08:00:00+00:00'),row('kgmt_4',5,undefined,{lat:'43.2'}),row('oaq_7094',6,undefined,{source:'openaq'})];
  const result=read(rows);assert.equal(result.length,2);assert.equal(result[0].value,50.17);assert.equal(result[0].rawValue,.05017);assert.equal(result[1].value,0);
  assert.throws(()=>{const c=stationCollector('pm10',now);c.accept(['changed']);});
});

test('conflicting duplicates are excluded independently of input order',()=>{
  assert.equal(read([row('kgmt_12',50),row('kgmt_12',30),row('kgmt_12',50)]).length,0);
  assert.equal(read([row('kgmt_12',50),row('kgmt_12',50)]).length,1);
});

test('comparison uses latest common hour and retains missing channels without model fallback',()=>{
  const pm25=read([row('kgmt_12',50.17),row('kgmt_14',2.97),row('kgmt_12',70,'2026-10-21 09:00:00+00:00')]);
  const pm10=read([row('kgmt_12',52.35)],'pm10');
  const result=assembleStations([...pm25,...pm10],now);assert.equal(result.stations.length,2);assert.equal(result.time,Date.parse('2026-10-21T08:00:00Z')/1000);assert.equal(result.stations[0].values.pm2_5,50.17);assert.equal(result.stations[1].values.pm10,null);
  assert.notEqual(airColor(50.17,'pm2_5'),airColor(2.97,'pm2_5'));assert.equal(result.stale,false);
  assert.throws(()=>assembleStations([...pm25,...pm10],now+MAX_STATION_AGE));
  assert.throws(()=>assembleStations([...read([row('kgmt_12',40)]),...read([row('kgmt_12',50,'2026-10-21 09:00:00+00:00')],'pm10')],now));
});

test('partial source availability does not invent the other pollutant; changed coordinates cannot be mixed',()=>{
  const one=assembleStations(read([row('kgmt_12',0)]),now);assert.equal(one.stations[0].values.pm2_5,0);assert.equal(one.stations[0].values.pm10,null);
  assert.throws(()=>assembleStations([...read([row('kgmt_12',10)]),...read([row('kgmt_12',20,undefined,{lat:'51.15'})],'pm10')],now));
  const delayed=assembleStations(read([row('kgmt_12',0)]),now+3600000);assert.equal(delayed.stale,true);
});
