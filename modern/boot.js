// Every game URL uses the same 3D renderer and the existing account/world.
(() => {
    window.VALADARES_MODERN = true;
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = '/modern/ui.css?v=20261007-3d';
    document.head.append(style);
})();
