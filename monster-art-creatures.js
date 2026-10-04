// Oito silhuetas adicionais. Coordenadas locais: grade 48x48, pes em y=42.
(function(){
    'use strict';
    const art=window.ValadaresMonsterArt2D;
    if(!art||typeof art.registerTypes!=='function') return;
    art.registerTypes({
        SNAKE:{size:.8}, BAT:{size:.65,idle:true}, MINOTAUR:{size:1.25},
        TROLL:{size:1.15}, LIZARD:{size:.9}, SCORPION:{size:.85},
        GOLEM:{size:1.2}, GOLEM_REI:{size:1.55}
    },function(g,o){
        const {type,back,side,step,attack,idle,R,P,H,V,flip}=o;
        const q={
            ink:'#181311', edge:'#2b211d', ivory:'#e6dcc0', bone:'#c9bea4',
            ochre:'#d5a65e', ochreLo:'#8f633a', eye:'#e5b760',
            snake:'#617b49', snakeHi:'#a2ad6d', snakeLo:'#394e39', belly:'#c5b78c',
            bat:'#493541', batHi:'#806178', batLo:'#2a2331', membrane:'#644555',
            bull:'#80513b', bullHi:'#b88359', bullLo:'#49342d', muzzle:'#b58a6a',
            hide:'#6a4c36', hideHi:'#a47750', hideLo:'#3d3027',
            troll:'#657448', trollHi:'#9da573', trollLo:'#3c5037',
            lizard:'#718454', lizardHi:'#b0b57a', lizardLo:'#3f573b',
            scorp:'#765443', scorpHi:'#bd8460', scorpLo:'#45352e',
            stone:'#71808a', stoneHi:'#b3b9b2', stoneLo:'#45515d',
            crystal:'#709998', crystalHi:'#b0d1bf', crystalLo:'#405f67',
            amber:'#d09a52', amberHi:'#f1c779', iron:'#7c8585', ironHi:'#c1c1b5'
        };
        // Rectangles for fine marks; stepped polygons carry the silhouettes.
        const line=(x1,y1,x2,y2,w,c)=>{
            const n=Math.max(Math.abs(x2-x1),Math.abs(y2-y1),1);
            for(let i=0;i<=n;i++) R(Math.round(x1+(x2-x1)*i/n-w/2),Math.round(y1+(y2-y1)*i/n-w/2),w,w,c);
        };
        const path=(pts,w,c)=>{for(let i=1;i<pts.length;i++)line(...pts[i-1],...pts[i],w,c);};
        const sl=(pts,c)=>P(pts,c);
        const nudge=attack?(side?attack*2:back?-attack*2:attack*2):0;

        function snake(){
            flip();
            if(attack&&back) g.translate(0,-attack*2);
            if(side){
                // The body doubles back, making a readable S rather than a straight worm.
                const body=[[3,35],[9,34],[13,29+step],[18,27+step],[22,31],[20,36],[24,39],[31,37],[33,31-step],[37,27],[43+nudge,26]];
                path(body,10,q.ink);path(body,7,q.snakeLo);
                path([[4,34],[11,32],[17,29],[22,33],[21,36],[27,37],[32,34],[37,28],[43+nudge,27]],4,q.snake);
                path([[5,32],[11,30],[17,27],[22,31]],2,q.snakeHi);
                path([[23,39],[30,37],[35,31],[41+nudge,29]],2,q.belly);
                sl([[34+nudge,24],[39+nudge,18],[45+nudge,18],[49+nudge,22],[48+nudge,29],[43+nudge,32],[37+nudge,30]],q.ink);
                sl([[37+nudge,24],[40+nudge,20],[45+nudge,20],[47+nudge,23],[46+nudge,29],[41+nudge,30],[38+nudge,28]],q.snake);
                R(43+nudge,21,2,2,q.eye);R(44+nudge,21,1,1,q.ink);
                R(46+nudge,27,3,1,q.ink);
                if(attack){sl([[42+nudge,29],[49+nudge,30],[46+nudge,35],[40+nudge,32]],q.ink);R(44+nudge,31,2,2,q.ivory);}
            }else{
                const headY=back?15:31, coilY=back?30:25;
                path([[11,35],[8,30+step],[12,24],[21,22],[31,26-step],[33,33],[25,37],[18,34],[20,28],[26,28]],10,q.ink);
                path([[11,35],[9,30+step],[13,25],[22,24],[30,27-step],[31,32],[25,35],[19,33],[21,29],[26,29]],7,q.snakeLo);
                path([[11,33],[13,26],[22,25],[30,28],[29,33],[23,33]],4,q.snake);
                path([[13,26],[21,24],[30,26]],2,q.snakeHi);
                path([[20,coilY],[19,headY+7],[23,headY]],7,q.ink);
                path([[20,coilY],[21,headY+7],[23,headY+2]],4,q.snake);
                if(back){
                    sl([[17,15],[20,10],[28,10],[31,15],[28,20],[20,20]],q.ink);
                    sl([[19,14],[21,12],[27,12],[29,15],[27,18],[21,18]],q.snake);
                    R(20,13,2,2,q.snakeHi);R(26,13,2,2,q.snakeHi);
                }else{
                    sl([[17,30+nudge],[20,26+nudge],[28,26+nudge],[31,30+nudge],[29,36+nudge],[19,36+nudge]],q.ink);
                    sl([[19,29+nudge],[21,27+nudge],[27,27+nudge],[29,30+nudge],[27,34+nudge],[21,34+nudge]],q.snake);
                    R(20,30+nudge,2,2,q.eye);R(26,30+nudge,2,2,q.eye);
                    R(22,34+nudge,4,2,q.belly);
                    if(attack){R(20,36+nudge,8,3,q.ink);R(21,36+nudge,2,2,q.ivory);R(26,36+nudge,2,2,q.ivory);}
                }
            }
        }

        function bat(){
            flip();
            const flap=idle?4:step, dive=attack?attack*3:0;
            g.translate(0,dive);
            if(side){
                sl([[21,22],[10,15-flap],[4,6-flap],[5,23],[2,31],[11,26],[18,30],[26,30]],q.ink);
                sl([[20,23],[11,18-flap],[6,10-flap],[7,23],[5,28],[11,24],[18,27]],q.membrane);
                path([[6,11-flap],[12,22],[19,26]],2,q.batHi);
                sl([[22,24],[31,17+flap],[43,14+flap],[38,24],[46,30],[32,32]],q.ink);
                sl([[26,24],[32,19+flap],[40,17+flap],[37,24],[43,28],[33,30]],q.batLo);
                sl([[17,18],[19,11],[23,16],[28,10],[29,21],[33,24],[29,34],[22,37],[17,31]],q.ink);
                sl([[19,21],[20,15],[23,19],[27,15],[27,23],[31,26],[28,33],[23,35],[19,30]],q.bat);
                R(27,23,2,2,q.eye);R(28,23,1,1,q.ink);
                R(30,29,3,2,q.ivory);R(24,36,2,4,q.ink);
            }else{
                const peak=idle?12:5+step, low=idle?39:32-step;
                for(const mirror of [false,true]){
                    const p=a=>a.map(([x,y])=>[mirror?48-x:x,y]);
                    sl(p([[21,22],[15,18],[10,peak],[5,peak-2],[7,21],[2,low],[10,low-5],[15,low],[21,29]]),q.ink);
                    sl(p([[20,23],[14,20],[10,peak+3],[7,peak+1],[9,21],[5,low-3],[10,low-8],[15,low-3],[20,28]]),q.membrane);
                    sl(p([[12,peak+2],[15,20],[19,25],[18,29],[14,24]]),q.batHi);
                    path(p([[8,peak+1],[12,20],[18,27]]),1,q.batLo);
                }
                sl([[17,20],[20,17],[20,9],[24,14],[28,9],[28,17],[31,20],[31,33],[27,37],[21,37],[17,33]],q.ink);
                sl([[19,21],[22,17],[22,14],[24,17],[26,14],[26,18],[29,21],[29,32],[26,35],[22,35],[19,32]],q.bat);
                sl([[21,22],[24,19],[27,22],[27,30],[24,33],[21,30]],back?q.batLo:q.batHi);
                if(back){R(22,20,4,8,q.batLo);R(20,25,2,6,q.batHi);R(26,25,2,6,q.batHi);}
                else {R(20,24,3,2,q.eye);R(26,24,3,2,q.eye);R(21,31,6,2,q.ink);R(22,32,1,3,q.ivory);R(25,32,1,3,q.ivory);}
                R(20,36,2,3,q.ink);R(26,36,2,3,q.ink);
            }
        }

        function minotaur(){
            flip();
            const lift=attack?attack*6:0;
            // Heavy split hooves, barrel chest, bull head and a broad iron axe.
            if(side){
                for(const [x,dy]of [[14,step],[29,-step]]){
                    sl([[x,32],[x+10,32],[x+9,41+dy],[x+12,44+dy],[x+11,47+dy],[x-1,47+dy],[x-2,44+dy]],q.ink);
                    R(x+1,34+dy,7,9,q.bullLo);R(x,43+dy,11,3,q.hideLo);V(x+5,44+dy,47+dy,q.ink);
                }
                sl([[14,19],[19,17],[33,18],[38,24],[34,35],[15,35],[11,29]],q.ink);
                sl([[16,21],[22,19],[32,20],[36,24],[32,33],[16,33],[13,28]],q.bull);
                sl([[17,22],[27,20],[34,23],[32,27],[20,26]],q.bullHi);
                sl([[19,29],[33,29],[32,34],[18,34]],q.hideLo);
                sl([[31,18-lift],[38,20-lift],[41,29-lift],[39,37-lift],[34,37-lift],[32,29-lift]],q.ink);
                sl([[33,20-lift],[37,21-lift],[39,30-lift],[37,35-lift],[35,34-lift]],q.bull);
                sl([[21,8],[28,6],[37,9],[41,15],[39,25],[32,28],[22,22]],q.ink);
                sl([[23,10],[29,8],[36,11],[39,16],[37,23],[31,26],[24,21]],q.bull);
                sl([[19,11],[15,6],[14,1],[17,4],[22,8]],q.ink);
                sl([[19,10],[16,6],[15,2],[18,6],[22,9]],q.ivory);
                sl([[35,10],[38,3],[41,2],[39,8],[39,12]],q.ink);
                sl([[36,10],[39,4],[40,3],[38,9]],q.ivory);
                sl([[35,20],[44,20],[46,25],[42,29],[34,28]],q.ink);
                sl([[36,21],[42,21],[44,25],[41,27],[35,26]],q.muzzle);
                R(35,16,3,2,q.ink);R(36,16,1,1,q.eye);R(43,24,2,2,q.bullLo);
                axe(45,8-lift,attack);
            }else{
                for(const [x,dy]of [[12,step],[28,-step]]){
                    sl([[x,31],[x+10,31],[x+10,43+dy],[x+12,45+dy],[x+12,47+dy],[x-1,47+dy],[x-1,44+dy]],q.ink);
                    R(x+1,34+dy,8,9,q.bullLo);R(x,44+dy,11,2,q.hideLo);V(x+5,44+dy,47+dy,q.ink);
                }
                sl([[7,18],[13,15],[35,15],[41,18],[42,31],[35,37],[13,37],[6,31]],q.ink);
                sl([[9,20],[15,17],[33,17],[39,20],[39,30],[34,34],[14,34],[9,30]],q.bull);
                sl([[14,19],[23,17],[34,19],[33,24],[24,27],[15,24]],back?q.bullLo:q.bullHi);
                R(14,31,20,5,q.hideLo);R(19,32,10,2,q.hideHi);R(22,32,4,3,q.ochre);
                sl([[8,22],[14,22],[15,37],[12,41],[7,38],[5,29]],q.ink);
                sl([[9,24],[13,24],[13,36],[10,39],[7,36]],q.bull);
                sl([[35,22-lift],[41,22-lift],[43,37-lift],[39,40-lift],[34,36-lift]],q.ink);
                sl([[36,24-lift],[40,24-lift],[41,35-lift],[38,38-lift],[35,35-lift]],q.bull);
                sl([[17,8],[20,4],[28,4],[31,8],[33,20],[29,25],[19,25],[15,20]],q.ink);
                sl([[18,10],[21,6],[27,6],[30,10],[31,19],[28,23],[20,23],[17,19]],q.bull);
                for(const mirror of [false,true]){
                    const p=a=>a.map(([x,y])=>[mirror?48-x:x,y]);
                    sl(p([[19,9],[14,7],[8,2],[7,-1],[11,1],[16,4],[20,5]]),q.ink);
                    sl(p([[18,8],[13,6],[8,1],[10,1],[16,5],[19,5]]),q.ivory);
                }
                if(back){R(20,9,8,8,q.bullLo);R(17,23,14,4,q.hide);R(23,18,2,10,q.hideHi);}
                else{sl([[17,17],[31,17],[32,22],[28,27],[20,27],[16,22]],q.ink);
                    sl([[19,18],[29,18],[30,22],[27,25],[21,25],[18,22]],q.muzzle);
                    R(19,13,3,2,q.ink);R(26,13,3,2,q.ink);R(20,13,1,1,q.eye);R(27,13,1,1,q.eye);
                    R(20,22,2,2,q.bullLo);R(26,22,2,2,q.bullLo);}
                axe(43,8-lift,attack);
            }
        }
        function axe(x,y,swing){
            const xx=swing?x-attack*3:x;
            R(xx,y,3,31,q.ink);R(xx+1,y+1,1,28,q.hideHi);
            sl([[xx-9,y+1],[xx-3,y-2],[xx+5,y-1],[xx+8,y+3],[xx+5,y+11],[xx-3,y+12],[xx-10,y+9]],q.ink);
            sl([[xx-8,y+2],[xx-3,y],[xx+5,y+1],[xx+6,y+4],[xx+4,y+9],[xx-3,y+10],[xx-8,y+8]],q.iron);
            sl([[xx-8,y+3],[xx-4,y+1],[xx-2,y+2],[xx-4,y+8],[xx-8,y+7]],q.ironHi);
        }

        function troll(){
            flip();
            const lift=attack?attack*7:0;
            if(side){
                for(const [x,dy]of [[15,step],[28,-step]]){
                    sl([[x,32],[x+8,31],[x+8,41+dy],[x+12,44+dy],[x+11,46+dy],[x-2,46+dy]],q.ink);
                    R(x+1,33+dy,6,10,q.trollLo);R(x-1,43+dy,11,2,q.trollHi);
                }
                sl([[8,19],[13,12],[23,13],[31,18],[36,25],[34,35],[12,36],[8,29]],q.ink);
                sl([[10,20],[15,15],[23,15],[29,20],[34,25],[32,33],[13,34],[10,28]],q.trollLo);
                sl([[12,19],[19,15],[25,18],[26,23],[18,24]],q.troll);
                sl([[15,19],[20,16],[23,18],[21,20]],q.trollHi);
                // A long arm reaches almost to the ground even at rest.
                sl([[30,22-lift],[37,21-lift],[41,28-lift],[42,38-lift],[38,42-lift],[33,38-lift]],q.ink);
                sl([[32,23-lift],[36,23-lift],[39,29-lift],[40,38-lift],[37,40-lift],[35,37-lift]],q.troll);
                sl([[23,15],[28,9],[38,9],[42,15],[40,25],[33,29],[26,25]],q.ink);
                sl([[25,16],[29,11],[37,11],[40,16],[38,23],[33,27],[27,23]],q.troll);
                sl([[35,21],[44,22],[43,27],[36,28]],q.ink);
                sl([[36,22],[42,23],[41,25],[36,26]],q.trollHi);
                R(36,16,3,2,q.ink);R(37,16,1,1,q.eye);R(39,26,2,3,q.ivory);
                club(45,4-lift);
            }else{
                for(const [x,dy]of [[14,step],[27,-step]]){
                    sl([[x,32],[x+8,32],[x+8,43+dy],[x+10,45+dy],[x+10,46+dy],[x-2,46+dy]],q.ink);
                    R(x+1,34+dy,6,9,q.trollLo);R(x-1,44+dy,10,2,q.trollHi);
                }
                sl([[9,20],[14,13],[21,11],[27,12],[35,17],[40,24],[37,35],[11,36],[7,29]],q.ink);
                sl([[11,21],[16,15],[21,13],[27,14],[34,19],[38,25],[35,33],[13,34],[9,28]],q.trollLo);
                sl([[14,19],[21,14],[28,16],[32,23],[28,28],[16,27]],q.troll);
                R(16,32,16,4,q.hideLo);R(21,33,5,2,q.hideHi);
                for(const mirror of [false,true]){
                    const p=a=>a.map(([x,y])=>[mirror?48-x:x,y]);
                    sl(p([[11,21],[17,22],[17,35],[15,41],[9,42],[6,37],[7,28]]),q.ink);
                    sl(p([[11,23],[15,24],[15,35],[13,39],[10,40],[8,36],[9,28]]),q.troll);
                    R(mirror?32:11,39,5,3,q.trollHi);
                }
                sl([[16,12],[18,6],[26,5],[33,10],[33,22],[28,26],[18,24],[14,19]],q.ink);
                sl([[18,12],[20,8],[26,7],[31,11],[31,21],[27,24],[19,22],[16,18]],q.troll);
                if(back){R(20,11,8,5,q.trollLo);R(21,18,7,4,q.trollHi);R(18,25,13,5,q.trollLo);}
                else{R(18,14,4,3,q.ink);R(26,14,4,3,q.ink);R(19,14,2,1,q.eye);R(27,14,2,1,q.eye);
                    sl([[19,21],[29,21],[28,26],[20,26]],q.ink);R(21,22,6,2,q.trollLo);
                    R(19,23,2,4,q.ivory);R(27,23,2,4,q.ivory);}
                club(43,4-lift);
            }
        }
        function club(x,y){
            R(x,y+10,3,31,q.ink);R(x+1,y+12,1,28,q.hideHi);
            sl([[x-4,y+1],[x+2,y-1],[x+7,y+3],[x+7,y+15],[x+3,y+20],[x-3,y+17],[x-6,y+11]],q.ink);
            sl([[x-3,y+3],[x+2,y+1],[x+5,y+4],[x+5,y+14],[x+2,y+18],[x-2,y+15],[x-4,y+11]],q.hide);
            R(x-2,y+5,3,3,q.hideHi);R(x+2,y+12,2,3,q.hideLo);
        }

        function lizard(){
            flip();
            if(side){
                sl([[17,30],[10,31],[5,28],[1,21],[2,29],[8,36],[17,36]],q.ink);
                sl([[16,31],[9,32],[4,27],[4,31],[9,34],[16,34]],q.lizard);
                for(const [x,dy]of [[13,step],[24,-step],[32,step],[39,-step]]){
                    sl([[x,30],[x+5,30],[x+4,37+dy],[x+7,41+dy],[x+6,43+dy],[x-1,43+dy],[x-2,40+dy]],q.ink);
                    R(x,32+dy,3,8,q.lizardLo);R(x-1,41+dy,6,1,q.lizardHi);
                }
                sl([[9,26],[14,21],[25,20],[35,23],[39,29],[34,35],[14,35],[8,31]],q.ink);
                sl([[11,27],[16,23],[25,22],[34,25],[36,30],[32,33],[14,33],[10,30]],q.lizard);
                sl([[16,24],[24,22],[32,24],[28,26],[17,27]],q.lizardHi);
                for(const [x,y]of [[15,21],[21,19],[27,20]]){sl([[x-2,y+4],[x,y-2],[x+3,y+3]],q.ink);R(x,y+1,2,3,q.lizardHi);}
                sl([[32,23],[36,18],[43,18],[47,22],[50+nudge,27],[47+nudge,34],[38,33],[33,30]],q.ink);
                sl([[35,23],[38,20],[43,20],[46,23],[48+nudge,27],[46+nudge,32],[39,31],[35,29]],q.lizard);
                R(42,23,3,2,q.ink);R(43,23,1,1,q.eye);
                R(42+nudge,32,7,2,q.belly);
                if(attack){sl([[41+nudge,31],[50+nudge,33],[47+nudge,38],[40+nudge,34]],q.ink);R(45+nudge,33,2,2,q.ivory);}
            }else{
                const hy=back?15:29;
                sl([[20,25],[17,18],[21,8],[26,7],[25,18],[28,26]],q.ink);
                sl([[21,24],[19,17],[22,10],[24,10],[23,20],[26,25]],q.lizard);
                for(const [x,dy]of [[10,-step],[32,step],[9,step],[33,-step]]){
                    const y=x===10||x===32?23:30;
                    sl([[x+3,y],[x+9,y+2],[x+5,y+8+dy],[x+3,y+11+dy],[x-1,y+11+dy],[x,y+8+dy]],q.ink);
                    R(x+2,y+3+dy,3,6,q.lizardLo);R(x-1,y+10+dy,6,1,q.lizardHi);
                }
                sl([[16,18],[21,16],[27,16],[32,20],[34,31],[29,36],[19,36],[14,31]],q.ink);
                sl([[18,20],[22,18],[27,18],[30,21],[32,30],[28,34],[20,34],[16,30]],q.lizard);
                sl([[21,19],[26,19],[29,23],[26,26],[20,24]],q.lizardHi);
                for(const [x,y]of [[23,14],[22,19],[24,23]]) R(x,y,3,2,q.lizardHi);
                sl([[17,hy-3+nudge],[20,hy-6+nudge],[28,hy-6+nudge],[31,hy-3+nudge],[32,hy+3+nudge],[28,hy+7+nudge],[20,hy+7+nudge],[16,hy+3+nudge]],q.ink);
                sl([[18,hy-3+nudge],[21,hy-4+nudge],[27,hy-4+nudge],[29,hy-2+nudge],[30,hy+3+nudge],[27,hy+5+nudge],[21,hy+5+nudge],[18,hy+3+nudge]],q.lizard);
                if(back){R(20,hy,8,3,q.lizardHi);R(23,hy+4,2,2,q.lizardLo);}
                else{R(19,hy,3,2,q.ink);R(26,hy,3,2,q.ink);R(20,hy,1,1,q.eye);R(27,hy,1,1,q.eye);
                    R(20,hy+5,8,1,q.belly);if(attack){R(19,hy+7+nudge,10,3,q.ink);R(20,hy+7+nudge,2,2,q.ivory);R(26,hy+7+nudge,2,2,q.ivory);}}
            }
        }

        function scorpion(){
            flip();
            const sx=attack?attack*2:0;
            if(side){
                for(let i=0;i<4;i++){
                    const x=13+i*6,dy=i%2?step:-step;
                    path([[x,28],[x-4,34],[x-6,40+dy]],3,q.ink);
                    path([[x,29],[x-4,35],[x-6,40+dy]],1,q.scorpHi);
                    path([[x+2,29],[x+5,34],[x+4,41-dy]],3,q.ink);
                    path([[x+2,30],[x+5,35],[x+4,41-dy]],1,q.scorpLo);
                }
                sl([[9,22],[15,18],[29,19],[38,24],[38,32],[28,36],[14,34],[9,30]],q.ink);
                sl([[11,23],[16,20],[28,21],[36,25],[36,30],[28,34],[15,32],[11,29]],q.scorp);
                for(let i=0;i<4;i++){R(15+i*5,21+(i%2),2,3,q.scorpHi);R(17+i*5,30,2,2,q.scorpLo);}
                // Tail arches over the shell; pointed sting drops toward the prey.
                path([[12,23],[6,19],[6,11],[11,6],[18,7],[22,12],[21,17]],8,q.ink);
                path([[12,22],[8,18],[8,12],[12,8],[17,9],[19,13]],5,q.scorpLo);
                for(const [x,y]of [[7,16],[9,10],[14,7],[19,11]]) R(x,y,3,2,q.scorpHi);
                sl([[18,16],[23,16],[25,21],[21,27],[19,22]],q.ink);
                sl([[20,18],[23,18],[23,21],[21,24]],q.ochre);
                pincer(sx);
                R(34,25,2,2,q.eye);
            }else{
                const sign=back?-1:1;
                for(let i=0;i<4;i++){
                    const y=22+i*4,dy=i%2?step:-step;
                    for(const mirror of [false,true]){
                        const s=mirror?-1:1,x=24+s*(9+i);
                        path([[24+s*7,y],[x+s*5,y+dy],[x+s*9,y+6+dy]],3,q.ink);
                        path([[24+s*7,y],[x+s*5,y+dy],[x+s*9,y+6+dy]],1,q.scorpHi);
                    }
                }
                sl([[17,18],[24,16],[31,18],[34,28],[30,36],[18,36],[14,28]],q.ink);
                sl([[19,20],[24,18],[29,20],[32,28],[29,34],[19,34],[16,28]],q.scorp);
                for(let y=22;y<=31;y+=4){R(18,y,12,2,y===22?q.scorpHi:q.scorpLo);R(20,y,8,1,q.scorpHi);}
                path([[24,21],[22,14],[18,10],[20,4],[26,3],[30,7],[29,13]],8,q.ink);
                path([[24,20],[23,13],[20,9],[22,6],[26,5],[28,8]],5,q.scorpLo);
                sl([[26,11],[31,11],[33,16],[28,22]],q.ink);
                sl([[28,13],[31,13],[31,16],[29,18]],q.ochre);
                const py=back?14:38;
                for(const mirror of [false,true]){
                    const s=mirror?-1:1;
                    path([[24+s*7,back?22:30],[24+s*13,py-sign*4],[24+s*(17+sx),py]],4,q.ink);
                    path([[24+s*7,back?22:30],[24+s*13,py-sign*4],[24+s*(17+sx),py]],2,q.scorpHi);
                    sl([[24+s*(17+sx),py-3],[24+s*(23+sx),py-5],[24+s*(22+sx),py+3],[24+s*(18+sx),py+4]],q.ink);
                    R(24+s*(19+sx)-1,py-1,3,3,q.scorp);
                }
                if(!back){R(19,29,2,2,q.eye);R(27,29,2,2,q.eye);}
            }
        }
        function pincer(sx){
            path([[36,25],[43+sx,21]],4,q.ink);
            sl([[41+sx,19],[48+sx,17],[51+sx,21],[47+sx,24],[44+sx,23]],q.ink);
            sl([[43+sx,20],[48+sx,19],[49+sx,21],[46+sx,23]],q.scorpHi);
            sl([[41+sx,25],[49+sx,27],[49+sx,31],[44+sx,30]],q.ink);
            sl([[43+sx,26],[47+sx,28],[46+sx,29],[43+sx,28]],q.scorpLo);
        }

        function golem(){
            flip();
            const king=type==='GOLEM_REI',lift=attack?attack*5:0;
            const rock=king?'#647e82':q.stone,light=king?'#9db7ad':q.stoneHi,deep=king?'#344d56':q.stoneLo;
            const crystal=(pts,hi)=>{sl(pts,q.ink);sl(pts.map(([x,y])=>[x+(x<24?1:-1),y+1]),hi?q.crystalHi:q.crystal);};
            if(side){
                for(const [x,dy]of [[12,step],[27,-step]]){
                    sl([[x,31],[x+11,30],[x+12,39+dy],[x+15,44+dy],[x+14,47+dy],[x-2,47+dy],[x-3,43+dy]],q.ink);
                    sl([[x+1,33],[x+9,32],[x+10,40+dy],[x+13,44+dy],[x+1,44+dy]],deep);
                    sl([[x+2,33],[x+8,33],[x+6,38],[x+2,39]],rock);
                    R(x,44+dy,11,2,light);
                }
                if(king){crystal([[10,23],[6,11],[11,6],[16,19]],true);crystal([[29,17],[34,4],[39,11],[38,24]],false);}
                sl([[9,19],[16,15],[31,16],[39,23],[37,33],[32,37],[12,36],[7,29]],q.ink);
                sl([[11,20],[17,17],[30,18],[36,24],[35,32],[31,35],[13,34],[9,28]],rock);
                sl([[13,20],[20,17],[28,19],[24,25],[14,27]],light);
                sl([[27,20],[35,24],[34,31],[28,33],[25,28]],deep);
                R(20,31,9,2,q.ink);R(23,29,2,6,king?q.crystalHi:q.amber);
                sl([[31,19-lift],[40,20-lift],[45,28-lift],[41,39-lift],[34,39-lift],[30,30-lift]],q.ink);
                sl([[33,21-lift],[39,22-lift],[42,28-lift],[39,36-lift],[35,36-lift],[32,28-lift]],rock);
                sl([[34,22-lift],[39,23-lift],[40,27-lift],[35,28-lift]],light);
                sl([[18,8],[25,5],[34,8],[38,13],[36,21],[30,25],[20,22],[16,16]],q.ink);
                sl([[20,9],[26,7],[33,10],[36,14],[34,19],[29,23],[21,20],[18,15]],rock);
                sl([[20,10],[26,7],[30,9],[27,14],[19,15]],light);
                sl([[29,14],[35,14],[33,21],[28,22]],deep);
                R(33,16,3,2,king?q.crystalHi:q.amberHi);
                if(king){crystal([[24,8],[25,0],[31,4],[31,10]],true);R(28,24,3,4,q.crystal);}
            }else{
                for(const [x,dy]of [[10,step],[28,-step]]){
                    sl([[x,31],[x+11,31],[x+13,42+dy],[x+15,46+dy],[x-2,46+dy],[x-3,43+dy]],q.ink);
                    sl([[x+2,33],[x+9,33],[x+11,43+dy],[x,43+dy]],deep);
                    sl([[x+2,34],[x+8,33],[x+7,39],[x+2,40]],rock);
                    R(x-1,44+dy,13,2,light);
                }
                if(king){crystal([[9,24],[3,12],[7,4],[13,13],[17,21]],true);crystal([[31,21],[36,5],[41,8],[44,22]],false);}
                sl([[9,16],[17,13],[31,13],[39,16],[42,25],[38,36],[10,36],[6,25]],q.ink);
                sl([[11,18],[18,15],[30,15],[37,18],[39,25],[36,33],[12,33],[9,25]],rock);
                sl([[12,18],[20,15],[29,16],[24,23],[14,24]],light);
                sl([[29,17],[37,19],[37,29],[31,33],[25,28]],deep);
                sl([[15,27],[24,24],[33,27],[30,34],[18,34]],back?deep:rock);
                if(king){R(22,25,4,5,q.crystalHi);R(20,29,8,2,q.crystalLo);R(15,22,2,3,q.crystal);R(31,22,2,3,q.crystal);}
                else {R(22,26,4,6,q.amber);R(23,27,2,4,q.amberHi);}
                for(const mirror of [false,true]){
                    const p=a=>a.map(([x,y])=>[mirror?48-x:x,y-lift*(mirror?1:0)]);
                    sl(p([[8,18],[15,19],[17,29],[14,39],[7,40],[3,34],[4,24]]),q.ink);
                    sl(p([[9,20],[14,21],[15,29],[13,36],[7,37],[5,33],[6,25]]),rock);
                    sl(p([[8,21],[13,22],[12,27],[6,27]]),light);
                    R(mirror?35:8,35-(mirror?lift:0),5,2,deep);
                }
                sl([[17,7],[21,4],[29,4],[33,8],[34,19],[30,23],[18,23],[14,19],[15,10]],q.ink);
                sl([[18,9],[22,6],[28,6],[31,9],[32,18],[29,21],[19,21],[16,18],[17,11]],rock);
                sl([[18,9],[22,6],[27,7],[27,12],[18,14]],light);
                sl([[27,12],[32,10],[31,18],[27,21]],deep);
                if(back){R(21,11,6,8,deep);R(22,12,4,3,light);R(18,22,12,3,q.ink);}
                else {R(18,15,5,3,q.ink);R(25,15,5,3,q.ink);R(19,16,3,1,king?q.crystalHi:q.amberHi);R(26,16,3,1,king?q.crystalHi:q.amberHi);
                    R(21,20,6,2,q.ink);}
                if(king){crystal([[20,6],[19,-2],[24,1],[26,7]],true);crystal([[26,7],[30,-2],[34,4],[32,10]],false);}
            }
        }

        switch(type){
            case 'SNAKE':snake();break;
            case 'BAT':bat();break;
            case 'MINOTAUR':minotaur();break;
            case 'TROLL':troll();break;
            case 'LIZARD':lizard();break;
            case 'SCORPION':scorpion();break;
            case 'GOLEM':case 'GOLEM_REI':golem();break;
        }
    });
})();
