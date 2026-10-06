/* Shared village plan: visual architecture and authoritative collision use the
 * same footprints. Quests, NPCs, entrances and the central safe area stay open. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ValadaresWorld=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const buildings=Object.freeze([
  {id:'pousada',x:43,y:43,w:3,h:3},
  {id:'oficina',x:50,y:42,w:4,h:3},
  {id:'biblioteca',x:56,y:45,w:3,h:4},
  {id:'mercado',x:42,y:50,w:3,h:3},
  {id:'estalagem',x:53,y:56,w:4,h:3}
 ].map(Object.freeze));
 function apply(map,T){
  for(const b of buildings){
   for(let y=b.y-1;y<=b.y+b.h;y++)for(let x=b.x-1;x<=b.x+b.w;x++){
    if(!map[y]||x<1||x>=map[y].length-1)continue;
    const inside=x>=b.x&&x<b.x+b.w&&y>=b.y&&y<b.y+b.h;
    map[y][x]=inside?T.TREE:T.DIRT;
   }
  }
  return map;
 }
 return Object.freeze({buildings,apply});
});
