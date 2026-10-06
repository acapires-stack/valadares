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
 // Shared, peaceful village rooms. Coordinates remain in world tile space so the
 // existing dungeonEnter grid renderer and authoritative movement can be reused.
 const interiorRegion=Object.freeze({x0:46,y0:46,x1:54,y1:52});
 const interiorRows=Object.freeze([
  '000000000',
  '011111110',
  '011111110',
  '011111110',
  '011111110',
  '011111110',
  '000000000'
 ]);
 const interiorGrid=Object.freeze({region:interiorRegion,rows:interiorRows});
 const interiors=Object.freeze([
  {id:'pousada',label:'Taverna da Pousada',floor:1000,door:{x:44,y:46},spawn:{x:50,y:50},exit:{x:50,y:51},grid:interiorGrid,services:[]},
  {id:'oficina',label:'Ferraria da Oficina',floor:1001,door:{x:52,y:45},spawn:{x:50,y:50},exit:{x:50,y:51},grid:interiorGrid,services:[{kind:'craft',x:50,y:46}]},
  {id:'biblioteca',label:'Templo da Biblioteca',floor:1002,door:{x:57,y:49},spawn:{x:50,y:50},exit:{x:50,y:51},grid:interiorGrid,services:[{kind:'altar',x:50,y:46}]},
  {id:'mercado',label:'Sala de Treino do Mercado',floor:1003,door:{x:43,y:53},spawn:{x:50,y:50},exit:{x:50,y:51},grid:interiorGrid,services:[{kind:'dummy',x:50,y:46}]}
 ].map(i=>Object.freeze({...i,door:Object.freeze(i.door),spawn:Object.freeze(i.spawn),exit:Object.freeze(i.exit),services:Object.freeze(i.services.map(s=>Object.freeze(s)))})));
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
 return Object.freeze({buildings,interiors,apply});
});
