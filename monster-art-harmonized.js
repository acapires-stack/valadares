// Author-rendered 2D sprites for the four remodeled monsters only.
// Load after monster-art.js, monster-art-creatures.js and monster-art-depths.js.
(function(){
    'use strict';
    const base=window.ValadaresMonsterArt2D;
    if(!base||base.harmonizedAtlasVersion===1)return;
    const modelByType=Object.freeze({
        MINOTAUR:'PlantWarrior',
        FORGE_SENTRY:'4GTN',
        FORGE_CONSTRUCT:'4GTN_Forgotten',
        FORGE_WARDEN:'4GTN'
    });
    const dirs=Object.freeze({down:0,up:1,left:2,right:3});
    const images={};
    for(const model of new Set(Object.values(modelByType))){
        const image=new Image();
        image.decoding='async';
        image.src='/modern/assets/atlases/harmonized-'+model+'.png';
        images[model]=image;
    }
    function drawBody(ctx,m,px,py,opts={}){
        const model=modelByType[m?.type];
        if(!model)return base.drawBody(ctx,m,px,py,opts);
        if(!ctx||!Number.isFinite(px)||!Number.isFinite(py))return false;
        const image=images[model];
        // Do not expose the old bovine MINOTAUR drawing while the new atlas loads.
        if(!image.complete||image.naturalWidth!==384||image.naturalHeight!==256)return true;
        const dir=Object.prototype.hasOwnProperty.call(dirs,m.dir)?dirs[m.dir]:0;
        const attack=Number(opts.attackPhase)||0;
        const walk=Number(opts.walkPhase)||0;
        let pose;
        if(attack>.5)pose=5;
        else if(attack>.05)pose=4;
        else if(walk>.3)pose=2;
        else if(walk<-.3)pose=3;
        else pose=Number.isFinite(opts.timeMs)&&Math.floor(opts.timeMs/600)%2?1:0;
        const scale=Math.max(.55,Math.min(1.7,Number(m.size)||1));
        const size=Math.round(64*scale);
        const x=Math.round(px+24-32*scale),y=Math.round(py+42-50*scale);
        ctx.save();
        ctx.imageSmoothingEnabled=false;
        ctx.drawImage(image,pose*64,dir*64,64,64,x,y,size,size);
        ctx.restore();
        return true;
    }
    window.ValadaresMonsterArt2D=Object.freeze({...base,drawBody,harmonizedAtlasVersion:1});
})();
