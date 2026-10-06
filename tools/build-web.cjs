// Publish browser resources only. Local accounts, tools and server source stay out.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,'dist-web');
if(path.dirname(out)!==root||path.basename(out)!=='dist-web')throw Error('Unexpected build directory');
if(fs.existsSync(out)&&fs.lstatSync(out).isSymbolicLink())throw Error('Build directory cannot be a link');
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
let count=0;
function copy(relative){const dest=path.join(out,relative);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,relative),dest);count++;}
for(const file of fs.readdirSync(root,{withFileTypes:true})){
 if(file.isFile()&&/\.(html|css|js|png|jpg|jpeg|svg|ico|webp)$/.test(file.name))copy(file.name);
}
for(const file of ['robots.txt','sitemap.xml'])if(fs.existsSync(path.join(root,file)))copy(file);
function tree(relative,allow){for(const file of fs.readdirSync(path.join(root,relative),{withFileTypes:true})){const name=relative+'/'+file.name;if(file.isDirectory())tree(name,allow);else if(file.isFile()&&allow(name))copy(name);}}
tree('devlog',name=>/\.(html|css|js|png|jpg|jpeg|svg|webp)$/.test(name));
for(const file of ['boot.js','entry.js','renderer.js','world.js','scenery.js','actors.js','ui.js','ui.css'])copy('modern/'+file);
copy('modern/vendor/playcanvas.mjs');copy('modern/vendor/LICENSE-PlayCanvas.txt');
tree('modern/assets',name=>/-game\.glb$|\.(png|jpg|jpeg|webp|txt|json)$/.test(name)||/^modern\/assets\/scenery\/.+\.glb$/.test(name)||/^modern\/assets\/audio\/[\w-]+\.mp3$/.test(name));
const modules=['equipment-rules.js','training-rules.js','transmutation-rules.js','progression-content.js','modern-world.js'];
for(const file of modules)if(!fs.existsSync(path.join(out,file)))throw Error('Missing runtime dependency '+file);
console.log('Public browser build: '+count+' files; no server, local saves, tools or internal documents.');
