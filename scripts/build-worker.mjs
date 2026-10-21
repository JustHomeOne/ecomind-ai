import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {extname} from 'node:path';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8'};
const assets={};for(const name of await readdir('dist')){if(!types[extname(name)])continue;assets[name]={type:types[extname(name)],content:await readFile('dist/'+name,'utf8')};}
const source=await readFile('worker/index.js','utf8'),built=source.replace('__ECOMIND_ASSETS__',()=>JSON.stringify(assets));
const manifest=JSON.parse(await readFile('.openai/hosting.json','utf8'));
if(manifest.static)throw new Error('Worker deployment must not have a static directory in the source manifest.');
await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await build({stdin:{contents:built,resolveDir:fileURLToPath(new URL('../worker/',import.meta.url)),sourcefile:'index.js'},bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'dist/server/index.js'});await writeFile('dist/.openai/hosting.json',JSON.stringify(manifest,null,2)+'\n');
console.log(`Worker built: ${Object.keys(assets).length} embedded assets, ${Buffer.byteLength(built)} bytes`);
