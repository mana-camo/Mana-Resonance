const { app, BrowserWindow, ipcMain, desktopCapturer, Menu, dialog, shell } = require('electron');
const path = require('path');
const https = require('https');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 1000,
    minHeight: 650,
    frame: false, // フレームレスウィンドウ (macOS風のカスタムタイトルバーを使用するため)
    transparent: true, // 背景透過 (トランスルーセント効果用)
    backgroundColor: '#00000000', // アルファチャネル付きの背景色
    icon: path.join(__dirname, 'icon.png'), // アプリのアイコン適用
    title: 'Mana Resonance', // ウィンドウのタイトル
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false // ローカルファイルの読み込みやBlob URLの制限を緩和
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

  // 自動アップデートチェックを実行
  setTimeout(checkForUpdates, 3000); // 起動3秒後にチェック開始

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

  const options = {
    hostname: 'api.github.com',
    path: `/repos/${updater.owner}/${updater.repo}/releases/latest`,
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

        const release = JSON.parse(data);
        const latestVersion = release.tag_name.replace(/^v/, ''); // 'v1.0.1' -> '1.0.1'

        if (isNewerVersion(currentVersion, latestVersion)) {
          console.log(`新しいバージョンが利用可能です: v${latestVersion} (現在: v${currentVersion})`);
          
          // 適切なダウンロードアセットを探す
          let asset = null;
          if (process.platform === 'win32') {
            asset = release.assets.find(a => a.name.endsWith('.exe'));
          } else if (process.platform === 'darwin') {
            asset = release.assets.find(a => a.name.endsWith('.zip') || a.name.endsWith('.dmg'));
          }

          if (asset) {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              buttons: ['ダウンロードして適用', '後で'],
              title: 'アップデートのご案内',
              message: `新しいバージョン (v${latestVersion}) が見つかりました。`,
              detail: 'バックグラウンドで最新版をダウンロードし、完了後に再起動して適用します。'
            }).then((result) => {
              if (result.response === 0) {
                downloadUpdate(asset.browser_download_url, asset.name, latestVersion);
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

// バージョン比較ヘルパー (例: '1.0.0' と '1.0.1' の比較)
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

// アップデートアセットのダウンロードと適用
function downloadUpdate(url, filename, version) {
  const tempDir = os.tmpdir();
  const destPath = path.join(tempDir, filename);

  const file = fs.createWriteStream(destPath);
  
  if (mainWindow) {
    mainWindow.webContents.send('update-download-start');
  }

  // リダイレクトに対応したダウンロードハンドラー
  const download = (targetUrl) => {
    https.get(targetUrl, { headers: { 'User-Agent': 'Electron' } }, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // リダイレクト追従
        download(response.headers.location);
        return;
      }

      if (response.statusCode !== 200) {
        console.error(`ダウンロードエラー (ステータスコード: ${response.statusCode})`);
        file.close();
        fs.unlink(destPath, () => {});
        if (mainWindow) mainWindow.webContents.send('update-download-error');
        return;
      }

      const totalBytes = parseInt(response.headers['content-length'], 10) || 0;
      let downloadedBytes = 0;

      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        if (totalBytes > 0 && mainWindow) {
          const percent = Math.round((downloadedBytes / totalBytes) * 100);
          mainWindow.webContents.send('update-download-progress', percent);
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close(() => {
          console.log('ダウンロードが完了しました:', destPath);
          applyUpdate(destPath, version);
        });
      });
    }).on('error', (err) => {
      console.error('ダウンロード中にネットワークエラーが発生しました:', err.message);
      file.close();
      fs.unlink(destPath, () => {});
      if (mainWindow) mainWindow.webContents.send('update-download-error');
    });
  };

  download(url);
}

// アップデートの適用実行
function applyUpdate(filePath, version) {
  if (process.platform === 'win32') {
    // Windowsの場合はサイレント上書き引数を渡して即座に終了 (バックグラウンドで上書きされ、新バージョンが自動起動します)
    const child = spawn(filePath, ['/silent'], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
    app.quit();
  } else if (process.platform === 'darwin') {
    // macOSの場合は保存先ディレクトリを Finder で開き、ユーザーに上書きを促す
    shell.showItemInFolder(filePath);
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'macOS版のアップデート適用方法',
      message: 'ダウンロードした最新のファイルをApplicationsフォルダにドラッグして上書きしてください。',
      buttons: ['了解']
    }).then(() => {
      app.quit();
    });
  }
}

