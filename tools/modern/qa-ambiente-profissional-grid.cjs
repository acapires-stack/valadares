const assert=require('node:assert/strict'),world=require('../../modern-world');
const result=[];
for(const room of world.interiors){
 const {rows,region}=room.grid,free=(x,y)=>rows[y-region.y0]?.[x-region.x0]==='1';
 const queue=[[room.spawn.x,room.spawn.y]],seen=new Set(queue.map(p=>p.join(',')));
 for(let i=0;i<queue.length;i++)for(const [dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
  const x=queue[i][0]+dx,y=queue[i][1]+dy,key=`${x},${y}`;
  if(seen.has(key)||!free(x,y))continue;seen.add(key);queue.push([x,y]);
 }
 const count=rows.join('').split('1').length-1;
 assert.equal(seen.size,count,room.id+' contains inaccessible floor');
 assert(seen.has(`${room.exit.x},${room.exit.y}`),room.id+' exit reachable');
 for(const s of room.services)assert(seen.has(`${s.x},${s.y+1}`),room.id+' service approach reachable');
 result.push({room:room.id,reachable:seen.size,free:count,exit:true,services:true});
}
assert.equal(world.interiors[0].grid.rows[48-46][48-46],'0','tavern table blocks movement');
console.log(JSON.stringify(result,null,2));
