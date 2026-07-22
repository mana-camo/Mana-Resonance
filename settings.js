const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

const langFilePath = path.join(__dirname, 'language.txt');
let currentLang = 'EN';

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

function loadLanguage() {
  try {
    if (fs.existsSync(langFilePath)) {
      const content = fs.readFileSync(langFilePath, 'utf8').trim().toUpperCase();
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
  try {
    fs.writeFileSync(langFilePath, lang, 'utf8');
  } catch (err) {
    console.warn('Language write error:', err);
  }
}

function applyUI() {
  const dict = i18n[currentLang] || i18n.EN;

  document.getElementById('title-settings').textContent = dict.title;
  document.getElementById('sub-settings').textContent = dict.sub;
  document.getElementById('lbl-lang').textContent = dict.lblLang;
  document.getElementById('desc-lang').textContent = dict.descLang;
  document.getElementById('lbl-beta').textContent = dict.lblBeta;
  document.getElementById('desc-beta').textContent = dict.descBeta;
  document.getElementById('lbl-audio').textContent = dict.lblAudio;
  document.getElementById('btn-cancel').textContent = dict.btnCancel;
  document.getElementById('btn-save').textContent = dict.btnSave;
  document.getElementById('save-msg').textContent = dict.saved;

  const selectLang = document.getElementById('select-lang');
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
