const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectDir = __dirname;
const distDir = path.join(projectDir, 'dist');
const packOutDir = path.join(distDir, 'Mana Resonance-win32-x64');
const archiveFile = path.join(projectDir, 'app.zip');
const launcherSrc = path.join(projectDir, 'Launcher.cs');
const outputExe = path.join(projectDir, 'Mana Resonance.exe');

const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';

function runCmd(cmd) {
  console.log(`Running: ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: projectDir });
}

try {
  // 1. electron-packager のインストール確認とインストール
  console.log('Checking/Installing electron-packager...');
  try {
    require.resolve('electron-packager');
  } catch (e) {
    runCmd('npm install --save-dev electron-packager');
  }

  // 2. アプリケーションのパッケージング (再帰コピーによる肥大化を防ぐため、distや開発用ファイルを--ignoreで除外)
  console.log('Packaging Electron application...');
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
  runCmd('npx electron-packager . "Mana Resonance" --platform=win32 --arch=x64 --out=dist --overwrite --icon=icon.ico --ignore="^/dist" --ignore="^/app.zip" --ignore="^/Mana Resonance.exe" --ignore="^/ManaAudioPro.exe" --ignore="^/\\\\.git" --ignore="^/\\\\.gemini" --ignore="^/build-portable.js" --ignore="^/Launcher.cs" --ignore="^/Installer.cs" --ignore="^/Uninstaller.cs" --ignore="^/build-installer.js" --ignore="^/icon.ico"');

  if (!fs.existsSync(packOutDir)) {
    throw new Error('Packaging failed: output directory does not exist.');
  }

  // 3. パッケージされたフォルダを zip に圧縮
  console.log('Compressing packaged app to app.zip...');
  if (fs.existsSync(archiveFile)) {
    fs.unlinkSync(archiveFile);
  }
  // -C でターゲットディレクトリに移動し、カレントフォルダ内の全ファイルをzipとして圧縮する
  runCmd(`tar -a -cf app.zip -C "dist/Mana Resonance-win32-x64" .`);

  if (!fs.existsSync(archiveFile)) {
    throw new Error('Compression failed: app.zip was not created.');
  }

  // 4. C#コンパイラによるポータブルランチャーのコンパイルとアーカイブの埋め込み
  console.log('Compiling C# launcher with embedded resource...');
  if (fs.existsSync(outputExe)) {
    fs.unlinkSync(outputExe);
  }

  const iconPath = path.join(projectDir, 'icon.ico');
  const cscCmd = `"${cscPath}" /target:winexe /out:"${outputExe}" /win32icon:"${iconPath}" /resource:"${archiveFile}" /reference:System.Windows.Forms.dll /reference:System.IO.Compression.FileSystem.dll "${launcherSrc}"`;
  runCmd(cscCmd);

  if (!fs.existsSync(outputExe)) {
    throw new Error('Compilation failed: Mana Resonance.exe was not created.');
  }

  // 5. 中間ファイルのクリーンアップ
  console.log('Cleaning up temporary build files...');
  fs.unlinkSync(archiveFile);
  
  console.log('\n======================================================');
  console.log(`Success! Portable executable created at: \n${outputExe}`);
  console.log('======================================================\n');

} catch (err) {
  console.error('\nBuild process failed with error:', err.message);
  process.exit(1);
}
