import {createRenderer} from './renderer.js';
const status={state:'loading',message:'Preparando o mundo',startedAt:performance.now()};window.ValadaresModern=status;
document.addEventListener('valadares:modern-error',event=>{status.state='error';status.message=event.detail?.message||'Falha visual';});
try{
 const bridge=window.ValadaresModernBridge;if(!bridge)throw new Error('Ponte do jogo indisponível');
 const renderer=await createRenderer(bridge);Object.assign(status,{state:'ready',message:'Mundo preparado',renderer,diagnostics:renderer.diagnostics});
 document.dispatchEvent(new CustomEvent('valadares:modern-ready'));
}catch(error){status.state='error';status.message=String(error?.message||error);console.error('[Valadares moderno] Falha ao preparar mundo',error);
 document.dispatchEvent(new CustomEvent('valadares:modern-error',{detail:{message:status.message}}));
}
