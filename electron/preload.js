// Preload bridge — runs no contexto isolado entre main e renderer.
// Expõe `window.electronApi` no client com APIs de acessibilidade (zoom,
// fullscreen). Client detecta presença via `typeof window.electronApi`.
// Quando rodando no browser (Vercel), window.electronApi é undefined → fallback.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronApi', {
    // Zoom in/out/reset. Retorna novo zoomLevel (Electron unit: 0=100%, 0.5≈+10%, etc.)
    setZoom: (delta) => ipcRenderer.invoke('app:setZoom', delta),
    // Toggle fullscreen. Retorna boolean do novo estado.
    toggleFullscreen: () => ipcRenderer.invoke('app:toggleFullscreen'),
    // Pega zoom atual (pra preencher UI).
    getZoom: () => ipcRenderer.invoke('app:getZoom'),
    // Indica que é o desktop oficial (cliente pode mostrar funcionalidades exclusivas).
    isDesktop: true,
});
