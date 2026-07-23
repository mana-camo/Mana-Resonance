const { app, BrowserWindow, ipcMain, desktopCapturer, Menu, dialog, shell } = require('electron');
const path = require('path');
const https = require('https');
const fs = require('fs');
const os = require('os');
const { spawn, exec } = require('child_process');

let mainWindow;

function createWindow() {
  const isMac = process.platform === 'darwin';

  mainWindow = new BrowserWindow({
    width: 1560,
    height: 940,
    minWidth: 1200,
    minHeight: 890,
    frame: true, // OS標準のネイティブウィンドウ枠を使用
    titleBarStyle: isMac ? 'hiddenInset' : 'default', // Macでは純正インセット丸ボタン、Winでは標準タイトルバー
    trafficLightPosition: isMac ? { x: 12, y: 12 } : undefined,
    backgroundColor: '#020205',
    icon: path.join(__dirname, 'icon.png'),
    title: 'Mana Resonance',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    }
  });

  // getDisplayMedia の呼び出しに対して、ダイアログを表示せず自動でシステム音声付きの画面共有を許可する
  mainWindow.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      if (sources.length > 0) {
        callback({
          video: sources[0],
          audio: 'loopback', // システム全体の音声（ループバック）を有効化
          enableLocalAudioProcessing: false
        });
      } else {
        callback({ error: 'No screen sources available' });
      }
    }).catch(err => {
      callback({ error: err.message });
    });
  });

  mainWindow.loadFile('index.html');

  // メニューバーを非表示にする
  mainWindow.setMenuBarVisibility(false);

  // ウィンドウが閉じられた時の処理
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// OSごとの初期化
app.whenReady().then(() => {
  // Windowsのタスクバーアイコンがデフォルトアイコンに戻る現象を防ぐためのAppID登録
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.mana.resonance');
  }
  
  // macOS用の標準アプリケーションメニューのセットアップ
  setupMacMenu();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

let allowPrerelease = false;
let hasCheckedUpdates = false;

// IPC経由でベータアップデートの許可設定を受信・保存
ipcMain.on('set-allow-prerelease', (event, value) => {
  allowPrerelease = value;
  console.log('プレリリース検出設定が更新されました:', allowPrerelease);

  if (!hasCheckedUpdates) {
    hasCheckedUpdates = true;
    setTimeout(checkForUpdates, 1500);
  }
});

// 言語変更通知の受け取り
ipcMain.on('language-changed', (event, lang) => {
  console.log('言語設定が更新されました:', lang);
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('language-changed', lang);
  }
});

// IPC経由でのウィンドウ操作（最小化・最大化・閉じる）
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

// macOS用の標準メニュー定義 (テキストボックス内でのコピペ Cmd+C / Cmd+V 動作を有効にする)
function setupMacMenu() {
  if (process.platform !== 'darwin') return;
  const template = [
    {
      label: 'Mana Resonance',
      submenu: [
        { role: 'about', label: 'Mana Resonance について' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide', label: '非表示' },
        { role: 'hideOthers', label: '他を非表示' },
        { role: 'unhide', label: 'すべて表示' },
        { type: 'separator' },
        { role: 'quit', label: 'Mana Resonance を終了' }
      ]
    },
    {
      label: '編集',
      submenu: [
        { role: 'undo', label: '元に戻す' },
        { role: 'redo', label: 'やり直す' },
        { type: 'separator' },
        { role: 'cut', label: '切り取り' },
        { role: 'copy', label: 'コピー' },
        { role: 'paste', label: '貼り付け' },
        { role: 'selectAll', label: 'すべて選択' }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// GitHub Releases を使用したカスタム自動アップデート確認
function checkForUpdates() {
  const pkg = require('./package.json');
  const currentVersion = pkg.version;
  const updater = pkg.updater;

  if (!updater || updater.owner === "username") {
    console.log('GitHubリポジトリ設定がデフォルトのままのため、アップデート確認をスキップします。');
    return;
  }

  const pathUrl = allowPrerelease
    ? `/repos/${updater.owner}/${updater.repo}/releases`
    : `/repos/${updater.owner}/${updater.repo}/releases/latest`;

  const options = {
    hostname: 'api.github.com',
    path: pathUrl,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Electron'
    }
  };

  https.get(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      try {
        if (res.statusCode !== 200) {
          console.log(`GitHub API返却エラー (ステータスコード: ${res.statusCode})`);
          return;
        }

        let release = null;
        if (allowPrerelease) {
          const releases = JSON.parse(data);
          if (Array.isArray(releases) && releases.length > 0) {
            release = releases[0]; // 最も新しいリリース（プレリリース含む）
          }
        } else {
          release = JSON.parse(data);
        }

        if (!release) return;
        const latestVersion = release.tag_name.replace(/^v/, ''); // 'v1.0.1' -> '1.0.1'

        if (isNewerVersion(currentVersion, latestVersion)) {
          console.log(`新しいバージョンが利用可能です: v${latestVersion} (現在: v${currentVersion})`);
          
          // 適切なダウンロードアセットを探す (Windowsの場合は app.zip または exe)
          let asset = null;
          if (process.platform === 'win32') {
            asset = release.assets.find(a => a.name.endsWith('app.zip')) || release.assets.find(a => a.name.endsWith('.exe'));
          } else if (process.platform === 'darwin') {
            asset = release.assets.find(a => a.name.endsWith('.zip') || a.name.endsWith('.dmg'));
          }

          if (process.platform === 'darwin') {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              buttons: ['OK'],
              title: 'アップデートのご案内',
              message: `新しいバージョン (v${latestVersion}) が利用可能です。`
            });
          } else if (process.platform === 'win32') {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              buttons: ['今すぐアップデート', '後で'],
              title: 'アップデートのご案内',
              message: `新しいバージョン (v${latestVersion}) が見つかりました。\nダウンロードページを開きますか？`
            }).then((result) => {
              if (result.response === 0) {
                shell.openExternal(release.html_url);
              }
            });
          }
        }
      } catch (err) {
        console.error('アップデート情報のパースに失敗しました:', err);
      }
    });
  }).on('error', (err) => {
    console.error('アップデートの確認中にネットワークエラーが発生しました:', err.message);
  });
}

// バージョン比較ヘルパー
function isNewerVersion(current, latest) {
  const c = current.split('.').map(Number);
  const l = latest.split('.').map(Number);
  for (let i = 0; i < Math.max(c.length, l.length); i++) {
    const cv = c[i] || 0;
    const lv = l[i] || 0;
    if (lv > cv) return true;
    if (cv > lv) return false;
  }
  return false;
}

