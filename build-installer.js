const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectDir = __dirname;
const distDir = path.join(projectDir, 'dist');
const packOutDir = path.join(distDir, 'Mana Resonance-win32-x64');
const archiveFile = path.join(projectDir, 'app.zip');
const uninstallerSrc = path.join(projectDir, 'Uninstaller.cs');
const uninstallerExe = path.join(distDir, 'uninstaller.exe');
const installerSrc = path.join(projectDir, 'Installer.cs');
const outputSetupExe = path.join(projectDir, 'ManaResonanceSetup.exe');

const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';

function runCmd(cmd) {
  console.log(`Running: ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: projectDir });
}

try {
  // 1. electron-packager のインストール確認
  console.log('Checking/Installing electron-packager...');
  try {
    require.resolve('electron-packager');
  } catch (e) {
    runCmd('npm install --save-dev electron-packager');
  }

  // 2. アプリケーションのパッケージング
  console.log('Packaging Electron application...');
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
  fs.mkdirSync(distDir);

  // パッケージング時にアイコンも設定
  runCmd('npx electron-packager . "Mana Resonance" --platform=win32 --arch=x64 --out=dist --overwrite --icon=icon.ico --ignore="^/dist" --ignore="^/app.zip" --ignore="^/Mana Resonance.exe" --ignore="^/ManaAudioPro.exe" --ignore="^/ManaResonanceSetup.exe" --ignore="^/\\\\.git" --ignore="^/\\\\.gemini" --ignore="^/build-portable.js" --ignore="^/Launcher.cs" --ignore="^/Installer.cs" --ignore="^/Uninstaller.cs" --ignore="^/build-installer.js" --ignore="^/icon.ico"');

  if (!fs.existsSync(packOutDir)) {
    throw new Error('Packaging failed: output directory does not exist.');
  }

  // 3. アンインストーラー (uninstaller.exe) のコンパイル
  console.log('Compiling Uninstaller.exe...');
  const iconPath = path.join(projectDir, 'icon.ico');
  const cscUninstallCmd = `"${cscPath}" /target:winexe /out:"${uninstallerExe}" /win32icon:"${iconPath}" /reference:System.Windows.Forms.dll "${uninstallerSrc}"`;
  runCmd(cscUninstallCmd);

  if (!fs.existsSync(uninstallerExe)) {
    throw new Error('Compilation failed: uninstaller.exe was not created.');
  }

  // 4. パッケージされたフォルダを zip に圧縮
  console.log('Compressing packaged app to app.zip...');
  if (fs.existsSync(archiveFile)) {
    fs.unlinkSync(archiveFile);
  }
  runCmd(`tar -a -cf app.zip -C "dist/Mana Resonance-win32-x64" .`);

  if (!fs.existsSync(archiveFile)) {
    throw new Error('Compression failed: app.zip was not created.');
  }

  // 5. インストーラー (ManaResonanceSetup.exe) のコンパイルとアーカイブ・アンインストーラーの埋め込み
  console.log('Compiling Installer Setup.exe...');
  if (fs.existsSync(outputSetupExe)) {
    fs.unlinkSync(outputSetupExe);
  }

  // リソースとして app.zip と uninstaller.exe の両方をエイリアス付きで埋め込む
  const cscInstallCmd = `"${cscPath}" /target:winexe /out:"${outputSetupExe}" /win32icon:"${iconPath}" /resource:"${archiveFile}",app.zip /resource:"${uninstallerExe}",uninstaller.exe /reference:System.Windows.Forms.dll /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll "${installerSrc}"`;
  runCmd(cscInstallCmd);

  if (!fs.existsSync(outputSetupExe)) {
    throw new Error('Compilation failed: ManaResonanceSetup.exe was not created.');
  }

  // 6. 中間ファイルのクリーンアップ
  console.log('Cleaning up temporary build files...');
  fs.unlinkSync(archiveFile);
  fs.rmSync(distDir, { recursive: true, force: true });
  
  console.log('\n======================================================');
  console.log(`Success! Installer created at: \n${outputSetupExe}`);
  console.log('======================================================\n');

} catch (err) {
  console.error('\nBuild process failed with error:', err.message);
  process.exit(1);
}
