import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
for(const name of [...readdirSync('dist').filter(file=>file.endsWith('.js')).map(file=>'dist/'+file),'worker/index.js']){
  const result=spawnSync(process.execPath,['--check',name],{stdio:'inherit'});
  if(result.status!==0)process.exit(result.status||1);
}
