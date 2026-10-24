import { build } from 'esbuild';
import { mkdir,copyFile } from 'node:fs/promises';
await mkdir('dist',{recursive:true});
await build({entryPoints:['src/app.mjs'],bundle:true,format:'esm',target:['es2022'],outfile:'dist/app.js',minify:true});
for(const file of ['index.html','styles.css'])await copyFile('src/'+file,'dist/'+file);
for(const file of ['index.html','styles.css','app.js'])await copyFile('dist/'+file,file);
console.log('Built Tournament Director v0.3.16 for GitHub Pages');
