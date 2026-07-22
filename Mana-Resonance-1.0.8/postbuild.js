const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, 'dist');
const projectDir = __dirname;

if (!fs.existsSync(distDir)) {
  console.error('Error: dist directory does not exist.');
  process.exit(1);
}

const files = fs.readdirSync(distDir);
const exeFiles = files.filter(file => file.endsWith('.exe'));

if (exeFiles.length === 0) {
  console.error('Error: No .exe files found in dist directory.');
  process.exit(1);
}

// コピー対象となるexe（通常はManaAudioPro <version>.exe または ManaAudioPro.exe）
const targetExe = exeFiles[0]; 
const srcPath = path.join(distDir, targetExe);
const destPath = path.join(projectDir, targetExe);

try {
  console.log(`Copying ${targetExe} to project root...`);
  fs.copyFileSync(srcPath, destPath);
  console.log(`Successfully copied ${targetExe} to ${destPath}`);
} catch (err) {
  console.error('Failed to copy exe file:', err);
  process.exit(1);
}
