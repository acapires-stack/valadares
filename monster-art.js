// Criaturas do Valadares: silhuetas em grade 48x48, sem indicadores de jogo.
(function(){
    'use strict';

    const TYPES = new Set(['RAT','SPIDER','WOLF','ORC','ORC_LIDER','SKELETON','DRAKE','DRAKE_LIDER']);
    const SIZE = {RAT:.7,SPIDER:.85,WOLF:1,ORC:1.05,ORC_LIDER:1.4,SKELETON:1,DRAKE:1.1,DRAKE_LIDER:1.6};
    const C = {
        ink:'#181311', outline:'#2b211d', pink:'#c98075', pinkHi:'#eda99a',
        fur:'#785747', furHi:'#a27a5b', furLo:'#49372f',
        purple:'#49313f', purpleHi:'#765166', purpleLo:'#2c202e', amber:'#e6a94e',
        wolf:'#696660', wolfHi:'#a19b8d', wolfLo:'#414249', cream:'#d5c8ad',
        green:'#667d3d', greenHi:'#9aaa60', greenLo:'#405331',
        hide:'#765039', hideHi:'#ab7750', hideLo:'#493224',
        bone:'#c9bea4', boneHi:'#eee1be', boneLo:'#8f8474',
        iron:'#7d8587', ironHi:'#bdc1b8', ironLo:'#49545b',
        red:'#913b2c', redHi:'#c4603c', redLo:'#592b29',
        gold:'#b98c49', goldHi:'#e5bf70'
    };
    const cache = new Map();
    const extraPainters = new Map();
    function registerTypes(definitions,painter){
        if(!definitions||typeof painter!=='function') return;
        for(const [type,def]of Object.entries(definitions)){
            if(TYPES.has(type)||!def||!Number.isFinite(def.size)) continue;
            TYPES.add(type);SIZE[type]=def.size;
            extraPainters.set(type,{paint:painter,idle:!!def.idle});
        }
    }

    function paint(g,type,dir,walk,attack,idle){
        const back=dir==='up', side=dir==='left'||dir==='right';
        const left=dir==='left';
        const boss=type==='ORC_LIDER'||type==='DRAKE_LIDER';
        const R=(x,y,w,h,c)=>{ if(w>0&&h>0){g.fillStyle=c;g.fillRect(x|0,y|0,w|0,h|0);} };
        // Horizontal and vertical runs keep every contour sharp at native resolution.
        const H=(y,x1,x2,c)=>R(x1,y,x2-x1,1,c);
        const V=(x,y1,y2,c)=>R(x,y1,1,y2-y1,c);
        // Scanline polygons produce stepped silhouettes without antialiased edges.
        const P=(points,color)=>{
            const top=Math.floor(Math.min(...points.map(p=>p[1]))),bottom=Math.ceil(Math.max(...points.map(p=>p[1])));
            for(let y=top;y<bottom;y++){
                const scan=y+.5,xs=[];
                for(let i=0;i<points.length;i++){
                    const a=points[i],b=points[(i+1)%points.length];
                    if((a[1]<=scan&&b[1]>scan)||(b[1]<=scan&&a[1]>scan))xs.push(a[0]+(scan-a[1])*(b[0]-a[0])/(b[1]-a[1]));
                }
                xs.sort((a,b)=>a-b);
                for(let i=0;i+1<xs.length;i+=2){const start=Math.ceil(xs[i]-.5),end=Math.ceil(xs[i+1]-.5);R(start,y,end-start,1,color);}
            }
        };
        const flip=()=>{ if(left){g.translate(48,0);g.scale(-1,1);} };
        const step=walk===0?0:walk>0?2:-2;
        const extra=extraPainters.get(type);
        if(extra){
            extra.paint(g,{type,dir,walk,attack,idle,back,side,left,step,R,P,H,V,flip,C});
            return;
        }
        if(attack&&['RAT','SPIDER','WOLF'].includes(type)){
            const reach=attack===2?2:1;
            g.translate(side?(left?-reach:reach):0,side?0:back?-reach:reach);
        }

        function rat(){
            flip();
            if(side){
                // Tail curls behind the low back; all four feet remain visible.
                H(30,2,11,C.pink);H(29,1,4,C.pink);V(0,25,30,C.pink);
                H(24,6,10,C.pinkHi);H(28,8,12,C.pink);
                P([[10,30],[12,24],[17,20],[25,20],[31,24],[34,32],[29,37],[17,37],[11,34]],C.ink);
                P([[12,30],[15,25],[19,22],[25,22],[30,26],[31,33],[26,35],[17,35]],C.furLo);
                P([[14,27],[19,22],[25,22],[29,26],[26,31],[17,33],[13,31]],C.fur);
                P([[18,24],[24,23],[27,25],[23,27],[18,27]],C.furHi);
                P([[29,25],[37,25],[41,29],[45,32],[40,35],[32,36],[27,32]],C.ink);
                P([[31,26],[36,27],[42,31],[42,33],[34,34],[30,31]],C.fur);
                R(35,21,6,7,C.ink);R(36,22,4,5,C.pink);
                R(38,23,3,3,C.pinkHi);R(30,23,6,5,C.ink);R(31,24,4,3,C.pinkHi);
                R(35,29,10,5,C.furLo);R(38,30,7,3,C.fur);
                R(42,31,4,2,C.pinkHi);R(42,30,3,1,C.ink);
                R(35,27,2,2,C.ink);R(36,27,1,1,C.amber);
                for(const [x,y] of [[13,0],[20,-step],[30,step],[38,0]]){
                    R(x,34+y,4,7,C.ink);R(x+1,35+y,2,5,C.pink);
                    R(x,40+y,6,2,C.pinkHi);
                }
            }else{
                // Back swaps the muzzle for the haunches and exposes the tail.
                if(back){H(39,11,19,C.pink);H(37,8,13,C.pink);V(8,31,38,C.pink);}
                P([[15,22],[20,18],[28,18],[33,22],[37,31],[34,37],[14,37],[11,31]],C.ink);
                P([[16,24],[21,20],[27,20],[32,24],[35,31],[32,35],[16,35],[13,31]],C.furLo);
                P([[18,23],[22,20],[27,21],[31,24],[32,30],[28,34],[18,32],[16,28]],C.fur);
                R(20,23,7,2,C.furHi);
                R(11,27,5,8,C.ink);R(32,27,5,8,C.ink);
                R(12,28,3,6,C.pink);R(33,28,3,6,C.pink);
                R(15,34+step,5,7,C.ink);R(28,34-step,5,7,C.ink);
                R(16,35+step,3,5,C.pink);R(29,35-step,3,5,C.pink);
                if(!back){
                    R(13,20,7,8,C.ink);R(14,21,5,6,C.pink);
                    R(28,20,7,8,C.ink);R(29,21,5,6,C.pink);
                    P([[16,26],[31,26],[33,31],[29,36],[26,39],[22,39],[17,35],[14,31]],C.ink);
                    P([[17,28],[30,28],[31,31],[27,35],[25,37],[23,37],[18,34],[16,31]],C.fur);
                    R(18,28,5,2,C.furHi);R(25,28,5,2,C.furHi);
                    R(18,32,2,2,C.ink);R(28,32,2,2,C.ink);
                    R(22,36,4,3,C.pinkHi);R(22,35,4,1,C.ink);
                    R(22,39,4,1,C.furLo);
                }
            }
        }

        function spider(){
            flip();
            const legs=side ? [
                [[21,27],[13,21],[5,25],[2,36]], [[23,29],[15,27],[6,33],[5,42]],
                [[28,29],[37,22],[44,28],[46,39]], [[28,32],[37,31],[43,37],[43,44]]
            ] : [
                [[17,27],[11,20],[5,24],[3,37]], [[18,29],[10,27],[3,34],[2,43]],
                [[18,31],[9,33],[5,40],[6,45]], [[20,32],[13,37],[11,43],[13,46]]
            ];
            function joint(points,c){
                for(let i=0;i<points.length-1;i++){
                    const a=points[i],b=points[i+1];
                    const n=Math.max(Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1]));
                    for(let j=0;j<=n;j++){
                        const x=Math.round(a[0]+(b[0]-a[0])*j/n),y=Math.round(a[1]+(b[1]-a[1])*j/n);
                        R(x-1,y,3,2,C.ink);R(x,y,1,1,c);
                    }
                }
            }
            for(let i=0;i<4;i++){
                const p=legs[i].map(([x,y],k)=>[x,y+(k===2 ? step : k===3 ? (i%2?step:-step):0)]);
                joint(p,C.purpleLo);
                if(!side) joint(p.map(([x,y])=>[48-x,y]),C.purpleHi);
                else joint(p.map(([x,y])=>[x+2,y+2]),C.purpleHi);
            }
            if(side){
                R(12,19,18,17,C.ink);R(14,20,15,14,C.purple);
                R(16,20,10,3,C.purpleHi);R(26,26,13,12,C.ink);
                R(28,27,10,9,C.purpleLo);R(32,28,4,2,C.purpleHi);
                R(36,30,2,2,C.amber);R(39,34,3,5,C.boneHi);
            }else{
                const abdomenY=back?26:17, headY=back?16:28;
                R(14,abdomenY,20,18,C.ink);R(16,abdomenY+1,16,15,C.purple);
                R(18,abdomenY+2,11,3,C.purpleHi);R(21,abdomenY+6,5,2,C.purpleLo);
                R(18,headY,12,11,C.ink);R(19,headY+1,10,9,C.purpleLo);
                if(!back){
                    R(20,31,2,2,C.amber);R(26,31,2,2,C.amber);
                    R(18,36,3,5,C.boneHi);R(27,36,3,5,C.boneHi);
                    R(21,39,2,4,C.bone);R(25,39,2,4,C.bone);
                }else{R(22,18,4,2,C.purpleHi);}
            }
        }

        function wolf(){
            flip();
            if(side){
                // Lean four-legged silhouette, with a bushy tail and pointed muzzle.
                P([[14,25],[8,25],[3,20],[2,13],[6,17],[11,19],[17,22]],C.ink);
                P([[12,24],[7,22],[4,18],[5,20],[11,21],[15,23]],C.wolfHi);
                for(const [x,dy]of [[15,-step],[32,step]]){P([[x,30],[x+5,31],[x+3,38+dy],[x+7,42+dy],[x+7,44+dy],[x,44+dy],[x-1,37+dy]],C.ink);R(x+1,34+dy,2,8,C.wolfLo);}
                P([[9,26],[12,21],[21,19],[30,20],[35,24],[36,31],[30,35],[20,33],[13,36],[9,33]],C.ink);
                P([[11,26],[15,22],[23,21],[30,22],[33,25],[34,30],[29,33],[20,31],[13,33],[11,31]],C.wolf);
                P([[15,23],[23,21],[29,23],[28,25],[20,24],[16,27],[12,28]],C.wolfHi);
                P([[23,30],[29,28],[32,24],[37,25],[38,31],[34,36],[30,35]],C.wolfLo);
                P([[30,22],[32,13],[36,18],[40,14],[42,22],[41,27],[46,29],[48,32],[43,35],[38,32],[33,33],[30,29]],C.ink);
                P([[32,23],[33,17],[36,21],[39,18],[40,24],[39,28],[45,30],[45,32],[41,33],[37,30],[33,31]],C.wolf);
                P([[33,25],[37,24],[40,27],[39,29],[44,30],[44,32],[39,31],[35,29],[33,30]],C.cream);
                R(38,25,2,1,C.amber);R(45,30,3,2,C.ink);R(41,33,3,1,C.boneHi);
                for(const [x,dy]of [[11,step],[31,-step]]){P([[x,31],[x+6,31],[x+4,38+dy],[x+5,42+dy],[x+8,43+dy],[x+8,45+dy],[x,45+dy],[x,37+dy]],C.ink);P([[x+1,33],[x+4,33],[x+2,38+dy],[x+3,43+dy],[x+6,44+dy],[x+1,44+dy]],C.wolfHi);}
            }else{
                P([[22,22],[20,17],[21,12],[25,8],[25,13],[28,17],[27,23]],C.ink);
                P([[23,20],[22,16],[24,12],[24,15],[26,18],[25,22]],C.wolfHi);
                // Rear paws sit farther up the tile than the forepaws.
                for(const [x,dy]of [[13,-step],[30,step]]){R(x,24+dy,5,12,C.ink);R(x+1,26+dy,3,8,C.wolfLo);R(x-1,35+dy,6,2,C.wolfHi);}
                P([[18,17],[29,17],[34,23],[34,30],[29,35],[18,35],[13,30],[13,23]],C.ink);
                P([[19,19],[28,19],[32,24],[32,29],[28,33],[19,33],[15,29],[15,24]],C.wolfLo);
                P([[20,20],[27,20],[30,24],[29,29],[19,30],[17,25]],C.wolf);
                R(21,21,5,2,C.wolfHi);
                for(const [x,dy]of [[15,step],[28,-step]]){P([[x,30],[x+5,30],[x+4,39+dy],[x+5,44+dy],[x-2,44+dy],[x-2,42+dy],[x,39+dy]],C.ink);R(x+1,32+dy,2,10,C.wolfHi);R(x-1,43+dy,5,1,C.cream);}
                if(back){
                    P([[16,20],[17,11],[22,16],[27,16],[31,11],[32,20],[30,26],[18,26]],C.ink);
                    P([[18,21],[18,16],[22,19],[27,19],[30,16],[30,21],[28,25],[20,25]],C.wolf);
                    P([[20,31],[25,31],[29,37],[27,43],[23,46],[24,40],[21,36]],C.ink);
                    P([[22,33],[24,33],[27,38],[25,43],[25,39],[23,36]],C.wolfHi);
                }else{
                    P([[14,25],[15,15],[21,21],[27,21],[33,15],[34,25],[32,30],[28,33],[26,39],[22,39],[19,33],[15,30]],C.ink);
                    P([[16,25],[17,19],[21,24],[27,24],[31,19],[32,25],[30,29],[26,32],[25,37],[23,37],[21,32],[17,29]],C.wolf);
                    P([[18,28],[21,29],[24,26],[27,29],[30,28],[27,33],[25,37],[23,37],[21,33]],C.cream);
                    R(18,27,2,1,C.amber);R(28,27,2,1,C.amber);R(22,35,4,2,C.ink);
                    if(attack){R(21,37,6,3,C.ink);R(21,37,2,1,C.boneHi);R(25,37,2,1,C.boneHi);}
                }
            }
        }

        function axe(x,y,lift,big){
            const yy=y-lift;
            R(x,yy,3,26,C.ink);R(x+1,yy+1,1,24,C.hideHi);
            R(x-7,yy-2,big?15:13,9,C.ink);
            R(x-6,yy-1,big?13:11,7,C.ironLo);
            R(x-6,yy,5,5,C.ironHi);R(x+2,yy,4,5,C.iron);
            R(x-8,yy+3,2,4,C.ironHi);R(x+5,yy+5,2,3,C.ironLo);
            if(big){R(x-4,yy+1,6,2,C.gold);R(x-2,yy+4,3,2,C.goldHi);}
        }

        function orc(){
            flip();
            const skin=boss?'#71804a':C.green, light=boss?'#aeb67a':C.greenHi;
            const armor=boss?'#6f3542':C.hide, armorHi=boss?'#a36161':C.hideHi;
            const widen=boss?2:0, armLift=attack?attack*4:0;
            if(side){
                R(18-widen,34,9,11,C.ink);R(19-widen,35,7,9,C.greenLo);
                R(27,34-step,9,11,C.ink);R(28,35-step,7,9,skin);
                R(17-widen,43,11,3,C.ink);R(27,43-step,12,3,C.ink);
                R(18-widen,42,9,3,armor);R(28,42-step,9,3,armor);
                R(14-widen,20,22+widen,17,C.ink);R(15-widen,21,20+widen,15,skin);
                R(17,21,16,13,armor);R(18,22,12,3,armorHi);
                R(20,30,14,3,C.hideLo);R(29,31,3,2,C.gold);
                R(32,21-armLift,9,16,C.ink);R(33,22-armLift,7,14,skin);
                R(33,28-armLift,7,4,armor);R(35,30-armLift,4,2,light);
                R(20,10,17,13,C.ink);R(21,11,15,11,skin);
                R(23,10,11,3,light);R(32,15,8,6,C.ink);R(33,16,7,4,skin);
                R(36,19,6,3,C.greenLo);R(37,21,4,3,C.boneHi);
                if(!back){R(33,16,2,2,C.ink);R(34,16,1,1,C.amber);}
                R(22,13,3,7,C.greenLo);
                if(boss){R(21,8,13,3,C.ink);R(23,7,9,2,C.iron);R(24,8,5,1,C.goldHi);
                    R(17,20,6,6,C.ink);R(18,21,5,4,C.ironLo);}
                axe(43,12,armLift,boss);
            }else{
                const lx=12-widen, rx=29+widen;
                R(lx+3,34+step,8,11,C.ink);R(lx+4,35+step,6,9,skin);
                R(rx-2,34-step,8,11,C.ink);R(rx-1,35-step,6,9,skin);
                R(lx+1,43+step,12,3,C.ink);R(rx-4,43-step,12,3,C.ink);
                R(lx+2,41+step,10,3,armor);R(rx-3,41-step,10,3,armor);
                R(10-widen,21,9,16,C.ink);R(11-widen,22,7,13,skin);
                R(30+widen,21-armLift,9,16,C.ink);R(31+widen,22-armLift,7,13,skin);
                R(10-widen,29,8,5,armor);R(31+widen,29-armLift,8,5,armor);
                R(14-widen,19,20+widen*2,18,C.ink);
                R(15-widen,20,18+widen*2,16,armor);
                R(17,21,14,11,skin);R(19,21,10,3,light);
                R(17,30,14,5,C.hideLo);R(19,31,10,2,armorHi);
                R(17,34,14,3,C.hideLo);R(22,34,4,3,C.gold);
                R(18-widen,9,12+widen*2,13,C.ink);
                R(19-widen,10,10+widen*2,11,skin);
                R(20,11,8,3,light);
                if(back){
                    R(19,12,10,7,C.greenLo);R(21,13,6,5,skin);
                    R(17,21,14,11,armor);R(21,21,6,12,armorHi);
                    R(16,24,16,3,C.hideLo);
                }else{
                    R(20,14,3,2,C.ink);R(26,14,3,2,C.ink);
                    R(21,14,1,1,C.amber);R(27,14,1,1,C.amber);
                    R(20,18,9,2,C.greenLo);R(19,18,3,5,C.boneHi);
                    R(27,18,3,5,C.boneHi);R(21,21,7,2,C.greenLo);
                }
                if(boss){
                    R(16,7,16,4,C.ink);R(17,8,14,3,C.ironLo);
                    R(20,7,8,2,C.ironHi);R(23,9,2,2,C.goldHi);
                    R(13-widen,19,8,6,C.ink);R(14-widen,20,6,4,C.ironLo);
                    R(29+widen,19,8,6,C.ink);R(30+widen,20,6,4,C.ironLo);
                    R(17,28,14,2,C.gold);R(23,28,2,2,C.goldHi);
                }
                axe(41+widen,12,armLift,boss);
            }
        }

        function sword(x,y,lift){
            const yy=y-lift;
            R(x,yy,4,16,C.ink);R(x+1,yy+1,2,14,C.iron);
            R(x+1,yy+1,1,10,C.ironHi);
            R(x-2,yy+15,8,3,C.ink);R(x-1,yy+16,6,1,C.gold);
            R(x,yy+18,4,8,C.ink);R(x+1,yy+19,2,6,C.hide);
        }

        function skeleton(){
            flip();
            const lift=attack?attack*4:0;
            if(side){
                R(20,34+step,4,10,C.ink);R(21,34+step,2,9,C.bone);
                R(29,34-step,4,10,C.ink);R(30,34-step,2,9,C.bone);
                R(17,43+step,9,3,C.ink);R(18,44+step,7,1,C.boneHi);
                R(27,43-step,10,3,C.ink);R(28,44-step,8,1,C.boneHi);
                R(19,31,15,4,C.ink);R(20,32,13,2,C.boneLo);
                R(24,18,3,14,C.bone);R(26,20,3,12,C.boneLo);
                for(let y=21;y<=29;y+=4){R(20,y,13,2,C.ink);R(21,y,11,1,C.boneHi);}
                R(19,18,4,16,C.ink);R(20,19,2,14,C.bone);
                R(32,18-lift,4,17,C.ink);R(33,19-lift,2,15,C.bone);
                R(17,8,17,13,C.ink);R(18,9,16,11,C.bone);
                R(20,9,11,2,C.boneHi);R(31,12,7,6,C.ink);
                R(32,13,6,4,C.boneHi);R(27,13,3,4,C.ink);
                R(32,18,6,2,C.boneLo);R(36,18,2,2,C.boneHi);
                sword(38,6,lift);
            }else{
                for(const [x,dy] of [[17,step],[28,-step]]){
                    R(x,34+dy,4,10,C.ink);R(x+1,35+dy,2,8,C.bone);
                    R(x-2,43+dy,9,3,C.ink);R(x-1,44+dy,7,1,C.boneHi);
                }
                R(18,30,12,5,C.ink);R(19,31,10,3,C.boneLo);
                R(13,18,5,17,C.ink);R(14,19,3,15,C.bone);
                R(30,18-lift,5,17,C.ink);R(31,19-lift,3,15,C.bone);
                R(16,18,16,15,C.ink);R(17,19,14,13,C.boneLo);
                R(22,20,4,13,C.boneHi);
                for(let y=21;y<=29;y+=4){
                    R(18,y,12,2,C.boneHi);R(19,y+2,3,2,C.bone);
                    R(26,y+2,3,2,C.bone);
                }
                R(17,7,14,14,C.ink);R(18,8,12,12,C.bone);
                R(20,8,8,3,C.boneHi);
                if(back){
                    R(22,11,4,5,C.boneLo);R(19,17,10,2,C.boneHi);
                    R(19,20,10,2,C.bone);R(21,23,6,2,C.bone);
                }else{
                    R(19,13,3,4,C.ink);R(26,13,3,4,C.ink);
                    R(22,16,4,3,C.ink);R(19,19,10,2,C.ink);
                    R(20,19,2,2,C.boneHi);R(24,19,2,2,C.boneHi);
                }
                sword(38,6,lift);
            }
            R(15,32,16,2,C.hide);R(18,34,6,3,C.hideLo);
        }

        function drake(){
            flip();
            const body=boss?'#9d3d2c':C.red, hi=boss?'#d87942':C.redHi;
            const low=boss?'#622d2a':C.redLo;
            const wing=boss?'#6b292f':'#6c302e';
            const twitch=idle?1:0, fan=attack?attack*2:0;
            if(side){
                // Barbed tail, four planted legs, folded sail wing, long low head.
                P([[18,27],[10,28],[5,25],[3,18],[0,22],[1,29],[6,34],[16,35]],C.ink);
                P([[17,29],[9,30],[4,27],[2,23],[3,29],[7,32],[16,33]],body);
                for(const [x,y] of [[6,23],[12,24],[17,25]]){
                    R(x,y,4,5,C.ink);R(x+1,y+1,2,3,boss?C.gold:hi);
                }
                P([[14,26],[18,20],[27,19],[34,24],[38,30],[34,36],[20,37],[14,33]],C.ink);
                P([[16,27],[20,22],[27,21],[33,26],[35,30],[32,34],[20,35],[16,32]],body);
                P([[20,24],[27,23],[31,26],[28,28],[20,27]],hi);
                P([[20,32],[28,30],[33,30],[32,34],[21,35]],low);
                for(const [x,dy] of [[17,step],[25,-step],[31,step],[38,-step]]){
                    R(x,33+dy,6,10,C.ink);R(x+1,34+dy,4,8,low);
                    R(x,41+dy,8,3,C.ink);R(x+1,42+dy,6,1,hi);
                    R(x+5,42+dy,3,2,C.boneHi);
                }
                const peak=7-twitch-fan;
                P([[28,30],[22,24],[12,25],[8,29],[10,18],[17,peak],[23,peak+1],[29,17]],C.ink);
                P([[26,28],[21,22],[14,23],[11,25],[13,18],[18,peak+3],[22,peak+3],[27,18]],wing);
                P([[17,peak+1],[21,peak+1],[26,18],[28,28],[25,24],[22,16]],hi);
                P([[16,peak+6],[14,21],[12,24],[14,15]],body);
                P([[31,31],[31,23],[35,16],[42,16],[46,23],[45,27],[50,29],[50,34],[40,35],[35,32]],C.ink);
                P([[33,29],[34,23],[37,18],[41,18],[44,23],[43,28],[48,30],[48,32],[41,33],[37,30]],body);
                P([[34,22],[31,14],[34,11],[34,16],[39,19]],C.ink);
                P([[35,20],[33,15],[34,13],[35,17],[38,19]],boss?C.goldHi:C.bone);
                P([[40,18],[41,10],[44,8],[43,14],[43,20]],C.ink);
                P([[41,18],[42,12],[43,10],[42,17]],C.boneHi);
                R(40,23,3,2,C.amber);R(42,22,2,1,low);R(43,30,5,1,hi);
                R(44,33,2,2,C.boneHi);R(48,30,2,2,C.ink);
                if(attack){R(43,33,7,3,C.ink);R(44,33,2,1,C.boneHi);R(47,35,2,1,C.boneHi);}
                if(boss){R(34,27,2,4,C.gold);R(35,28,2,1,C.goldHi);R(19,29,2,2,C.gold);R(22,30,3,1,C.gold);R(20,14-fan,2,3,C.gold);}
            }else{
                // Wings frame the trunk, with a separate neck and four feet.
                if(!back){P([[20,21],[19,14],[22,8],[27,7],[30,3],[30,10],[26,14],[26,21]],C.ink);P([[22,20],[21,15],[23,11],[28,9],[25,14],[24,21]],body);}
                // Four paws: the rear pair is smaller and higher in the overhead view.
                for(const [x,dy]of [[12,-step],[30,step]]){R(x,26+dy,6,12,C.ink);R(x+1,28+dy,4,8,low);R(x,37+dy,7,2,C.bone);}
                for(const mirror of [false,true]){
                    const points=p=>p.map(([x,y])=>[mirror?48-x:x,y]);
                    const peak=10-twitch-fan;
                    P(points([[20,30],[13,32],[8,28],[3,32],[4,21],[8,peak],[13,peak+3],[19,22]]),C.ink);
                    P(points([[18,28],[13,29],[8,26],[5,28],[6,21],[9,peak+3],[12,peak+5],[17,23]]),wing);
                    P(points([[8,peak+1],[10,peak+2],[13,21],[18,29],[15,28],[10,22]]),hi);
                    P(points([[7,20],[8,16],[8,25],[5,28]]),body);
                }
                P([[20,17],[28,17],[32,23],[32,32],[28,37],[20,37],[16,32],[16,23]],C.ink);
                P([[21,19],[27,19],[30,24],[30,31],[27,35],[21,35],[18,31],[18,24]],body);
                P([[23,21],[26,21],[28,26],[27,32],[23,33],[21,28]],hi);
                for(const [x,dy] of [[13,step],[29,-step]]){
                    R(x,31+dy,7,12,C.ink);R(x+1,32+dy,5,10,low);
                    R(x-1,41+dy,9,3,C.ink);R(x,42+dy,7,1,hi);
                    R(x+1,43+dy,2,2,C.boneHi);R(x+5,43+dy,2,2,C.boneHi);
                }
                if(back){
                    P([[19,19],[17,12],[19,7],[22,12],[26,12],[29,7],[31,12],[29,20],[26,23],[22,23]],C.ink);
                    P([[20,18],[19,13],[21,14],[27,14],[29,12],[28,18],[25,21],[23,21]],body);
                    R(19,10,2,4,C.bone);R(28,10,2,4,C.bone);
                    P([[21,31],[26,31],[29,37],[29,43],[26,48],[23,49],[25,43],[24,39],[21,37]],C.ink);
                    P([[23,33],[25,33],[27,38],[27,43],[25,46],[26,42],[24,37]],body);
                    R(23,23,2,2,boss?C.gold:low);R(23,27,2,2,boss?C.gold:low);
                }else{
                    P([[18,23],[16,15],[18,11],[21,20],[27,20],[30,11],[32,15],[30,23],[33,27],[30,33],[28,38],[20,38],[18,33],[15,27]],C.ink);
                    P([[19,22],[18,16],[20,22],[28,22],[30,16],[29,23],[31,27],[28,32],[27,36],[21,36],[20,32],[17,27]],body);
                    P([[18,13],[20,20],[20,23],[18,20]],boss?C.goldHi:C.bone);
                    P([[30,13],[30,20],[28,23],[28,20]],boss?C.goldHi:C.bone);
                    R(18,27,3,2,C.amber);R(27,27,3,2,C.amber);R(22,25,4,3,hi);
                    P([[21,31],[27,31],[28,35],[26,38],[22,38],[20,35]],low);
                    R(21,34,6,2,C.ink);R(21,35,2,2,C.boneHi);R(25,35,2,2,C.boneHi);
                    if(attack){R(20,34,8,4,C.ink);R(21,34,2,2,C.boneHi);R(25,34,2,2,C.boneHi);R(22,38,4,1,hi);}
                }
                if(boss){R(10,19-twitch-fan,2,3,C.gold);R(12,22-twitch-fan,2,2,C.goldHi);R(36,19-twitch-fan,2,3,C.gold);R(34,22-twitch-fan,2,2,C.goldHi);}
            }
        }

        switch(type){
            case 'RAT':rat();break;
            case 'SPIDER':spider();break;
            case 'WOLF':wolf();break;
            case 'ORC':case 'ORC_LIDER':orc();break;
            case 'SKELETON':skeleton();break;
            case 'DRAKE':case 'DRAKE_LIDER':drake();break;
        }
    }

    function drawBody(ctx,m,px,py,opts={}){
        if(!m||!TYPES.has(m.type)||!ctx||!Number.isFinite(px)||!Number.isFinite(py)) return false;
        const type=m.type;
        const dir=['down','up','left','right'].includes(m.dir)?m.dir:'down';
        const w=Number(opts.walkPhase)||0;
        const walk=w>.3?1:w<-.3?-1:0;
        const a=Number(opts.attackPhase)||0;
        const attack=a>.5?2:a>.05?1:0;
        const idle=(type==='DRAKE'||type==='DRAKE_LIDER'||extraPainters.get(type)?.idle)&&Number.isFinite(opts.timeMs)&&Math.floor(opts.timeMs/600)%2!==0?1:0;
        const scale=Math.max(.55,Math.min(1.7,Number(m.size)||SIZE[type]));
        const key=[type,dir,walk,attack,idle].join(':');
        let sprite=cache.get(key);
        if(!sprite&&typeof document!=='undefined'&&document.createElement){
            sprite=document.createElement('canvas');
            sprite.width=64;sprite.height=64;
            const g=sprite.getContext('2d');
            if(g){g.translate(8,8);paint(g,type,dir,walk,attack,idle);
                // Only finite direction/pose combinations enter this cache, never entity IDs or time.
                cache.set(key,sprite);
            }else sprite=null;
        }
        ctx.save();
        ctx.imageSmoothingEnabled=false;
        if(sprite){
            const x=Math.round(px+24-32*scale),y=Math.round(py+42-50*scale);
            const s=Math.round(64*scale);
            ctx.drawImage(sprite,x,y,s,s);
        }else{
            ctx.translate(Math.round(px+24-24*scale),Math.round(py+42-42*scale));
            ctx.scale(scale,scale);
            paint(ctx,type,dir,walk,attack,idle);
        }
        ctx.restore();
        return true;
    }

    window.ValadaresMonsterArt2D=Object.freeze({drawBody,registerTypes});
})();
