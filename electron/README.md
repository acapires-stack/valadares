# Valadares Desktop (Electron)

Wrapper desktop do site oficial em `https://valadares.app.br`.

## Por que existe

- Anti-cheat básico: F12 / DevTools desligado por padrão (em prod)
- Auto-update via `electron-updater` (puxa GitHub Releases)
- Instalador `.exe` distribuível pra Windows
- Sem barra de browser / favoritos / endereço

## Desenvolvimento (rodar local antes de empacotar)

```bash
cd valadares/electron
npm install
npm start
```

Vai abrir a janela carregando o site de produção. DevTools fica habilitado em dev mode (`!app.isPackaged`).

## Build (gerar instalador Windows)

```bash
npm install
npm run build              # NSIS installer (Setup-Valadares-1.0.0.exe)
npm run build:portable     # versão portable (não precisa instalar)
```

Output em `valadares/electron/dist/`.

Primeiro build demora ~3-5min (baixa Electron binary). Depois fica cacheado.

## Auto-update

Quando você publicar uma release nova no GitHub Releases (tag `v1.0.1`, etc), o `electron-updater` puxa automaticamente. Fluxo:

1. Subir nova versão em `electron/package.json` (ex: 1.0.0 → 1.0.1)
2. `npm run build`
3. Pegar o `.exe` gerado em `dist/` + `latest.yml`
4. Criar release no GitHub (`gh release create v1.0.1 dist/*.exe dist/latest.yml`)
5. Apps já instalados puxam o update na próxima abertura

## Code signing (opcional, não fazer agora)

Sem assinatura, Windows mostra "SmartScreen" warning na 1ª execução. Pra produto pago, vale gastar ~R$1500/ano num certificado EV. Por enquanto, ignorar.

## Anti-cheat real?

DevTools desligado tira 95% dos casuais. Quem souber rodar com `--remote-debugging-port` ou descompactar o `.asar` ainda consegue inspect. Pra anti-cheat *real*, precisa **Hardening N3** (inv server-side) — esse é o trabalho que mata o vetor de cheat, não o Electron.

Electron + N3 juntos = combo forte.
