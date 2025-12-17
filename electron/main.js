const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const si = require('systeminformation');
const crypto = require('crypto');

// --- CORREÇÕES CRÍTICAS (GPU e CERTIFICADOS) ---
app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('allow-insecure-localhost', 'true');
app.commandLine.appendSwitch('disable-site-isolation-trials');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required'); // Força áudio/vídeo
// -----------------------------------------------

let mainWindow;

async function getMachineId() {
  try {
    const diskLayout = await si.diskLayout();
    const diskSerial = diskLayout[0]?.serialNum || 'UNKNOWN_DISK';
    const uuid = await si.uuid();
    const systemId = uuid.os || uuid.hardware || 'UNKNOWN_UUID';
    const rawId = `${diskSerial}-${systemId}`;
    return crypto.createHash('sha256').update(rawId).digest('hex');
  } catch (error) {
    console.error('Erro ao gerar HWID:', error);
    return 'ERROR_GEN_HWID';
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    kiosk: false, // Mude para TRUE em produção
    fullscreen: false, // Mude para TRUE em produção
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false,
      allowRunningInsecureContent: true,
      backgroundThrottling: false,
      webviewTag: true, // ESSENCIAL: Habilita a tag <webview>
      nativeWindowOpen: true
    },
  });

  // User Agent Global para a janela principal
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
  mainWindow.webContents.setUserAgent(userAgent);

  // --- TRATAMENTO GLOBAL PARA JOGOS (WEBVIEWS E IFRAMES) ---
  // Este evento dispara sempre que um jogo ou popup é criado
  app.on('web-contents-created', (event, contents) => {
    
    // 1. Força o User Agent no Jogo também
    contents.setUserAgent(userAgent);

    // 2. Monitoriza erros DENTRO do jogo e joga no terminal
    contents.on('console-message', (e, level, msg, line, sourceId) => {
      // Filtra logs inúteis para não poluir
      if (!msg.includes('Deprecation') && !msg.includes('Violation')) {
         console.log(`[JOGO LOG]: ${msg} (${sourceId}:${line})`);
      }
    });

    // 3. Permite que o jogo abra novas janelas (popups de bonus, etc)
    contents.setWindowOpenHandler(({ url }) => {
      console.log('[JOGO POPUP]: Bloqueado ou Permitido ->', url);
      return { action: 'allow' };
    });
  });

  // --- INTERCEPTAÇÃO DE REDE (HEADERS) ---
  const session = mainWindow.webContents.session;

  // 1. Antes de enviar: Remove ou falsifica Referer
  const filter = { urls: ['*://*/*'] };
  session.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    const { requestHeaders } = details;
    // Alguns jogos PRECISAM de Referer, outros quebram com ele. 
    // Tente deletar. Se falhar, tente colocar o host do jogo.
    delete requestHeaders['Referer'];
    delete requestHeaders['Origin'];
    
    // Dica: Se o jogo ainda falhar, descomente abaixo para testar spoofing
    // requestHeaders['Referer'] = 'https://google.com/'; 
    
    callback({ requestHeaders });
  });

  // 2. Ao receber: Remove restrições de segurança do site remoto
  session.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = Object.assign({}, details.responseHeaders);
    
    const headersToRemove = [
      'x-frame-options',
      'content-security-policy',
      'frame-ancestors',
      'strict-transport-security',
      'x-content-type-options',
      'access-control-allow-origin' // Removemos o original para injetar o nosso
    ];

    Object.keys(responseHeaders).forEach((header) => {
      if (headersToRemove.includes(header.toLowerCase())) {
        delete responseHeaders[header];
      }
    });

    // Força permissão CORS total
    responseHeaders['Access-Control-Allow-Origin'] = ['*'];
    responseHeaders['Access-Control-Allow-Headers'] = ['*'];

    callback({ cancel: false, responseHeaders });
  });

  const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, '../dist/index.html')}`;
  mainWindow.loadURL(startUrl);
}

app.whenReady().then(() => {
  createWindow();

  ipcMain.handle('get-machine-id', async () => {
    return await getMachineId();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});