// Valadares — Electron main process
// Carrega o site oficial (Vercel) num BrowserWindow nativo, sem barra de browser,
// devtools desligado por padrão (anti-cheat básico).
// Auto-update via electron-updater (puxa GitHub Releases).

const { app, BrowserWindow, shell, Menu, dialog, screen, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');

// Carregamento condicional do auto-updater (não quebra em dev)
let autoUpdater = null;
try {
    autoUpdater = require('electron-updater').autoUpdater;
} catch (e) {
    console.warn('[updater] electron-updater não disponível em dev.');
}

const SITE_URL = 'https://valadares.app.br/jogar';

const IS_DEV = !app.isPackaged;

// ─── Anti-throttle quando a janela perde foco (Windows) ───────────────────
// Por padrão o Chromium "congela" o renderer quando a janela é ocluída ou
// desfocada (alt-tab, clicar em outro app). Como o Valadares roda um game loop
// contínuo (requestAnimationFrame), isso fazia o jogo PARAR ao perder o foco e
// só voltar ao clicar de novo na tela. Estes switches desligam o backgrounding
// do processo/oclusão no Windows; o webPreferences.backgroundThrottling:false
// (abaixo) cobre o throttle de rAF/timers. Precisam vir ANTES do app ficar pronto.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

let mainWindow = null;

// ─── Persistência de preferências (zoom, fullscreen) ──────────────────────
// Salva em userData/prefs.json. App-level (não por usuário do jogo).
const PREFS_FILE = path.join(app.getPath('userData'), 'prefs.json');
function loadPrefs(){
    try { return JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8')); } catch { return {}; }
}
function savePrefs(p){
    try { fs.writeFileSync(PREFS_FILE, JSON.stringify(p), 'utf8'); } catch (e) { console.warn('[prefs] save error:', e.message); }
}

// ─── Auto-detect zoom baseado em resolução ────────────────────────────────
// Telas pequenas (1366×768 = laptop popular) → +10-15% zoom. Mesmo 1080p
// ganha um leve aumento (acessibilidade pra olhos cansados — usuário pode
// reduzir via Ctrl+- ou Settings se preferir). Só roda na PRIMEIRA abertura
// (prefs.zoomLevel ausente). Depois respeita preferência do usuário.
function detectInitialZoom(){
    try {
        const { workAreaSize } = screen.getPrimaryDisplay();
        const w = workAreaSize.width;
        if (w < 1280) return 1;     // tela apertada — zoom 1 (Electron level 1 ≈ +10%)
        if (w < 1600) return 0.5;   // laptop comum (1366×768) — leve aumento
        if (w < 2200) return 0.25;  // 1080p — pequeno boost de legibilidade
        return 0;                    // 1440p+ / 4K — padrão (escala alta nativa)
    } catch { return 0; }
}

function createWindow() {
    const prefs = loadPrefs();
    mainWindow = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1024,
        minHeight: 720,
        title: 'Valadares',
        backgroundColor: '#0a0805',
        autoHideMenuBar: true,
        useContentSize: true,
        // show:false combinado com ready-to-show é o padrão correto pra
        // garantir que maximize() seja aplicado ANTES do user ver a janela.
        // Antes (v1.0.4): maximize() chamado direto após o new BrowserWindow
        // não pegava em todos os cenários — usuário via janela 1440×900 normal.
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            // F12 / Ctrl+Shift+I desabilitados em produção
            devTools: IS_DEV,
            zoomFactor: 1,
            // Mantém o game loop (requestAnimationFrame) em velocidade cheia
            // mesmo com a janela sem foco / em segundo plano. Sem isto o Chromium
            // estrangula o rAF ao perder o foco e o jogo "trava" até clicar na
            // tela de novo. Par com os switches de backgrounding lá em cima.
            backgroundThrottling: false,
        },
    });

    // Maximiza ANTES de mostrar (acessibilidade pra quem tem dificuldade de
    // arrastar canto da janela e quer aproveitar o monitor inteiro). Fallback
    // explícito também após show por segurança em alguns drivers de janela.
    mainWindow.once('ready-to-show', () => {
        mainWindow.maximize();
        mainWindow.show();
        // Se preferência de fullscreen salva: aplica também
        if (prefs.fullScreen) mainWindow.setFullScreen(true);
        // Belt-and-suspenders: se por algum motivo a janela não maximizou,
        // tenta de novo após um tick (alguns drivers Windows demoram).
        setTimeout(() => {
            if (!mainWindow.isMaximized() && !mainWindow.isFullScreen()) {
                mainWindow.maximize();
            }
        }, 100);
    });

    // Menu invisível com accelerators só — backup de F11/zoom.
    // before-input-event funciona na maioria dos cenários, mas em alguns
    // drivers Windows / com foco perdido o F11 não dispara. Menu accelerator
    // é o caminho canônico do Electron e funciona sempre que a janela tem
    // foco. setMenuBarVisibility(false) esconde a barra do menu.
    const toggleFs = () => {
        if (!mainWindow) return;
        const fs = !mainWindow.isFullScreen();
        mainWindow.setFullScreen(fs);
        savePrefs({ ...loadPrefs(), fullScreen: fs });
    };
    const zoomBy = (delta) => {
        if (!mainWindow) return;
        const cur = mainWindow.webContents.getZoomLevel();
        let next = cur;
        if (delta === 'in')    next = Math.min(5, cur + 0.5);
        if (delta === 'out')   next = Math.max(-3, cur - 0.5);
        if (delta === 'reset') next = 0;
        mainWindow.webContents.setZoomLevel(next);
        savePrefs({ ...loadPrefs(), zoomLevel: next });
    };
    const hiddenMenu = Menu.buildFromTemplate([{
        label: 'Visual',
        submenu: [
            { label: 'Tela cheia',     accelerator: 'F11',                 click: toggleFs },
            { label: 'Aumentar zoom',  accelerator: 'CommandOrControl+=',  click: () => zoomBy('in') },
            { label: 'Diminuir zoom',  accelerator: 'CommandOrControl+-',  click: () => zoomBy('out') },
            { label: 'Zoom padrão',    accelerator: 'CommandOrControl+0',  click: () => zoomBy('reset') },
        ],
    }]);
    Menu.setApplicationMenu(hiddenMenu);
    mainWindow.setMenuBarVisibility(false);

    // Backup #3: globalShortcut F11. Funciona mesmo se a webContents perdeu
    // foco (ex.: usuário clicou na borda da janela e teclou F11). Disparado
    // só depois do ready-to-show pra não conflitar com instâncias prévias.
    mainWindow.once('ready-to-show', () => {
        try {
            if (!globalShortcut.isRegistered('F11')) {
                globalShortcut.register('F11', toggleFs);
            }
        } catch (e) {
            console.warn('[globalShortcut] F11 register falhou:', e.message);
        }
    });

    // Aplica zoom a CADA load (inclui reloads do auto-update). Lê o prefs ATUAL
    // — não uma variável capturada no boot. Antes (bug): o reload re-aplicava o
    // zoom inicial e descartava o ajuste do user ("regulo, atualiza, volta").
    mainWindow.webContents.on('did-finish-load', () => {
        const prefsNow = loadPrefs();
        const z = (typeof prefsNow.zoomLevel === 'number') ? prefsNow.zoomLevel : detectInitialZoom();
        mainWindow.webContents.setZoomLevel(z);
        if (typeof prefsNow.zoomLevel !== 'number') {
            savePrefs({ ...prefsNow, zoomLevel: z });
        }
    });

    // Atalhos de teclado: F11 fullscreen + Ctrl+= / Ctrl+- / Ctrl+0 zoom.
    // Persistem mudanças em prefs.json pra próxima sessão.
    mainWindow.webContents.on('before-input-event', (event, input) => {
        const isF12 = input.key === 'F12';
        const isCtrlShiftI = input.control && input.shift && input.key.toLowerCase() === 'i';
        const isCtrlShiftJ = input.control && input.shift && input.key.toLowerCase() === 'j';
        const isCtrlU = input.control && input.key.toLowerCase() === 'u';
        if (!IS_DEV && (isF12 || isCtrlShiftI || isCtrlShiftJ || isCtrlU)) {
            event.preventDefault();
            return;
        }
        // F11: toggle fullscreen
        if (input.key === 'F11' && input.type === 'keyDown') {
            event.preventDefault();
            const fs = !mainWindow.isFullScreen();
            mainWindow.setFullScreen(fs);
            savePrefs({ ...loadPrefs(), fullScreen: fs });
            return;
        }
        // Ctrl+= / Ctrl++ (zoom in), Ctrl+- (zoom out), Ctrl+0 (reset)
        if (input.control && input.type === 'keyDown') {
            const k = input.key;
            let newLevel = null;
            if (k === '=' || k === '+') newLevel = Math.min(5, mainWindow.webContents.getZoomLevel() + 0.5);
            else if (k === '-') newLevel = Math.max(-3, mainWindow.webContents.getZoomLevel() - 0.5);
            else if (k === '0') newLevel = 0;
            if (newLevel !== null) {
                event.preventDefault();
                mainWindow.webContents.setZoomLevel(newLevel);
                savePrefs({ ...loadPrefs(), zoomLevel: newLevel });
            }
        }
    });

    // IPC bridge: cliente (Settings UI) pode mudar zoom/fullscreen via preload.
    ipcMain.handle('app:setZoom', (_e, delta) => {
        const cur = mainWindow.webContents.getZoomLevel();
        let next = cur;
        if (delta === 'in')    next = Math.min(5, cur + 0.5);
        if (delta === 'out')   next = Math.max(-3, cur - 0.5);
        if (delta === 'reset') next = 0;
        mainWindow.webContents.setZoomLevel(next);
        savePrefs({ ...loadPrefs(), zoomLevel: next });
        return next;
    });
    ipcMain.handle('app:toggleFullscreen', () => {
        const fs = !mainWindow.isFullScreen();
        mainWindow.setFullScreen(fs);
        savePrefs({ ...loadPrefs(), fullScreen: fs });
        return fs;
    });
    ipcMain.handle('app:getZoom', () => mainWindow.webContents.getZoomLevel());

    // Links externos abrem no browser do sistema (não dentro do app)
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (!url.startsWith(SITE_URL)) {
            shell.openExternal(url);
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });

    mainWindow.loadURL(SITE_URL);

    mainWindow.on('closed', () => { mainWindow = null; });

    // ─── Auto-update ────────────────────────────────────────────────────
    // Antes (v1.0.5 e anteriores): só verificava 1× ao abrir o app. Se uma
    // release saísse com o app rodando, usuário só descobria reabrindo.
    // Agora: verifica ao abrir + a cada 15min + botão manual via IPC.
    if (autoUpdater && !IS_DEV) {
        const checkOnce = (trigger) => {
            log('updater', `check (${trigger})`);
            autoUpdater.checkForUpdatesAndNotify().catch(err => {
                log('updater', `erro: ${err.message || err}`);
            });
        };
        setTimeout(() => checkOnce('startup'), 5000);
        setInterval(() => checkOnce('periodic-15min'), 15 * 60 * 1000);
    }

    // IPC: cliente (Settings UI) pode chamar verificação manual + ver status.
    ipcMain.handle('app:checkUpdate', async () => {
        if (!autoUpdater) return { ok: false, reason: 'updater-unavailable' };
        if (IS_DEV)         return { ok: false, reason: 'dev-mode' };
        try {
            log('updater', 'check (manual via IPC)');
            const r = await autoUpdater.checkForUpdates();
            return { ok: true, version: r?.updateInfo?.version || null };
        } catch (err) {
            log('updater', `erro manual: ${err.message || err}`);
            return { ok: false, reason: err.message || String(err) };
        }
    });
    ipcMain.handle('app:getVersion', () => app.getVersion());
}

