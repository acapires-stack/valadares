// Valadares — Electron main process
// Carrega o site oficial (Vercel) num BrowserWindow nativo, sem barra de browser,
// devtools desligado por padrão (anti-cheat básico).
// Auto-update via electron-updater (puxa GitHub Releases).

const { app, BrowserWindow, shell, Menu, dialog, screen, ipcMain } = require('electron');
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
// Telas pequenas (1366×768 = laptop popular) → +10% zoom. 4K mantém padrão.
// Só roda na PRIMEIRA abertura (prefs.zoomLevel ausente). Depois respeita
// preferência do usuário.
function detectInitialZoom(){
    try {
        const { workAreaSize } = screen.getPrimaryDisplay();
        const w = workAreaSize.width;
        if (w < 1280) return 1;   // tela apertada — zoom 1 (Electron level 1 ≈ +10%)
        if (w < 1600) return 0.5; // laptop comum — leve aumento
        return 0;                  // 1080p+ — padrão
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
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            // F12 / Ctrl+Shift+I desabilitados em produção
            devTools: IS_DEV,
            zoomFactor: 1,
        },
    });

    // Maximiza sempre ao abrir — acessibilidade pra quem tem dificuldade de
    // arrastar canto da janela e quer aproveitar o monitor inteiro.
    mainWindow.maximize();

    // Esconde menu nativo (File/Edit/View/etc)
    Menu.setApplicationMenu(null);

    // Aplica zoom: respeita preferência do user; senão, auto-detect.
    const initialZoom = (typeof prefs.zoomLevel === 'number') ? prefs.zoomLevel : detectInitialZoom();
    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.setZoomLevel(initialZoom);
        // Se foi auto-detect (sem preferência salva), persiste pra próxima vez
        if (typeof prefs.zoomLevel !== 'number') {
            savePrefs({ ...prefs, zoomLevel: initialZoom });
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

    // Auto-update após 5s do load (não bloqueia inicialização)
    if (autoUpdater && !IS_DEV) {
        setTimeout(() => {
            autoUpdater.checkForUpdatesAndNotify().catch(err => {
                console.warn('[updater] erro ao checar update:', err.message);
            });
        }, 5000);
    }
}

// Eventos do auto-updater (somente se carregado)
if (autoUpdater) {
    autoUpdater.on('update-downloaded', () => {
        if (!mainWindow) return;
        dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Atualização disponível',
            message: 'Uma nova versão de Valadares foi baixada. Reiniciar agora pra aplicar?',
            buttons: ['Reiniciar', 'Depois'],
            defaultId: 0,
        }).then(({ response }) => {
            if (response === 0) autoUpdater.quitAndInstall();
        });
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
