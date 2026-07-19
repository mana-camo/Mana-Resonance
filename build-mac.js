const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectDir = __dirname;
const distDir = path.join(projectDir, 'dist');
const packOutDir = path.join(distDir, 'Mana Resonance-darwin-x64');
const outputZip = path.join(projectDir, 'ManaResonance_mac.zip');

function runCmd(cmd) {
  console.log(`Running: ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: projectDir });
}

try {
  console.log('=== Mana Resonance macOS アプリパッケージング開始 ===\n');

  // 1. electron-packager のインストール確認
  try {
    require.resolve('electron-packager');
  } catch (e) {
    runCmd('npm install --save-dev electron-packager');
  }

  // 2. 既存のMacビルド成果物のクリーンアップ
  if (fs.existsSync(packOutDir)) {
    fs.rmSync(packOutDir, { recursive: true, force: true });
  }
  if (fs.existsSync(outputZip)) {
    fs.unlinkSync(outputZip);
  }

  // 3. electron-packager の実行 (macOS向け / darwin / x64)
  // --icon に icon.png を指定することで、Electron Packager が自動的にMac用のアイコンをビルドして適用します
  const packCmd = 'npx electron-packager . "Mana Resonance" ' +
    '--platform=darwin ' +
    '--arch=x64 ' +
    '--out=dist ' +
    '--overwrite ' +
    '--icon=icon.png ' +
    '--ignore="^/dist" ' +
    '--ignore="^/app.zip" ' +
    '--ignore="^/Mana Resonance.exe" ' +
    '--ignore="^/ManaAudioPro.exe" ' +
    '--ignore="^/ManaResonanceSetup.exe" ' +
    '--ignore="^/ManaResonance_mac.zip" ' +
    '--ignore="^/\\\\.git" ' +
    '--ignore="^/\\\\.gemini" ' +
    '--ignore="^/build-portable.js" ' +
    '--ignore="^/build-installer.js" ' +
    '--ignore="^/build-mac.js" ' +
    '--ignore="^/Launcher.cs" ' +
    '--ignore="^/Installer.cs" ' +
    '--ignore="^/Uninstaller.cs" ' +
    '--ignore="^/icon.ico"';

  runCmd(packCmd);

  if (!fs.existsSync(packOutDir)) {
    throw new Error('Packaging failed: Output directory does not exist.');
  }

  // 4. 配布用の zip アーカイブを作成
  console.log('\nCompressing packaged app to ManaResonance_mac.zip...');
  // tar -cf で zip または tar.gz 形式で圧縮 (クロスプラットフォーム対応)
  runCmd(`tar -a -cf ManaResonance_mac.zip -C "dist/Mana Resonance-darwin-x64" "Mana Resonance.app"`);

  if (!fs.existsSync(outputZip)) {
    throw new Error('Compression failed: Zip archive was not created.');
  }

  console.log('\n======================================================');
  console.log(`Success! macOS Portable App created at: \n${outputZip}`);
  console.log('======================================================\n');

} catch (err) {
  console.error('\nmacOS Build process failed with error:', err.message);
  process.exit(1);
}
