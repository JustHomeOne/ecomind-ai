import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,mkdirSync} from 'node:fs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
export function localStorageBindings({memory=false}={}){
  if(!memory)mkdirSync('.local',{recursive:true});const sqlite=new DatabaseSync(memory?':memory:':'.local/ecomind.sqlite');
  sqlite.exec('CREATE TABLE IF NOT EXISTS _local_migrations (name TEXT PRIMARY KEY)');
  for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())if(!sqlite.prepare('SELECT name FROM _local_migrations WHERE name=?').get(file)){sqlite.exec(readFileSync('drizzle/'+file,'utf8'));sqlite.prepare('INSERT INTO _local_migrations(name) VALUES (?)').run(file);}
  const DB={prepare(sql){let args=[];const result={bind(...values){args=values;return result;},first(){return sqlite.prepare(sql).get(...args)||null;},all(){return {results:sqlite.prepare(sql).all(...args)};},run(){const outcome=sqlite.prepare(sql).run(...args);return {success:true,meta:{changes:Number(outcome.changes)}};}};return result;},batch(statements){sqlite.exec('BEGIN');try{const result=statements.map(s=>s.run());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
  const root=resolve('.local/photos'),files=new Map();function path(key){if(!/^[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+\.jpg$/.test(key))throw new Error('Invalid photo key');const full=resolve(root,key);if(!full.startsWith(root+sep))throw new Error('Invalid photo path');return full;}
  const BUCKET={async put(key,bytes){if(memory){files.set(key,bytes);return;}const file=path(key);await mkdir(dirname(file),{recursive:true});await writeFile(file,bytes);},async get(key){try{const bytes=memory?files.get(key):await readFile(path(key));return bytes?{body:bytes}:null;}catch{return null;}}};return {DB,BUCKET,close:()=>sqlite.close()};
}
