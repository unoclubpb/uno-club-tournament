import { build } from 'esbuild';
import { mkdir,copyFile,readdir,rm } from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
await build({entryPoints:['src/app.mjs'],bundle:true,splitting:true,format:'esm',target:['es2022'],outdir:'dist/reorganization-modules',entryNames:'app',chunkNames:'chunks/[name]-[hash]',minify:true});
for(const file of ['index.html','styles.css'])await copyFile(file,'dist/'+file);
await copyFile('dist/reorganization-modules/app.js','app.js');
await copyFile('dist/reorganization-modules/app.js','dist/app.js');
await mkdir('chunks',{recursive:true});
await mkdir('dist/chunks',{recursive:true});
for(const file of await readdir('dist'))if(false)await copyFile('dist/'+file,file);
for(const file of await readdir('dist/reorganization-modules/chunks')){await copyFile('dist/reorganization-modules/chunks/'+file,'chunks/'+file);await copyFile('dist/reorganization-modules/chunks/'+file,'dist/chunks/'+file);}
console.log('Built Tournament Director 0.4.0-reorg.28 (Reorganization) with lazy screen chunks');
