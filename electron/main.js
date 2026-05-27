// Valadares — Electron main process
// Carrega o site oficial (Vercel) num BrowserWindow nativo, sem barra de browser,
// devtools desligado por padrão (anti-cheat básico).
// Auto-update via electron-updater (puxa GitHub Releases).

const { app, BrowserWindow, shell, Menu, dialog } = require('electron');
const path = require('path');

// Carregamento condicional do auto-updater (não quebra em dev)
let autoUpdater = null;
try {
    autoUpdater = require('electron-updater').autoUpdater;
} catch (e) {
    console.warn('[updater] electron-updater não disponível em dev.');
}

const SITE_URL = 'https://valadares-xi.vercel.app';

const IS_DEV = !app.isPackaged;

let mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 1024,
        minHeight: 720,
        title: 'Valadares',
        backgroundColor: '#0a0805',
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            // F12 / Ctrl+Shift+I desabilitados em produção
            devTools: IS_DEV,
        },
    });

    // Esconde menu nativo (File/Edit/View/etc)
    Menu.setApplicationMenu(null);

    // Bloqueia abrir devtools por atalho mesmo em prod
    if (!IS_DEV) {
        mainWindow.webContents.on('before-input-event', (event, input) => {
            const isF12 = input.key === 'F12';
            const isCtrlShiftI = input.control && input.shift && input.key.toLowerCase() === 'i';
            const isCtrlShiftJ = input.control && input.shift && input.key.toLowerCase() === 'j';
            const isCtrlU = input.control && input.key.toLowerCase() === 'u';
            if (isF12 || isCtrlShiftI || isCtrlShiftJ || isCtrlU) {
                event.preventDefault();
            }
        });
    }

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