// ─── Logger persistente do updater ───────────────────────────────────────
// userData/update.log — diagnóstica problemas de auto-update no campo (user
// reporta "não atualizou", lemos o log e vemos o que aconteceu). Tail 200 KB.
const UPDATE_LOG = path.join(app.getPath('userData'), 'update.log');
function log(scope, msg){
    const line = `[${new Date().toISOString()}] [${scope}] ${msg}\n`;
    try {
        // Tail rotation: se passar de 200 KB, recomeça
        if (fs.existsSync(UPDATE_LOG) && fs.statSync(UPDATE_LOG).size > 200 * 1024) {
            fs.writeFileSync(UPDATE_LOG, '', 'utf8');
        }
        fs.appendFileSync(UPDATE_LOG, line, 'utf8');
    } catch {}
    console.log(line.trim());
}

// Eventos do auto-updater (somente se carregado)
if (autoUpdater) {
    autoUpdater.on('checking-for-update', () => log('updater', 'checking-for-update'));
    autoUpdater.on('update-available', (info) => log('updater', `update-available v${info?.version}`));
    autoUpdater.on('update-not-available', (info) => log('updater', `up-to-date v${info?.version || app.getVersion()}`));
    autoUpdater.on('error', (err) => log('updater', `error: ${err.message || err}`));
    autoUpdater.on('download-progress', (p) => log('updater', `download ${Math.round(p.percent)}% (${Math.round(p.bytesPerSecond/1024)} KB/s)`));
    autoUpdater.on('update-downloaded', (info) => {
        log('updater', `downloaded v${info?.version} — pedindo confirmação ao usuário`);
        if (!mainWindow) return;
        dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Atualização disponível',
            message: `Valadares ${info?.version || ''} foi baixada. Reiniciar agora pra aplicar?`,
            buttons: ['Reiniciar', 'Depois'],
            defaultId: 0,
        }).then(({ response }) => {
            if (response === 0) {
                log('updater', 'usuário aceitou — quitAndInstall');
                autoUpdater.quitAndInstall();
            } else {
                log('updater', 'usuário adiou — instala no próximo quit');
            }
        });
    });
}

app.whenReady().then(createWindow);

app.on('will-quit', () => {
    try { globalShortcut.unregisterAll(); } catch {}
});
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
