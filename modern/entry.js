import {createRenderer} from './renderer.js';
const status={state:'loading',message:'Preparando o mundo',startedAt:performance.now()};window.ValadaresModern=status;
function showRecovery(message){
 status.state='error';status.message=message;
 if(document.getElementById('modernRenderError'))return;
 const notice=document.createElement('div');notice.id='modernRenderError';notice.setAttribute('role','alert');notice.style.cssText='position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:99999;background:#291f19;border:1px solid #be9754;color:#f6e5c3;padding:12px 18px;border-radius:8px;font:14px system-ui;max-width:85vw';
 notice.textContent='O visual 3D encontrou um problema. Você pode continuar no visual clássico; seu progresso está preservado. ';
 const dismiss=document.createElement('button');dismiss.textContent='Entendi';dismiss.onclick=()=>notice.remove();notice.append(dismiss);document.body.append(notice);
}
document.addEventListener('valadares:modern-error',event=>showRecovery(event.detail?.message||'Falha visual'));
try{
 const bridge=window.ValadaresModernBridge;if(!bridge)throw new Error('Ponte do jogo indisponível');
 const renderer=await createRenderer(bridge);Object.assign(status,{state:'ready',message:'Mundo preparado',renderer,diagnostics:renderer.diagnostics});
 document.dispatchEvent(new CustomEvent('valadares:modern-ready'));
}catch(error){status.state='error';status.message=String(error?.message||error);console.error('[Valadares moderno] Falha ao preparar mundo',error);
 showRecovery(status.message);
 document.dispatchEvent(new CustomEvent('valadares:modern-error',{detail:{message:status.message}}));
}
