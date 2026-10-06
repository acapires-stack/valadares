// A separate public entry uses the existing account/world. Local previews keep 3D.
(() => {
    const choice = new URLSearchParams(location.search).get('visual');
    window.VALADARES_MODERN = choice !== 'classic' && (choice === '3d' ||
        location.pathname === '/jogar3d' || ['localhost', '127.0.0.1'].includes(location.hostname));
    if (!window.VALADARES_MODERN) return;
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = '/modern/ui.css?v=20261006';
    document.head.append(style);
})();
