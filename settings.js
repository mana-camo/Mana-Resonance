const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// --------------------------------------------------------------------------
// 言語設定ファイルの保持・多重探索読み書き (Installer.cs との完全統一)
// --------------------------------------------------------------------------
let currentLang = 'EN';

function findLanguageFilePath() {
  const candidates = [
    path.join(process.cwd(), 'language.txt'),
    path.join(path.dirname(process.execPath), 'language.txt'),
    path.join(__dirname, 'language.txt'),
    path.join(__dirname, '..', 'language.txt'),
    path.join(__dirname, '..', '..', 'language.txt')
  ];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (e) {}
  }
  return path.join(path.dirname(process.execPath), 'language.txt');
}

function loadLanguage() {
  try {
    const targetPath = findLanguageFilePath();
    if (fs.existsSync(targetPath)) {
      const content = fs.readFileSync(targetPath, 'utf8').trim().toUpperCase();
      if (content === 'JA' || content === 'EN') {
        currentLang = content;
      }
    }
  } catch (err) {
    console.warn('Language read error:', err);
  }
}

function saveLanguage(lang) {
  currentLang = lang;
  const candidates = [
    path.join(process.cwd(), 'language.txt'),
    path.join(path.dirname(process.execPath), 'language.txt'),
    path.join(__dirname, 'language.txt'),
    path.join(__dirname, '..', 'language.txt')
  ];

  for (const p of candidates) {
    try {
      fs.writeFileSync(p, lang, 'utf8');
    } catch (err) {
      // 一部ディレクトリの書き込み権限エラーを安全に無視
    }
  }
}

// 言語テキストマッピング
const i18n = {
  EN: {
    title: "APPLICATION SETTINGS",
    sub: "System options and preference management",
    lblLang: "DISPLAY LANGUAGE",
    descLang: "Interface and setup wizard language",
    lblBeta: "BETA UPDATES",
    descBeta: "Receive early experimental feature updates",
    lblAudio: "AUDIO SENSITIVITY (FUTURE SLOT)",
    btnCancel: "CANCEL",
    btnSave: "SAVE SETTINGS",
    saved: "✓ Saved Successfully"
  },
  JA: {
    title: "システム設定 (SETTINGS)",
    sub: "Mana Resonance の機能オプションおよびシステム設定",
    lblLang: "表示言語 (DISPLAY LANGUAGE)",
    descLang: "UIおよびセットアップで使用する言語を設定します",
    lblBeta: "ベータアップデート受信",
    descBeta: "開発中の実験的最新機能アップデートを自動受信します",
    lblAudio: "オーディオ感度設定 (将来スロット)",
    btnCancel: "キャンセル",
    btnSave: "設定を保存する",
    saved: "✓ 保存が完了しました"
  }
};

function applyUI() {
  const dict = i18n[currentLang] || i18n.EN;

  const titleElem = document.getElementById('title-settings');
  const subElem = document.getElementById('sub-settings');
  const lblLangElem = document.getElementById('lbl-lang');
  const descLangElem = document.getElementById('desc-lang');
  const lblBetaElem = document.getElementById('lbl-beta');
  const descBetaElem = document.getElementById('desc-beta');
  const lblAudioElem = document.getElementById('lbl-audio');
  const btnCancelElem = document.getElementById('btn-cancel');
  const btnSaveElem = document.getElementById('btn-save');
  const saveMsgElem = document.getElementById('save-msg');
  const selectLang = document.getElementById('select-lang');

  if (titleElem) titleElem.textContent = dict.title;
  if (subElem) subElem.textContent = dict.sub;
  if (lblLangElem) lblLangElem.textContent = dict.lblLang;
  if (descLangElem) descLangElem.textContent = dict.descLang;
  if (lblBetaElem) lblBetaElem.textContent = dict.lblBeta;
  if (descBetaElem) descBetaElem.textContent = dict.descBeta;
  if (lblAudioElem) lblAudioElem.textContent = dict.lblAudio;
  if (btnCancelElem) btnCancelElem.textContent = dict.btnCancel;
  if (btnSaveElem) btnSaveElem.textContent = dict.btnSave;
  if (saveMsgElem) saveMsgElem.textContent = dict.saved;

  if (selectLang) selectLang.value = currentLang;
}

window.addEventListener('DOMContentLoaded', () => {
  loadLanguage();
  applyUI();

  const selectLang = document.getElementById('select-lang');
  const toggleBeta = document.getElementById('toggle-beta');
  const btnSave = document.getElementById('btn-save');
  const btnCancel = document.getElementById('btn-cancel');
  const saveMsg = document.getElementById('save-msg');

  // 言語選択を変更したらリアルタイムでUIテキストをプレビュー切り替え
  if (selectLang) {
    selectLang.addEventListener('change', () => {
      currentLang = selectLang.value;
      applyUI();
    });
  }

  if (btnCancel) {
    btnCancel.addEventListener('click', () => {
      window.close();
    });
  }

  if (btnSave) {
    btnSave.addEventListener('click', () => {
      if (selectLang) {
        saveLanguage(selectLang.value);
        ipcRenderer.send('language-changed', selectLang.value);
      }
      if (toggleBeta) {
        ipcRenderer.send('set-allow-prerelease', toggleBeta.checked);
      }

      if (saveMsg) {
        saveMsg.classList.remove('hidden');
        setTimeout(() => {
          window.close();
        }, 800);
      } else {
        window.close();
      }
    });
  }
});
