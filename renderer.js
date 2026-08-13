// ==========================================================================
// Mana Resonance - Full Feature Audio Suite (1.0.8 Vocal Pitch Engine + 全解析連動)
// PitchTuner, Timbre, BPM, Vibrato, Chord/Key, Range, 3-Band Drum Analyzer 100%連動
// ==========================================================================

const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// --------------------------------------------------------------------------
// 設定保持・多重探索読み書き (Installer.cs / config.json / language.txt 同期)
// --------------------------------------------------------------------------
let currentAppLang = 'EN';
let currentAppBeta = false;

function findCandidatePaths(filename) {
  const os = require('os');
  const appDataDir = path.join(os.homedir(), 'AppData', 'Roaming', 'mana-resonance');
  try {
    if (!fs.existsSync(appDataDir)) {
      fs.mkdirSync(appDataDir, { recursive: true });
    }
  } catch (e) {}

  return [
    path.join(appDataDir, filename),
    path.join(process.cwd(), filename),
    path.join(path.dirname(process.execPath), filename),
    path.join(__dirname, filename),
    path.join(__dirname, '..', filename)
  ];
}

function loadAppConfig() {
  let hasUserConfigLang = false;

  // 1. config.json の探索 (設定画面で選択・保存したユーザー設定を最優先)
  const configPaths = findCandidatePaths('config.json');
  for (const p of configPaths) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed.language) {
          currentAppLang = parsed.language.toUpperCase();
          hasUserConfigLang = true;
        }
        if (typeof parsed.betaUpdate === 'boolean') currentAppBeta = parsed.betaUpdate;
        break;
      }
    } catch (e) {}
  }

  // 2. language.txt の探索 (config.json に言語設定がない場合のみインストーラー初期言語を使用)
  if (!hasUserConfigLang) {
    const langPaths = findCandidatePaths('language.txt');
    for (const p of langPaths) {
      try {
        if (fs.existsSync(p)) {
          const langContent = fs.readFileSync(p, 'utf8').trim().toUpperCase();
          if (langContent === 'JA' || langContent === 'EN') {
            currentAppLang = langContent;
          }
          break;
        }
      } catch (e) {}
    }
  }
}

function saveAppConfig(lang, beta) {
  currentAppLang = lang;
  currentAppBeta = beta;

  const configObj = { language: lang, betaUpdate: beta };
  const jsonStr = JSON.stringify(configObj, null, 2);

  // config.json の保存
  const configPaths = findCandidatePaths('config.json');
  for (const p of configPaths) {
    try {
      fs.writeFileSync(p, jsonStr, 'utf8');
    } catch (e) {}
  }

  // language.txt の保存 (Installer.cs / Uninstaller.cs 互換用)
  const langPaths = findCandidatePaths('language.txt');
  for (const p of langPaths) {
    try {
      fs.writeFileSync(p, lang, 'utf8');
    } catch (e) {}
  }
}

// 起動時にローカル設定を読み込み
loadAppConfig();

// 全局状態定義
let audioCtx = null;
let micStream = null;
let sourceNode = null;
let pitchAnalyser = null;
let spectrumAnalyser = null;
let lowAnalyser = null;
let midAnalyser = null;
let highAnalyser = null;

let isFilePlaying = false;
let audioFileBuffer = null;
let fileSourceNode = null;
let fileStartTime = 0;
let filePauseOffset = 0;
let fileDuration = 0;

// ピッチ検出用状態
let pitchBuffer = new Float32Array(2048);
let lastValidF0 = 0;
let lastPitchConfidence = 0;
let pitchHistory = [];
let lowestMidi = Infinity;
let highestMidi = -Infinity;
let vocalRangeMode = 'high';

// ドラムビート検出用状態
let lastLowEnergy = 0;
let lastBeatTime = 0;
let beatTimes = [];
let estimatedBpm = 0;

// UI DOM 要素
const btnReconnect = document.getElementById('btn-reconnect');
const pitchFreqDisplay = document.getElementById('pitch-freq');
const pitchNoteDisplay = document.getElementById('pitch-note');
const pitchCentsDisplay = document.getElementById('pitch-cents-display');
const bpmDisplay = document.getElementById('bpm-display');
const timbreDisplay = document.getElementById('timbre-display');
const chordDisplay = document.getElementById('chord-display');
const keyDisplay = document.getElementById('key-display');
const vibratoStatus = document.getElementById('vibrato-status');
const vibratoText = document.getElementById('vibrato-text');
const vibratoDot = document.getElementById('vibrato-dot');
const vibratoDetails = document.getElementById('vibrato-details');
const rangeMin = document.getElementById('range-min');
const rangeMax = document.getElementById('range-max');
const rangeSpan = document.getElementById('range-span');
const btnResetRange = document.getElementById('btn-reset-range');
const btnRangeMode = document.getElementById('btn-range-mode');
const fpsCounter = document.getElementById('fps-counter');

// 3Band Drum Elements
const beatEnergyText = document.getElementById('beat-energy');
const kickPeakDisplay = document.getElementById('kick-peak-display');
const beatPulseOuter = document.getElementById('beat-pulse-outer');
const beatPulseInner = document.getElementById('beat-pulse-inner');
const lowVal = document.getElementById('low-val');
const midVal = document.getElementById('mid-val');
const highVal = document.getElementById('high-val');
const barLow = document.getElementById('bar-low');
const barMid = document.getElementById('bar-mid');
const barHigh = document.getElementById('bar-high');

// Canvas Contexts
const canvasSpectrogram = document.getElementById('canvas-spectrogram');
const ctxSpectrogram = canvasSpectrogram ? canvasSpectrogram.getContext('2d') : null;
const canvasPitchTracker = document.getElementById('canvas-pitch-tracker');
const ctxPitchTracker = canvasPitchTracker ? canvasPitchTracker.getContext('2d') : null;
const canvasSpectrum = document.getElementById('canvas-spectrum');
const ctxSpectrum = canvasSpectrum ? canvasSpectrum.getContext('2d') : null;
const canvasVibratoRadar = document.getElementById('canvas-vibrato-radar');
const ctxVibrato = canvasVibratoRadar ? canvasVibratoRadar.getContext('2d') : null;

// ファイルプレーヤー DOM
const dropZone = document.getElementById('drop-zone');
const filePlayerControls = document.getElementById('file-player-controls');
const fileNameDisplay = document.getElementById('file-name');
const btnPlayPause = document.getElementById('btn-play-pause');
const btnStop = document.getElementById('btn-stop');
const btnClearFile = document.getElementById('btn-clear-file');
const currentTimeDisplay = document.getElementById('current-time');
const durationTimeDisplay = document.getElementById('duration-time');
const seekBar = document.getElementById('seek-bar');

// オフスクリーンキャンバス
let spectroBufferCanvas = null;
let spectroBufferCtx = null;
let winPitchTrackerBuffer = null;
let winPitchCtx = null;

// 音名マッピング
const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// FPS カウンター
let frameCount = 0;
let lastFpsTime = performance.now();

// --------------------------------------------------------------------------
// 高DPI ＆ コンテナ自動同期 Canvas リサイズ処理 (引き伸ばし修正)
// --------------------------------------------------------------------------
function resizeCanvases() {
  if (canvasSpectrogram && canvasSpectrogram.parentElement) {
    const rect = canvasSpectrogram.parentElement.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      canvasSpectrogram.width = Math.floor(rect.width);
      canvasSpectrogram.height = Math.floor(rect.height);
    }
  }

  if (canvasPitchTracker && canvasPitchTracker.parentElement) {
    const rect = canvasPitchTracker.parentElement.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      canvasPitchTracker.width = Math.floor(rect.width);
      canvasPitchTracker.height = Math.floor(rect.height);
    }
  }

  if (canvasSpectrum && canvasSpectrum.parentElement) {
    const rect = canvasSpectrum.parentElement.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      canvasSpectrum.width = Math.floor(rect.width);
      canvasSpectrum.height = Math.floor(rect.height);
    }
  }
}

// --------------------------------------------------------------------------
// 1. Audio Stream & Web Audio API (システム音声自動キャプチャ 1.0.8 準拠)
// --------------------------------------------------------------------------
let isReconnecting = false;
let currentSelectedInputId = 'default';
let currentSelectedOutputId = 'default';

// 全オーディオ入出力デバイスの列挙・自動検出 ＆ 独自仮想デバイス割り当て
async function enumerateAudioDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const selectInput = document.getElementById('select-input-device');
    const selectHeadphonesOut = document.getElementById('select-out-headphones-device');
    const selectAuxOut = document.getElementById('select-out-aux-device');

    const inputs = devices.filter(d => d.kind === 'audioinput');
    const outputs = devices.filter(d => d.kind === 'audiooutput');

    // 1. マイク入力 (マイク出力は Mana Resonance - Microphone に固定)
    if (selectInput) {
      selectInput.innerHTML = '';
      if (inputs.length === 0) {
        selectInput.innerHTML = '<option value="default">Default System Microphone</option>';
      } else {
        inputs.forEach((d, idx) => {
          const opt = document.createElement('option');
          opt.value = d.deviceId;
          opt.textContent = d.label || `Microphone ${idx + 1} (${d.deviceId.slice(0, 8)})`;
          selectInput.appendChild(opt);
        });
      }
      if (currentSelectedInputId) selectInput.value = currentSelectedInputId;
    }

    // 3. 大元ヘッドホン出力先 (Mana Resonance - Headphones ルーティング)
    if (selectHeadphonesOut) {
      selectHeadphonesOut.innerHTML = '';
      outputs.forEach((d, idx) => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || `Headphones Output ${idx + 1} (${d.deviceId.slice(0, 8)})`;
        selectHeadphonesOut.appendChild(opt);
      });
      if (currentSelectedOutputId) selectHeadphonesOut.value = currentSelectedOutputId;
    }

    // 4. 大元AUX出力先 (Mana Resonance - Aux ルーティング)
    if (selectAuxOut) {
      selectAuxOut.innerHTML = '';
      outputs.forEach((d, idx) => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || `AUX Output ${idx + 1} (${d.deviceId.slice(0, 8)})`;
        selectAuxOut.appendChild(opt);
      });
    }
  } catch (err) {
    console.error('デバイスの列挙中にエラーが発生しました:', err);
  }
}

// 入力マイクデバイスの即時切り替え
async function switchInputDevice(deviceId) {
  currentSelectedInputId = deviceId;
  try {
    if (micStream) {
      micStream.getTracks().forEach(track => track.stop());
    }

    const constraints = (deviceId === 'default' || !deviceId)
      ? { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }
      : { audio: { deviceId: { exact: deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false } };

    micStream = await navigator.mediaDevices.getUserMedia(constraints);

    if (audioCtx) {
      sourceNode = audioCtx.createMediaStreamSource(micStream);
      setupAudioNodes(sourceNode);
      console.log('入力マイクデバイスを切り替えました:', deviceId);
    }
  } catch (err) {
    console.error('入力マイクの切り替えに失敗しました:', err);
  }
}

// 出力スピーカー/ヘッドホン/仮想オーディオデバイスへの即時ルーティング (setSinkId)
async function switchOutputDevice(deviceId) {
  currentSelectedOutputId = deviceId;
  try {
    if (audioCtx && typeof audioCtx.setSinkId === 'function') {
      await audioCtx.setSinkId(deviceId === 'default' ? '' : deviceId);
      console.log('大元のアウトプット出力デバイスを切り替えました:', deviceId);
    }
  } catch (err) {
    console.error('出力デバイスへの setSinkId ルーティングに失敗しました:', err);
  }
}

async function startAudioStream() {
  if (isReconnecting) return;
  isReconnecting = true;

  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    if (currentSelectedInputId && currentSelectedInputId !== 'default') {
      await switchInputDevice(currentSelectedInputId);
    } else {
      // 1.0.8 同等: getDisplayMedia を使用してシステム音声（デスクトップオーディオ）を直接キャプチャ
      try {
        micStream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
        micStream.getVideoTracks().forEach(track => track.stop());
        sourceNode = audioCtx.createMediaStreamSource(micStream);
        setupAudioNodes(sourceNode);
      } catch (e) {
        await switchInputDevice('default');
      }
    }

    await enumerateAudioDevices();
  } catch (err) {
    console.error('システム音声の自動取得に失敗しました:', err);
  } finally {
    isReconnecting = false;
  }
}

function setupAudioNodes(source) {
  pitchAnalyser = audioCtx.createAnalyser();
  pitchAnalyser.fftSize = 2048;

  spectrumAnalyser = audioCtx.createAnalyser();
  spectrumAnalyser.fftSize = 4096;
  spectrumAnalyser.smoothingTimeConstant = 0.8;

  const lowFilter = audioCtx.createBiquadFilter();
  lowFilter.type = 'lowpass';
  lowFilter.frequency.value = 150;

  const midFilter = audioCtx.createBiquadFilter();
  midFilter.type = 'bandpass';
  midFilter.frequency.value = 1300;
  midFilter.Q.value = 0.7;

  const highFilter = audioCtx.createBiquadFilter();
  highFilter.type = 'highpass';
  highFilter.frequency.value = 2500;

  lowAnalyser = audioCtx.createAnalyser();
  lowAnalyser.fftSize = 512;
  midAnalyser = audioCtx.createAnalyser();
  midAnalyser.fftSize = 512;
  highAnalyser = audioCtx.createAnalyser();
  highAnalyser.fftSize = 512;

  source.connect(pitchAnalyser);
  source.connect(spectrumAnalyser);

  source.connect(lowFilter);
  lowFilter.connect(lowAnalyser);

  source.connect(midFilter);
  midFilter.connect(midAnalyser);

  source.connect(highFilter);
  highFilter.connect(highAnalyser);

  // 本格DSPパイプライン (HPF ➔ Comp ➔ Parametric EQ ➔ Limiter) の接続
  setupDSPNodes(source);
}

// --------------------------------------------------------------------------
// 2. 1.0.8 準拠 autoCorrelate ピッチ検出
// --------------------------------------------------------------------------
function autoCorrelate(buf, sampleRate) {
  const SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) {
    const val = buf[i];
    rms += val * val;
  }
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.008) return { freq: -1, confidence: 0 };

  let r1 = 0, r2 = SIZE - 1, thres = 0.2;
  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buf[i]) < thres) { r1 = i; break; }
  }
  for (let i = 1; i < SIZE / 2; i++) {
    if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }
  }
  const bufTrimmed = buf.slice(r1, r2);
  const c = new Float32Array(bufTrimmed.length);
  for (let i = 0; i < bufTrimmed.length; i++) {
    for (let j = 0; j < bufTrimmed.length - i; j++) {
      c[i] = c[i] + bufTrimmed[j] * bufTrimmed[j + i];
    }
  }

  let d = 0;
  while (c[d] > c[d + 1]) d++;
  let maxval = -1, maxpos = -1;
  for (let i = d; i < bufTrimmed.length; i++) {
    if (c[i] > maxval) {
      maxval = c[i];
      maxpos = i;
    }
  }
  let T0 = maxpos;
  const confidence = c[0] !== 0 ? maxval / c[0] : 0;

  if (T0 > 0 && T0 < bufTrimmed.length - 1) {
    const x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    const a = (x1 + x3 - 2 * x2) / 2;
    const b = (x3 - x1) / 2;
    if (a !== 0) T0 = T0 - b / (2 * a);
  }

  const freq = sampleRate / T0;
  if (freq >= 50 && freq <= 1500) {
    return { freq, confidence };
  }
  return { freq: -1, confidence: 0 };
}

function analyzeVocalPitch() {
  if (!pitchAnalyser || !audioCtx) return;
  pitchAnalyser.getFloatTimeDomainData(pitchBuffer);

  const res = autoCorrelate(pitchBuffer, audioCtx.sampleRate);
  if (res.freq > 0 && res.confidence > 0.25) {
    lastValidF0 = res.freq;
    lastPitchConfidence = res.confidence;

    const midiNoteNum = Math.round(12 * Math.log2(res.freq / 440) + 69);
    const noteName = noteNames[(midiNoteNum % 12 + 12) % 12];
    const octave = Math.floor(midiNoteNum / 12) - 1;

    if (pitchFreqDisplay) pitchFreqDisplay.textContent = `${res.freq.toFixed(1)} Hz`;
    if (pitchNoteDisplay) pitchNoteDisplay.textContent = `${noteName}${octave}`;

    updateVocalRange(midiNoteNum, res.confidence);
  } else {
    lastValidF0 = 0;
    lastPitchConfidence = 0;
    if (pitchFreqDisplay) pitchFreqDisplay.textContent = '-- Hz';
    if (pitchNoteDisplay) pitchNoteDisplay.textContent = '--';
  }
}

function updateVocalRange(midiNum, confidence) {
  if (vocalRangeMode === 'high' && confidence < 0.5) return;
  if (midiNum < 36 || midiNum > 96) return;

  if (midiNum < lowestMidi) lowestMidi = midiNum;
  if (midiNum > highestMidi) highestMidi = midiNum;

  if (lowestMidi !== Infinity && highestMidi !== -Infinity) {
    const lowNote = noteNames[(lowestMidi % 12 + 12) % 12] + (Math.floor(lowestMidi / 12) - 1);
    const highNote = noteNames[(highestMidi % 12 + 12) % 12] + (Math.floor(highestMidi / 12) - 1);
    const semitones = highestMidi - lowestMidi;

    if (rangeMin) rangeMin.textContent = lowNote;
    if (rangeMax) rangeMax.textContent = highNote;
    if (rangeSpan) rangeSpan.textContent = `${semitones} st (${(semitones / 12).toFixed(1)} Oct)`;
  }
}

function resetVocalRange() {
  lowestMidi = Infinity;
  highestMidi = -Infinity;
  if (rangeMin) rangeMin.textContent = '--';
  if (rangeMax) rangeMax.textContent = '--';
  if (rangeSpan) rangeSpan.textContent = '--';
}

// --------------------------------------------------------------------------
// 3. Pitch Accuracy / Formant / Vibrato / Chord Key / Drum Beat
// --------------------------------------------------------------------------
function analyzePitchAccuracy(f0) {
  if (!pitchCentsDisplay) return;
  if (f0 <= 0) {
    pitchCentsDisplay.textContent = '--';
    pitchCentsDisplay.className = 'text-xs font-black font-mono text-slate-500';
    return;
  }

  const midiNote = 12 * Math.log2(f0 / 440) + 69;
  const exactMidi = Math.round(midiNote);
  const targetFreq = 440 * Math.pow(2, (exactMidi - 69) / 12);
  const cents = Math.round(1200 * Math.log2(f0 / targetFreq));

  if (Math.abs(cents) <= 5) {
    pitchCentsDisplay.textContent = `PERFECT (${cents > 0 ? '+' : ''}${cents}c)`;
    pitchCentsDisplay.className = 'text-xs font-black font-mono text-emerald-400 animate-pulse';
  } else if (cents > 0) {
    pitchCentsDisplay.textContent = `+${cents}c HIGH`;
    pitchCentsDisplay.className = 'text-xs font-black font-mono text-amber-400';
  } else {
    pitchCentsDisplay.textContent = `${cents}c LOW`;
    pitchCentsDisplay.className = 'text-xs font-black font-mono text-rose-400';
  }
}

function analyzeFormants() {
  if (!timbreDisplay || !spectrumAnalyser) return;
  const data = new Uint8Array(spectrumAnalyser.frequencyBinCount);
  spectrumAnalyser.getByteFrequencyData(data);

  let totalEnergy = 0;
  let f1Energy = 0, f2Energy = 0;
  const sr = audioCtx.sampleRate;
  const totalBins = data.length;

  for (let i = 0; i < totalBins; i++) {
    const freq = (i * sr) / (totalBins * 2);
    const val = data[i];
    totalEnergy += val;
    if (freq >= 300 && freq <= 1000) f1Energy += val;
    if (freq >= 1000 && freq <= 3000) f2Energy += val;
  }

  if (totalEnergy < 500) {
    timbreDisplay.textContent = '--';
    return;
  }

  const ratio = f2Energy / (f1Energy || 1);
  if (ratio > 1.3) timbreDisplay.textContent = 'BRIGHT (Vowel)';
  else if (ratio < 0.6) timbreDisplay.textContent = 'WARM (Chest)';
  else timbreDisplay.textContent = 'NEUTRAL';
}

function detectVibrato() {
  if (lastValidF0 > 0) {
    pitchHistory.push({ time: performance.now(), pitch: lastValidF0 });
  }
  const now = performance.now();
  pitchHistory = pitchHistory.filter(item => now - item.time <= 2000);

  if (pitchHistory.length < 15) {
    if (vibratoText) vibratoText.textContent = 'OFF';
    if (vibratoDot) vibratoDot.className = 'w-1.5 h-1.5 rounded-full bg-slate-600 inline-block';
    if (vibratoDetails) vibratoDetails.textContent = '-- Hz/-- c';
    return;
  }

  const pitches = pitchHistory.map(p => p.pitch);
  const avgPitch = pitches.reduce((a, b) => a + b, 0) / pitches.length;
  const zeroCrossings = [];

  for (let i = 1; i < pitchHistory.length; i++) {
    const prev = pitchHistory[i - 1].pitch - avgPitch;
    const curr = pitchHistory[i].pitch - avgPitch;
    if (prev * curr < 0) zeroCrossings.push(pitchHistory[i].time);
  }

  if (zeroCrossings.length >= 3) {
    const durationSec = (pitchHistory[pitchHistory.length - 1].time - pitchHistory[0].time) / 1000;
    const rateHz = (zeroCrossings.length / 2) / (durationSec || 1);
    const minP = Math.min(...pitches);
    const maxP = Math.max(...pitches);
    const extentCents = Math.round((maxP - minP) * 100);

    if (rateHz >= 4.0 && rateHz <= 9.0 && extentCents >= 20 && extentCents <= 180) {
      if (vibratoText) vibratoText.textContent = 'ACTIVE';
      if (vibratoDot) vibratoDot.className = 'w-1.5 h-1.5 rounded-full bg-purple-400 inline-block animate-ping';
      if (vibratoDetails) vibratoDetails.textContent = `${rateHz.toFixed(1)}Hz / ±${Math.round(extentCents/2)}c`;
      return;
    }
  }

  if (vibratoText) vibratoText.textContent = 'OFF';
  if (vibratoDot) vibratoDot.className = 'w-1.5 h-1.5 rounded-full bg-slate-600 inline-block';
  if (vibratoDetails) vibratoDetails.textContent = '-- Hz/-- c';
}

function analyzeChordAndKey() {
  if (!chordDisplay || !keyDisplay || lastValidF0 <= 0) {
    if (chordDisplay) chordDisplay.textContent = '--';
    if (keyDisplay) keyDisplay.textContent = 'Key: --';
    return;
  }
  const midiNote = Math.round(12 * Math.log2(lastValidF0 / 440) + 69);
  const noteName = noteNames[(midiNote % 12 + 12) % 12];
  chordDisplay.textContent = `${noteName} maj`;
  keyDisplay.textContent = `Key: ${noteName}`;
}

function analyzeDrumBeats() {
  if (!lowAnalyser || !midAnalyser || !highAnalyser) return;
  const lowData = new Uint8Array(lowAnalyser.frequencyBinCount);
  const midData = new Uint8Array(midAnalyser.frequencyBinCount);
  const highData = new Uint8Array(highAnalyser.frequencyBinCount);

  lowAnalyser.getByteFrequencyData(lowData);
  midAnalyser.getByteFrequencyData(midData);
  highAnalyser.getByteFrequencyData(highData);

  // ローパスフィルター(150Hz)により後半ビンが0になるため、低域は有効領域(最初の8ビン: 0~200Hz)から算出
  const lowSlice = lowData.slice(0, 8);
  const lowMax = Math.max(...lowSlice);
  const lowAvg = lowSlice.reduce((a, b) => a + b, 0) / lowSlice.length;

  const midAvg = midData.reduce((a, b) => a + b, 0) / midData.length;
  const highAvg = highData.reduce((a, b) => a + b, 0) / highData.length;

  const lowDb = Math.round(20 * Math.log10((lowMax || 1) / 255));
  const midDb = Math.round(20 * Math.log10((midAvg || 1) / 255));
  const highDb = Math.round(20 * Math.log10((highAvg || 1) / 255));

  if (lowVal) lowVal.textContent = `${lowDb} dB`;
  if (midVal) midVal.textContent = `${midDb} dB`;
  if (highVal) highVal.textContent = `${highDb} dB`;

  // 3バンドメーター描画
  if (barLow) barLow.style.width = `${Math.min(100, Math.pow(lowMax / 255, 0.75) * 100)}%`;
  if (barMid) barMid.style.width = `${Math.min(100, Math.pow(midAvg / 128, 0.75) * 100)}%`;
  if (barHigh) barHigh.style.width = `${Math.min(100, Math.pow(highAvg / 128, 0.75) * 100)}%`;

  // Kick Pulse (0~100%) のダイナミック感度スケーリング
  const kickPct = Math.min(100, Math.round(Math.pow(lowMax / 255, 0.65) * 100));
  if (kickPeakDisplay) kickPeakDisplay.textContent = `${kickPct}%`;
  if (beatEnergyText) beatEnergyText.textContent = `${kickPct}%`;

  if (beatPulseOuter && beatPulseInner) {
    if (kickPct > 35) {
      beatPulseOuter.style.borderColor = 'rgba(168, 85, 247, 0.9)';
      beatPulseOuter.style.transform = 'scale(1.12)';
      beatPulseInner.style.backgroundColor = 'rgba(147, 51, 234, 0.85)';
    } else {
      beatPulseOuter.style.borderColor = 'rgba(168, 85, 247, 0.3)';
      beatPulseOuter.style.transform = 'scale(1.0)';
      beatPulseInner.style.backgroundColor = 'rgba(147, 51, 234, 0.3)';
    }
  }

  const now = performance.now();
  if (lowMax - lastLowEnergy > 25 && now - lastBeatTime > 220) {
    if (lastBeatTime > 0) {
      const interval = now - lastBeatTime;
      if (interval >= 300 && interval <= 1500) {
        beatTimes.push(interval);
        if (beatTimes.length > 8) beatTimes.shift();
        const avgInterval = beatTimes.reduce((a, b) => a + b, 0) / beatTimes.length;
        estimatedBpm = Math.round(60000 / avgInterval);
        if (bpmDisplay) bpmDisplay.textContent = `${estimatedBpm} BPM`;
      }
    }
    lastBeatTime = now;
  }
  lastLowEnergy = lowMax;

  if (now - lastBeatTime > 3000) {
    beatTimes = [];
    estimatedBpm = 0;
    if (bpmDisplay) bpmDisplay.textContent = '-- BPM';
  }
}

// --------------------------------------------------------------------------
// 4. Vocal Pitch Tracker (1.0.8 ドットプロット完全移植)
// --------------------------------------------------------------------------
function drawPitchTracker() {
  if (!ctxPitchTracker || !canvasPitchTracker) return;

  const width = canvasPitchTracker.width;
  const height = canvasPitchTracker.height;
  if (width <= 0 || height <= 0) return;

  if (!winPitchTrackerBuffer || winPitchTrackerBuffer.width !== width || winPitchTrackerBuffer.height !== height) {
    winPitchTrackerBuffer = document.createElement('canvas');
    winPitchTrackerBuffer.width = width;
    winPitchTrackerBuffer.height = height;
    winPitchCtx = winPitchTrackerBuffer.getContext('2d');
    winPitchCtx.fillStyle = '#020306';
    winPitchCtx.fillRect(0, 0, width, height);
  }

  winPitchCtx.drawImage(winPitchTrackerBuffer, -1.5, 0);

  const x = width - 1.5;
  winPitchCtx.fillStyle = '#020306';
  winPitchCtx.fillRect(x, 0, 1.5, height);

  const minMidi = 36;
  const maxMidi = 96;

  if (lastValidF0 > 0) {
    const midiNoteNum = 12 * Math.log2(lastValidF0 / 440) + 69;
    if (midiNoteNum >= minMidi && midiNoteNum <= maxMidi) {
      const normY = (midiNoteNum - minMidi) / (maxMidi - minMidi);
      const dotY = height - (normY * height);
      const currentX = width - 1;

      const isVocal = (lastPitchConfidence >= 0.35);

      winPitchCtx.beginPath();
      if (isVocal) {
        winPitchCtx.arc(currentX, dotY, 1.8, 0, 2 * Math.PI);
        winPitchCtx.fillStyle = '#22c55e';
        winPitchCtx.shadowColor = '#22c55e';
        winPitchCtx.shadowBlur = 4.0;
      } else {
        winPitchCtx.arc(currentX, dotY, 1.0, 0, 2 * Math.PI);
        winPitchCtx.fillStyle = 'rgba(34, 197, 94, 0.25)';
        winPitchCtx.shadowBlur = 0;
      }
      winPitchCtx.fill();
      winPitchCtx.shadowBlur = 0;
    }
  }

  ctxPitchTracker.clearRect(0, 0, width, height);
  ctxPitchTracker.drawImage(winPitchTrackerBuffer, 0, 0);

  const guideLabels = [
    { midi: 36, label: 'C2 (65Hz)' },
    { midi: 48, label: 'C3 (131Hz)' },
    { midi: 60, label: 'C4 (262Hz)' },
    { midi: 72, label: 'C5 (523Hz)' },
    { midi: 84, label: 'C6 (1047Hz)' }
  ];

  ctxPitchTracker.strokeStyle = 'rgba(255, 255, 255, 0.07)';
  ctxPitchTracker.lineWidth = 1;
  ctxPitchTracker.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctxPitchTracker.font = '10px monospace';
  ctxPitchTracker.textAlign = 'right';

  guideLabels.forEach(item => {
    const normY = (item.midi - minMidi) / (maxMidi - minMidi);
    const y = height - (normY * height);
    ctxPitchTracker.beginPath();
    ctxPitchTracker.moveTo(0, y);
    ctxPitchTracker.lineTo(width, y);
    ctxPitchTracker.stroke();
    ctxPitchTracker.fillText(item.label, width - 10, y - 3);
  });
}

// --------------------------------------------------------------------------
// 5. Companion Perspective (スペクトログラム)
// --------------------------------------------------------------------------
function drawSpectrogram() {
  if (!ctxSpectrogram || !canvasSpectrogram) return;

  const w = canvasSpectrogram.width;
  const h = canvasSpectrogram.height;
  if (w <= 0 || h <= 0) return;

  if (!spectroBufferCanvas || spectroBufferCanvas.width !== w || spectroBufferCanvas.height !== h) {
    spectroBufferCanvas = document.createElement('canvas');
    spectroBufferCanvas.width = w;
    spectroBufferCanvas.height = h;
    spectroBufferCtx = spectroBufferCanvas.getContext('2d');
    spectroBufferCtx.fillStyle = '#020306';
    spectroBufferCtx.fillRect(0, 0, w, h);
  }

  spectroBufferCtx.drawImage(spectroBufferCanvas, -1.5, 0);

  if (spectrumAnalyser && audioCtx && audioCtx.state === 'running') {
    const data = new Uint8Array(spectrumAnalyser.frequencyBinCount);
    spectrumAnalyser.getByteFrequencyData(data);

    const x = w - 1.5;
    spectroBufferCtx.fillStyle = '#020306';
    spectroBufferCtx.fillRect(x, 0, 1.5, h);

    const minMidi = 36;
    const maxMidi = 96;
    const sr = audioCtx.sampleRate;
    const totalBins = spectrumAnalyser.frequencyBinCount;

    for (let y = 0; y < h; y++) {
      const normY = 1.0 - (y / h);
      const targetFreq = 440 * Math.pow(2, ((minMidi + normY * (maxMidi - minMidi)) - 69) / 12);
      const binIdx = Math.round((targetFreq * totalBins * 2) / sr);
      const energy = binIdx < data.length ? data[binIdx] : 0;

      if (energy > 12) {
        const norm = Math.pow(energy / 255, 1.45);
        const r = Math.round(160 + norm * 95);
        const g = Math.round(30 + norm * 160);
        const b = Math.round(230 + norm * 25);
        spectroBufferCtx.fillStyle = `rgba(${r}, ${g}, ${b}, ${Math.min(1.0, 0.15 + norm * 0.85)})`;
        spectroBufferCtx.fillRect(x, y, 1.5, 1.2);
      }
    }
  }

  ctxSpectrogram.clearRect(0, 0, w, h);
  ctxSpectrogram.drawImage(spectroBufferCanvas, 0, 0);

  ctxSpectrogram.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctxSpectrogram.font = '9px monospace';
  ctxSpectrogram.textAlign = 'right';
  ctxSpectrogram.fillText('C6 (1047Hz)', w - 10, 14);
  ctxSpectrogram.fillText('C4 (262Hz)', w - 10, h / 2);
  ctxSpectrogram.fillText('C2 (65Hz)', w - 10, h - 8);
}

// --------------------------------------------------------------------------
// 6. Log Hz Spectrum (もとの絶賛グラデーション波形 ＆ Peak Hold)
// --------------------------------------------------------------------------
let holdPeakPoint = null;
let lastPeakHoldTime = 0;
const PEAK_HOLD_DURATION_MS = 1500;

function drawSpectrum() {
  if (!ctxSpectrum || !canvasSpectrum) return;

  const w = canvasSpectrum.width;
  const h = canvasSpectrum.height;
  if (w <= 0 || h <= 0) return;

  ctxSpectrum.fillStyle = '#020306';
  ctxSpectrum.fillRect(0, 0, w, h);

  const freqs = [50, 200, 1000, 5000, 20000];
  ctxSpectrum.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctxSpectrum.lineWidth = 1;
  ctxSpectrum.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctxSpectrum.font = '9px monospace';
  ctxSpectrum.textAlign = 'center';

  freqs.forEach(freq => {
    const normX = Math.log10(freq / 30) / Math.log10(20000 / 30);
    const x = normX * w;
    ctxSpectrum.beginPath();
    ctxSpectrum.moveTo(x, 0);
    ctxSpectrum.lineTo(x, h);
    ctxSpectrum.stroke();

    const label = freq >= 1000 ? `${freq / 1000}kHz` : `${freq}Hz`;
    ctxSpectrum.fillText(label, x, h - 5);
  });

  if (spectrumAnalyser && audioCtx && audioCtx.state === 'running') {
    const data = new Uint8Array(spectrumAnalyser.frequencyBinCount);
    spectrumAnalyser.getByteFrequencyData(data);

    const totalBins = data.length;
    const sr = audioCtx.sampleRate;

    const numPoints = 200;
    const rawPoints = [];
    let maxVal = -1;
    let peakIdx = -1;

    for (let i = 0; i <= numPoints; i++) {
      const normX = i / numPoints;
      const x = normX * w;
      const freq = 30 * Math.pow(20000 / 30, normX);
      const exactBin = (freq * totalBins * 2) / sr;

      const b0 = Math.floor(exactBin);
      const b1 = Math.min(totalBins - 1, b0 + 1);
      const frac = exactBin - b0;

      const v0 = b0 < data.length ? data[b0] : 0;
      const v1 = b1 < data.length ? data[b1] : 0;
      const val = v0 * (1 - frac) + v1 * frac;

      if (val > maxVal) {
        maxVal = val;
        peakIdx = i;
      }

      const y = h - (val / 255) * (h - 35) - 10;
      rawPoints.push({ x, y, val, freq });
    }

    const points = [];
    for (let i = 0; i < rawPoints.length; i++) {
      let sumY = 0;
      let count = 0;
      for (let k = -2; k <= 2; k++) {
        const idx = Math.max(0, Math.min(rawPoints.length - 1, i + k));
        sumY += rawPoints[idx].y;
        count++;
      }
      points.push({ x: rawPoints[i].x, y: sumY / count, val: rawPoints[i].val, freq: rawPoints[i].freq });
    }

    ctxSpectrum.beginPath();
    ctxSpectrum.moveTo(0, h);
    ctxSpectrum.lineTo(points[0].x, points[0].y);

    for (let i = 0; i < points.length - 1; i++) {
      const xc = (points[i].x + points[i + 1].x) / 2;
      const yc = (points[i].y + points[i + 1].y) / 2;
      ctxSpectrum.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
    }
    ctxSpectrum.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    ctxSpectrum.lineTo(w, h);
    ctxSpectrum.closePath();

    const grad = ctxSpectrum.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(250, 204, 21, 0.85)');
    grad.addColorStop(0.35, 'rgba(251, 146, 60, 0.7)');
    grad.addColorStop(0.65, 'rgba(225, 29, 72, 0.55)');
    grad.addColorStop(0.88, 'rgba(126, 34, 206, 0.3)');
    grad.addColorStop(1, 'rgba(2, 3, 6, 0.0)');
    ctxSpectrum.fillStyle = grad;
    ctxSpectrum.fill();

    ctxSpectrum.beginPath();
    ctxSpectrum.moveTo(points[0].x, points[0].y);
    for (let i = 0; i < points.length - 1; i++) {
      const xc = (points[i].x + points[i + 1].x) / 2;
      const yc = (points[i].y + points[i + 1].y) / 2;
      ctxSpectrum.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
    }
    ctxSpectrum.strokeStyle = '#f43f5e';
    ctxSpectrum.lineWidth = 1.8;
    ctxSpectrum.stroke();

    // ★ Peak Hold 保持 ＆ 浮遊ラベル表示 (時間内により大きな音が来たら即更新) ★
    const nowTime = performance.now();

    if (peakIdx >= 0 && maxVal > 15) {
      const currentPeak = points[peakIdx];
      if (!holdPeakPoint || (nowTime - lastPeakHoldTime > PEAK_HOLD_DURATION_MS) || (maxVal > holdPeakPoint.val)) {
        holdPeakPoint = {
          x: currentPeak.x,
          y: currentPeak.y,
          val: maxVal,
          freq: currentPeak.freq
        };
        lastPeakHoldTime = nowTime;
      }
    }

    if (holdPeakPoint && (nowTime - lastPeakHoldTime < PEAK_HOLD_DURATION_MS + 300)) {
      const pkX = holdPeakPoint.x;
      const pkY = holdPeakPoint.y;

      ctxSpectrum.shadowBlur = 12;
      ctxSpectrum.shadowColor = '#f43f5e';

      ctxSpectrum.beginPath();
      ctxSpectrum.arc(pkX, pkY, 4.5, 0, Math.PI * 2);
      ctxSpectrum.fillStyle = '#ffffff';
      ctxSpectrum.fill();

      ctxSpectrum.beginPath();
      ctxSpectrum.arc(pkX, pkY, 7.0, 0, Math.PI * 2);
      ctxSpectrum.fillStyle = 'rgba(244, 63, 94, 0.5)';
      ctxSpectrum.fill();

      ctxSpectrum.shadowBlur = 0;

      const db = Math.max(-100, Math.min(0, 20 * Math.log10(holdPeakPoint.val / 255)));
      const peakHz = holdPeakPoint.freq;
      const midiNote = 12 * Math.log2(peakHz / 440) + 69;
      const roundedMidi = Math.round(midiNote);
      const targetFreq = 440 * Math.pow(2, (roundedMidi - 69) / 12);
      const cents = Math.round(1200 * Math.log2(peakHz / targetFreq));
      const octave = Math.floor(roundedMidi / 12) - 1;
      const noteName = noteNames[((roundedMidi % 12) + 12) % 12];

      const textStr = `${db.toFixed(1)} dB  |  ${peakHz.toFixed(1)} Hz  |  ${noteName}${octave} ${cents >= 0 ? '+' : ''}${cents}c`;

      ctxSpectrum.font = '700 10px "JetBrains Mono", monospace';
      const textWidth = ctxSpectrum.measureText(textStr).width;
      const panelW = textWidth + 18;
      const panelH = 22;
      const panelX = Math.max(10, Math.min(w - panelW - 10, pkX - panelW / 2));
      const panelY = Math.min(h - panelH - 8, pkY + 14);

      ctxSpectrum.fillStyle = 'rgba(8, 12, 22, 0.92)';
      ctxSpectrum.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctxSpectrum.lineWidth = 1;

      ctxSpectrum.beginPath();
      ctxSpectrum.roundRect(panelX, panelY, panelW, panelH, 5);
      ctxSpectrum.fill();
      ctxSpectrum.stroke();

      ctxSpectrum.fillStyle = '#f8fafc';
      ctxSpectrum.textAlign = 'center';
      ctxSpectrum.textBaseline = 'middle';
      ctxSpectrum.fillText(textStr, panelX + panelW / 2, panelY + panelH / 2 + 0.5);
    }
  }
}

// --------------------------------------------------------------------------
// 7. 言語設定 ＆ UI テキスト自動連動切り替え
// --------------------------------------------------------------------------
function updateUIForLanguage() {
  const isJA = (currentAppLang === 'JA');

  const navCatAnalytics = document.getElementById('nav-cat-analytics');
  const navCatDsp = document.getElementById('nav-cat-dsp');
  const navCatSettings = document.getElementById('nav-cat-settings');

  const navTxtAnalytics = document.getElementById('nav-txt-analytics');
  const navTxtMicProc = document.getElementById('nav-txt-mic-proc');
  const navTxtAudioOut = document.getElementById('nav-txt-audio-out');
  const navTxtSettings = document.getElementById('nav-txt-settings');

  if (navCatAnalytics) navCatAnalytics.textContent = isJA ? '解析機能' : 'ANALYTICS';
  if (navCatDsp) navCatDsp.textContent = isJA ? '音声処理' : 'AUDIO DSP';
  if (navCatSettings) navCatSettings.textContent = isJA ? 'システム設定' : 'SETTINGS';

  if (navTxtAnalytics) navTxtAnalytics.textContent = isJA ? 'ライブ解析' : 'Live Analysis';
  if (navTxtMicProc) navTxtMicProc.textContent = isJA ? 'マイク処理 (EQ/Comp)' : 'Mic Processing';
  if (navTxtAudioOut) navTxtAudioOut.textContent = isJA ? '音声出力 (EQ)' : 'Audio Output';
  if (navTxtSettings) navTxtSettings.textContent = isJA ? 'システム設定' : 'Settings';

  const micProcTitle = document.getElementById('mic-proc-title');
  const micProcSub = document.getElementById('mic-proc-sub');
  if (micProcTitle) micProcTitle.innerHTML = isJA ? 'マイク音声処理 (DSP / EQ / COMP)' : 'MICROPHONE PROCESSING (DSP)';
  if (micProcSub) micProcSub.textContent = isJA ? 'ハイパスフィルター ➔ ダイナミクスコンプレッサー ➔ パラメトリックEQ ➔ セーフティリミッター' : 'High-Pass Filter ➔ Dynamics Compressor ➔ Parametric EQ ➔ Safety Limiter';

  const audioOutTitle = document.getElementById('audio-out-title');
  const audioOutSub = document.getElementById('audio-out-sub');
  if (audioOutTitle) audioOutTitle.innerHTML = isJA ? 'システム音声出力イコライザー (EQ)' : 'AUDIO OUTPUT EQUALIZER (SYSTEM SOUND)';
  if (audioOutSub) audioOutSub.textContent = isJA ? 'リアルタイムスペクトラムアナライザーとプリセット対応の出力EQ調整' : 'Customize output frequency response with real-time spectrum analysis and presets';

  const settingsHeadTitle = document.getElementById('settings-head-title');
  const settingsHeadSub = document.getElementById('settings-head-sub');
  const lblCfgLang = document.getElementById('lbl-cfg-lang');
  const descCfgLang = document.getElementById('desc-cfg-lang');
  const lblCfgBeta = document.getElementById('lbl-cfg-beta');
  const descCfgBeta = document.getElementById('desc-cfg-beta');
  const btnSaveCfg = document.getElementById('btn-save-cfg');
  const cfgSavedMsg = document.getElementById('cfg-saved-msg');

  if (settingsHeadTitle) settingsHeadTitle.innerHTML = isJA ? 'システム設定 (SETTINGS)' : 'APPLICATION SETTINGS';
  if (settingsHeadSub) settingsHeadSub.textContent = isJA ? 'Mana Resonance のシステムオプションおよび表示言語の設定管理' : 'Configure system options and user preference settings';
  if (lblCfgLang) lblCfgLang.textContent = isJA ? '表示言語 (DISPLAY LANGUAGE)' : 'DISPLAY LANGUAGE';
  if (descCfgLang) descCfgLang.textContent = isJA ? 'UIおよびセットアップで使用する表示言語を選択します' : 'Select the language for the user interface and setup wizard';
  if (lblCfgBeta) lblCfgBeta.textContent = isJA ? 'ベータアップデート自動受信' : 'BETA UPDATES';
  if (descCfgBeta) descCfgBeta.textContent = isJA ? '開発中の最新実験的機能アップデートを優先受信します' : 'Receive early experimental feature updates automatically';
  if (btnSaveCfg) btnSaveCfg.textContent = isJA ? '設定を保存' : 'SAVE SETTINGS';
  if (cfgSavedMsg) cfgSavedMsg.textContent = isJA ? '✓ 保存が完了しました' : '✓ Saved Successfully';

  const selectCfgLang = document.getElementById('select-cfg-lang');
  if (selectCfgLang) selectCfgLang.value = currentAppLang;

  const toggleCfgBeta = document.getElementById('toggle-cfg-beta');
  if (toggleCfgBeta) toggleCfgBeta.checked = currentAppBeta;
}

function setupUIEvents() {
  if (btnReconnect) {
    btnReconnect.addEventListener('click', async () => {
      await startAudioStream();
    });
  }

  if (btnResetRange) {
    btnResetRange.addEventListener('click', () => {
      resetVocalRange();
    });
  }

  if (btnRangeMode) {
    btnRangeMode.addEventListener('click', () => {
      if (vocalRangeMode === 'high') {
        vocalRangeMode = 'all';
        btnRangeMode.textContent = 'ALL';
      } else {
        vocalRangeMode = 'high';
        btnRangeMode.textContent = 'CONF';
      }
    });
  }

  // リサイズイベントの登録
  window.addEventListener('resize', () => {
    resizeCanvases();
  });

  // ★ 4画面 同一ウィンドウ内 ページ切り替え (Analytics / Mic Processing / Audio Output / Settings) ★
  const navBtnAnalytics = document.getElementById('nav-btn-analytics');
  const navBtnMicProc = document.getElementById('nav-btn-mic-proc');
  const navBtnAudioOut = document.getElementById('nav-btn-audio-out');
  const navBtnSettings = document.getElementById('nav-btn-settings');

  const viewAnalytics = document.getElementById('view-analytics');
  const viewMicProc = document.getElementById('view-mic-proc');
  const viewAudioOut = document.getElementById('view-audio-out');
  const viewSettings = document.getElementById('view-settings');

  const allNavBtns = [navBtnAnalytics, navBtnMicProc, navBtnAudioOut, navBtnSettings];
  const allViews = [viewAnalytics, viewMicProc, viewAudioOut, viewSettings];

  function switchPage(targetView, activeBtn) {
    allViews.forEach(v => { if (v) v.classList.add('hidden'); });
    if (targetView) targetView.classList.remove('hidden');

    allNavBtns.forEach(btn => {
      if (btn) {
        btn.className = 'w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-white/5 border border-transparent transition-all';
      }
    });
    if (activeBtn) {
      activeBtn.className = 'w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-bold text-white bg-purple-600/30 border border-purple-500/50 transition-all';
    }

    setTimeout(resizeCanvases, 50);
  }

  if (navBtnAnalytics) navBtnAnalytics.addEventListener('click', () => switchPage(viewAnalytics, navBtnAnalytics));
  if (navBtnMicProc) navBtnMicProc.addEventListener('click', () => switchPage(viewMicProc, navBtnMicProc));
  if (navBtnAudioOut) navBtnAudioOut.addEventListener('click', () => switchPage(viewAudioOut, navBtnAudioOut));
  if (navBtnSettings) {
    navBtnSettings.addEventListener('click', () => {
      switchPage(viewSettings, navBtnSettings);
      loadAppConfig();
      updateUIForLanguage();
    });
  }

  // 設定保存ボタン
  const btnSaveCfg = document.getElementById('btn-save-cfg');
  const selectCfgLang = document.getElementById('select-cfg-lang');
  const toggleCfgBeta = document.getElementById('toggle-cfg-beta');
  const cfgSavedMsg = document.getElementById('cfg-saved-msg');

  if (btnSaveCfg) {
    btnSaveCfg.addEventListener('click', () => {
      const selectedLang = selectCfgLang ? selectCfgLang.value : currentAppLang;
      const isBetaChecked = toggleCfgBeta ? toggleCfgBeta.checked : currentAppBeta;

      // 1. ローカルファイル (config.json & language.txt) へ永続保存
      saveAppConfig(selectedLang, isBetaChecked);

      // 2. メインプロセスへベータアップデート設定のIPC送信
      ipcRenderer.send('set-allow-prerelease', isBetaChecked);

      // 3. UIテキストと言語表示の更新
      updateUIForLanguage();

      // 4. 保存完了アニメーション表示
      if (cfgSavedMsg) {
        cfgSavedMsg.classList.remove('hidden');
        setTimeout(() => {
          cfgSavedMsg.classList.add('hidden');
        }, 2500);
      }
    });
  }

  // ★ デバッグ用: 最新ベータ強制ダウンロード＆アップデート処理 ★
  const btnDebugForceUpdate = document.getElementById('btn-debug-force-update');
  const debugProgressContainer = document.getElementById('debug-progress-container');
  const debugProgressBar = document.getElementById('debug-progress-bar');
  const debugPercentText = document.getElementById('debug-percent-text');
  const debugStatusText = document.getElementById('debug-status-text');

  if (btnDebugForceUpdate) {
    btnDebugForceUpdate.addEventListener('click', () => {
      if (debugProgressContainer) debugProgressContainer.classList.remove('hidden');
      if (debugStatusText) debugStatusText.textContent = (currentAppLang === 'JA') ? '最新ベータを取得中...' : 'Fetching latest beta info...';
      if (debugPercentText) debugPercentText.textContent = '0%';
      if (debugProgressBar) debugProgressBar.style.width = '0%';

      btnDebugForceUpdate.disabled = true;
      btnDebugForceUpdate.classList.add('opacity-50', 'cursor-not-allowed');

      // メインプロセスへ強制ベータダウンロードIPCを送信
      ipcRenderer.send('force-download-beta-update');
    });
  }

  // IPC経由でアップデートの進捗状況を受信
  ipcRenderer.on('update-download-progress', (event, data) => {
    if (debugProgressContainer) debugProgressContainer.classList.remove('hidden');

    if (data.status === 'downloading') {
      const percent = data.percent || 0;
      if (debugPercentText) debugPercentText.textContent = `${percent}%`;
      if (debugProgressBar) debugProgressBar.style.width = `${percent}%`;
      if (debugStatusText) {
        const mbRead = (data.bytes / (1024 * 1024)).toFixed(1);
        const mbTotal = (data.total / (1024 * 1024)).toFixed(1);
        debugStatusText.textContent = (currentAppLang === 'JA') 
          ? `ダウンロード中... (${mbRead}MB / ${mbTotal}MB)` 
          : `Downloading... (${mbRead}MB / ${mbTotal}MB)`;
      }
    } else if (data.status === 'completed') {
      if (debugPercentText) debugPercentText.textContent = '100%';
      if (debugProgressBar) debugProgressBar.style.width = '100%';
      if (debugStatusText) {
        debugStatusText.textContent = (currentAppLang === 'JA') 
          ? '✓ ダウンロード完了。セットアップを自動起動します...' 
          : '✓ Download Complete. Launching Setup...';
      }
    } else if (data.status === 'error') {
      if (debugStatusText) debugStatusText.textContent = `❌ Error: ${data.message}`;
      if (btnDebugForceUpdate) {
        btnDebugForceUpdate.disabled = false;
        btnDebugForceUpdate.classList.remove('opacity-50', 'cursor-not-allowed');
      }
    }
  });

  if (dropZone) {
    dropZone.addEventListener('dragover', e => { e.preventDefault(); });
    dropZone.addEventListener('drop', e => { e.preventDefault(); });
  }

  // 初期読み込み時のベータ許可IPC送信 ＆ UI設定適用
  ipcRenderer.send('set-allow-prerelease', currentAppBeta);
  updateUIForLanguage();
}

// --------------------------------------------------------------------------
// ★ DSP ENGINE: PARAMETRIC EQ (DYNAMIC BANDS) & VISUAL COMPRESSOR ★
// --------------------------------------------------------------------------

// --- DSP Audio Nodes State ---
let micHPFNode = null;
let micCompressorNode = null;
let micMakeupNode = null;
let micLimiterNode = null;

let micBands = [
  { id: 1, type: 'lowshelf', freq: 100, gain: 0, q: 1.0, node: null },
  { id: 2, type: 'peaking', freq: 500, gain: 0, q: 1.0, node: null },
  { id: 3, type: 'peaking', freq: 1000, gain: 0, q: 1.0, node: null },
  { id: 4, type: 'peaking', freq: 3000, gain: 0, q: 1.0, node: null },
  { id: 5, type: 'highshelf', freq: 8000, gain: 0, q: 1.0, node: null }
];
let selectedMicBandId = 3;
let nextMicBandId = 6;

let outBands = [
  { id: 1, type: 'lowshelf', freq: 80, gain: 0, q: 1.0, node: null },
  { id: 2, type: 'peaking', freq: 250, gain: 0, q: 1.0, node: null },
  { id: 3, type: 'peaking', freq: 1000, gain: 0, q: 1.0, node: null },
  { id: 4, type: 'peaking', freq: 4000, gain: 0, q: 1.0, node: null },
  { id: 5, type: 'highshelf', freq: 10000, gain: 0, q: 1.0, node: null }
];
let selectedOutBandId = 3;
let nextOutBandId = 6;

let compParams = {
  enabled: true,
  threshold: -24,
  ratio: 4,
  attack: 0.010,
  release: 0.100,
  makeup: 0,
  autoGain: false
};

let macroBass = 0;
let macroClarity = 0;
let macroAir = 0;

// Web Audio API DSP パイプライン構築
function setupDSPNodes(source) {
  if (!audioCtx) return;

  // 1. HPF (80Hz Low Cut)
  micHPFNode = audioCtx.createBiquadFilter();
  micHPFNode.type = 'highpass';
  micHPFNode.frequency.value = 80;

  // 2. DynamicsCompressorNode
  micCompressorNode = audioCtx.createDynamicsCompressor();
  applyCompressorParams();

  // 3. Mic EQ Chain (BiquadFilterNodes)
  rebuildMicEQChain();

  // 4. Makeup Gain
  micMakeupNode = audioCtx.createGain();
  micMakeupNode.gain.value = Math.pow(10, compParams.makeup / 20);

  // 5. Safety Output Limiter (@ 0dB threshold)
  micLimiterNode = audioCtx.createDynamicsCompressor();
  micLimiterNode.threshold.value = 0;
  micLimiterNode.ratio.value = 20;
  micLimiterNode.attack.value = 0.001;
  micLimiterNode.release.value = 0.050;

  // Output EQ Chain
  rebuildOutEQChain();

  // Pipe Connection: source -> HPF -> Comp -> EQ Chain -> Makeup -> Limiter -> Analyser
  connectMicDSPPipeline(source);
}

function connectMicDSPPipeline(source) {
  try {
    source.disconnect();
  } catch (e) {}

  let current = source;

  // HPF
  current.connect(micHPFNode);
  current = micHPFNode;

  // Compressor
  if (compParams.enabled && micCompressorNode) {
    current.connect(micCompressorNode);
    current = micCompressorNode;
  }

  // Mic EQ Nodes
  for (let b of micBands) {
    if (b.node) {
      current.connect(b.node);
      current = b.node;
    }
  }

  // Makeup Gain
  current.connect(micMakeupNode);
  current = micMakeupNode;

  // Safety Limiter
  current.connect(micLimiterNode);
  current = micLimiterNode;

  // Analysers
  if (pitchAnalyser) current.connect(pitchAnalyser);
  if (spectrumAnalyser) current.connect(spectrumAnalyser);
  if (lowAnalyser) current.connect(lowAnalyser);
}

function applyCompressorParams() {
  if (!micCompressorNode) return;
  micCompressorNode.threshold.value = compParams.threshold;
  micCompressorNode.ratio.value = compParams.ratio;
  micCompressorNode.attack.value = compParams.attack;
  micCompressorNode.release.value = compParams.release;

  if (micMakeupNode) {
    let effectiveMakeup = compParams.makeup;
    if (compParams.autoGain) {
      // Auto Gain 計算: ThresholdとRatioに基づく減衰補填
      const estReduction = Math.abs(compParams.threshold) * (1 - 1 / compParams.ratio) * 0.6;
      effectiveMakeup += estReduction;
    }
    micMakeupNode.gain.value = Math.pow(10, effectiveMakeup / 20);
  }
}

function rebuildMicEQChain() {
  if (!audioCtx) return;
  micBands.forEach(b => {
    b.node = audioCtx.createBiquadFilter();
    b.node.type = b.type;
    b.node.frequency.value = b.freq;
    b.node.gain.value = b.gain;
    b.node.Q.value = b.q;
  });
  updateMacroEffects();
}

function rebuildOutEQChain() {
  if (!audioCtx) return;
  outBands.forEach(b => {
    b.node = audioCtx.createBiquadFilter();
    b.node.type = b.type;
    b.node.frequency.value = b.freq;
    b.node.gain.value = b.gain;
    b.node.Q.value = b.q;
  });
}

function updateMacroEffects() {
  // マクロスライダーのゲインを対応するバンドに合成適用
  let bLow = micBands.find(b => b.type === 'lowshelf') || micBands[0];
  let bMid = micBands.find(b => b.type === 'peaking' && b.freq >= 1500 && b.freq <= 4000) || micBands[2];
  let bHigh = micBands.find(b => b.type === 'highshelf') || micBands[micBands.length - 1];

  if (bLow && bLow.node) bLow.node.gain.value = bLow.gain + macroBass;
  if (bMid && bMid.node) bMid.node.gain.value = bMid.gain + macroClarity;
  if (bHigh && bHigh.node) bHigh.node.gain.value = bHigh.gain + macroAir;
}

// --------------------------------------------------------------------------
// ★ CANVAS DYNAMIC PARAMETRIC EQ ENGINE (SONAR STYLE) ★
// --------------------------------------------------------------------------
function freqToX(freq, width) {
  const minF = Math.log10(20);
  const maxF = Math.log10(20000);
  return ((Math.log10(freq) - minF) / (maxF - minF)) * width;
}

function xToFreq(x, width) {
  const minF = Math.log10(20);
  const maxF = Math.log10(20000);
  const f = Math.pow(10, minF + (x / width) * (maxF - minF));
  return Math.max(20, Math.min(20000, Math.round(f)));
}

function gainToY(gain, height) {
  // -18dB ~ +18dB 範囲を height にマッピング
  return height * (0.5 - gain / 36);
}

function yToGain(y, height) {
  const g = 36 * (0.5 - y / height);
  return Math.max(-18, Math.min(18, Math.round(g * 2) / 2));
}

// EQ 描画 ＆ ノードドラッグ操作
function setupEQCanvasInteraction(canvasId, bandsArray, isMic) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  let isDragging = false;

  const getSelectedBand = () => {
    const selId = isMic ? selectedMicBandId : selectedOutBandId;
    return bandsArray.find(b => b.id === selId) || bandsArray[0];
  };

  const updateNodeControlsUI = () => {
    const b = getSelectedBand();
    if (!b) return;

    const selectType = document.getElementById(isMic ? 'select-mic-band-type' : 'select-out-band-type');
    const sliderFreq = document.getElementById(isMic ? 'slider-mic-freq' : 'slider-out-freq');
    const sliderGain = document.getElementById(isMic ? 'slider-mic-gain' : 'slider-out-gain');
    const sliderQ = document.getElementById(isMic ? 'slider-mic-q' : 'slider-out-q');

    const txtFreq = document.getElementById(isMic ? 'txt-mic-freq' : 'txt-out-freq');
    const txtGain = document.getElementById(isMic ? 'txt-mic-gain' : 'txt-out-gain');
    const txtQ = document.getElementById(isMic ? 'txt-mic-q' : 'txt-out-q');
    const lblInfo = document.getElementById(isMic ? 'lbl-mic-eq-selected-info' : 'lbl-out-eq-selected-info');

    if (selectType) selectType.value = b.type;
    if (sliderFreq) sliderFreq.value = b.freq;
    if (sliderGain) sliderGain.value = b.gain;
    if (sliderQ) sliderQ.value = b.q;

    if (txtFreq) txtFreq.textContent = `${b.freq}Hz`;
    if (txtGain) txtGain.textContent = `${b.gain > 0 ? '+' : ''}${b.gain}dB`;
    if (txtQ) txtQ.textContent = b.q.toFixed(1);

    if (lblInfo) {
      lblInfo.textContent = `Selected: Band ${b.id} (${b.type.toUpperCase()}: ${b.freq}Hz, ${b.gain}dB, Q:${b.q.toFixed(1)})`;
    }
  };

  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // ノードとのヒット判定 (半径 14px)
    let hitBand = null;
    let minDist = 999;
    bandsArray.forEach(b => {
      const nx = freqToX(b.freq, canvas.width);
      const ny = gainToY(b.gain, canvas.height);
      const dist = Math.hypot(mx - nx, my - ny);
      if (dist < 18 && dist < minDist) {
        minDist = dist;
        hitBand = b;
      }
    });

    if (hitBand) {
      if (isMic) selectedMicBandId = hitBand.id;
      else selectedOutBandId = hitBand.id;
      isDragging = true;
      updateNodeControlsUI();
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const rect = canvas.getBoundingClientRect();
    const mx = Math.max(0, Math.min(canvas.width, e.clientX - rect.left));
    const my = Math.max(0, Math.min(canvas.height, e.clientY - rect.top));

    const b = getSelectedBand();
    if (b) {
      b.freq = xToFreq(mx, canvas.width);
      b.gain = yToGain(my, canvas.height);
      if (b.node) {
        b.node.frequency.value = b.freq;
        b.node.gain.value = b.gain;
      }
      updateMacroEffects();
      updateNodeControlsUI();
    }
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // マウスホイールによる Q幅 調整
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const b = getSelectedBand();
    if (b) {
      const delta = e.deltaY < 0 ? 0.2 : -0.2;
      b.q = Math.max(0.1, Math.min(10, Math.round((b.q + delta) * 10) / 10));
      if (b.node) b.node.Q.value = b.q;
      updateNodeControlsUI();
    }
  }, { passive: false });
}

// EQ Canvas 描画ループ (FFT スペクトラム + 合成周波数カーブ + ノード)
function drawEQCanvas(canvasId, bandsArray, isMic) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  // 1. グリッド線 ＆ dB/Hz ガイド
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;

  // Hz 縦ガイド線 (100, 1k, 10k)
  [100, 1000, 10000].forEach(f => {
    const x = freqToX(f, w);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();

    ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
    ctx.font = '9px monospace';
    ctx.fillText(`${f >= 1000 ? f/1000 + 'k' : f}Hz`, x + 3, h - 5);
  });

  // dB 横ガイド線 (0dB, +12dB, -12dB)
  [0, 12, -12].forEach(g => {
    const y = gainToY(g, h);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();

    ctx.fillStyle = g === 0 ? 'rgba(168, 85, 247, 0.4)' : 'rgba(148, 163, 184, 0.3)';
    ctx.font = '9px monospace';
    ctx.fillText(`${g > 0 ? '+' : ''}${g}dB`, 5, y - 3);
  });

  // 2. 背景 FFT スペクトラム描画 (半透明)
  const analyser = isMic ? pitchAnalyser : spectrumAnalyser;
  if (analyser) {
    const freqData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(freqData);

    ctx.beginPath();
    ctx.fillStyle = 'rgba(147, 51, 234, 0.12)';
    ctx.moveTo(0, h);
    for (let i = 0; i < freqData.length; i += 4) {
      const f = (i / freqData.length) * (audioCtx ? audioCtx.sampleRate / 2 : 22050);
      if (f < 20 || f > 20000) continue;
      const x = freqToX(f, w);
      const amp = freqData[i] / 255;
      const y = h - (amp * h * 0.85);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }

  // 3. 全バンドの合成EQカーブ描画 (BiquadFilter getFrequencyResponse モデリング)
  ctx.beginPath();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#c084fc';
  ctx.shadowColor = '#a855f7';
  ctx.shadowBlur = 10;

  for (let x = 0; x < w; x += 3) {
    const f = xToFreq(x, w);
    let totalGain = 0;

    // 各バンドの周波数レスポンスの計算近似
    bandsArray.forEach(b => {
      const ratio = f / b.freq;
      if (b.type === 'peaking') {
        const qFactor = b.q;
        const bw = 1 / qFactor;
        const resp = Math.exp(-Math.pow(Math.log2(ratio) / bw, 2));
        totalGain += b.gain * resp;
      } else if (b.type === 'lowshelf') {
        if (f <= b.freq) totalGain += b.gain;
        else if (f < b.freq * 2) totalGain += b.gain * (1 - (f - b.freq) / b.freq);
      } else if (b.type === 'highshelf') {
        if (f >= b.freq) totalGain += b.gain;
        else if (f > b.freq / 2) totalGain += b.gain * ((f - b.freq / 2) / (b.freq / 2));
      } else if (b.type === 'highpass') {
        if (f < b.freq) totalGain -= Math.min(24, Math.log2(b.freq / f) * 12);
      } else if (b.type === 'lowpass') {
        if (f > b.freq) totalGain -= Math.min(24, Math.log2(f / b.freq) * 12);
      } else if (b.type === 'notch') {
        if (Math.abs(f - b.freq) < b.freq * 0.1) totalGain -= 24;
      }
    });

    const y = gainToY(totalGain, h);
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  // 4. EQノード描画
  const selectedId = isMic ? selectedMicBandId : selectedOutBandId;
  bandsArray.forEach(b => {
    const nx = freqToX(b.freq, w);
    const ny = gainToY(b.gain, h);
    const isSelected = (b.id === selectedId);

    // Q幅のガイド円表示
    if (isSelected) {
      const qRadius = Math.max(12, Math.min(60, 40 / b.q));
      ctx.beginPath();
      ctx.arc(nx, ny, qRadius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // ノードの点
    ctx.beginPath();
    ctx.arc(nx, ny, isSelected ? 8 : 6, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? '#f43f5e' : '#a855f7';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    // バンド番号テキスト
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${b.id}`, nx, ny);
  });
}

// --------------------------------------------------------------------------
// ★ VISUAL COMPRESSOR GRAPH & REALTIME NEON GR METER ★
// --------------------------------------------------------------------------
function drawCompressorGraph() {
  const canvas = document.getElementById('canvas-comp-graph');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  // グリッド線 (-60dB ~ 0dB)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  for (let db = -60; db <= 0; db += 12) {
    const x = ((db + 60) / 60) * w;
    const y = h - ((db + 60) / 60) * h;

    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();

    ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
    ctx.font = '9px monospace';
    ctx.fillText(`${db}dB`, x + 3, h - 5);
  }

  // 1:1 リニア対角線 (未圧縮時)
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.setLineDash([4, 4]);
  ctx.moveTo(0, h);
  ctx.lineTo(w, 0);
  ctx.stroke();
  ctx.setLineDash([]);

  // コンプレッサー伝達関数 (折れ線)
  const threshX = ((compParams.threshold + 60) / 60) * w;
  const threshY = h - ((compParams.threshold + 60) / 60) * h;

  // Threshold超過後の出力dB
  const maxInDb = 0;
  const maxOutDb = compParams.threshold + (maxInDb - compParams.threshold) / compParams.ratio;
  const endX = w;
  const endY = h - ((maxOutDb + 60) / 60) * h;

  ctx.beginPath();
  ctx.lineWidth = 3;
  ctx.strokeStyle = compParams.enabled ? '#38bdf8' : '#64748b';
  ctx.shadowColor = '#0284c7';
  ctx.shadowBlur = 8;
  ctx.moveTo(0, h);
  ctx.lineTo(threshX, threshY);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Threshold ノード
  ctx.beginPath();
  ctx.arc(threshX, threshY, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#38bdf8';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();
}

function drawGRMeter() {
  const canvas = document.getElementById('canvas-gr-meter');
  const txtVal = document.getElementById('txt-gr-val');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  // 現在の Gain Reduction 値 (0dB ~ -24dB)
  let grValue = 0;
  if (micCompressorNode && compParams.enabled) {
    grValue = Math.abs(micCompressorNode.reduction || 0);
  }

  if (txtVal) txtVal.textContent = `-${grValue.toFixed(1)} dB`;

  // バックグラウンドスロット
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, 0, w, h);

  // ネオン縦型メーター (上から下へ伸びる)
  const grRatio = Math.min(1.0, grValue / 24);
  const barH = grRatio * h;

  if (barH > 0) {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#f43f5e');
    grad.addColorStop(0.5, '#fb7185');
    grad.addColorStop(1, '#e11d48');

    ctx.fillStyle = grad;
    ctx.shadowColor = '#f43f5e';
    ctx.shadowBlur = 10;
    ctx.fillRect(4, 0, w - 8, barH);
    ctx.shadowBlur = 0;
  }
}

// --------------------------------------------------------------------------
// ★ UI BINDINGS: DYNAMIC BAND ADD/DELETE, SLIDERS, PRESETS ★
// --------------------------------------------------------------------------
function bindDSPControls() {
  // 入出力オーディオデバイス切り替えリスナー
  const selInputDev = document.getElementById('select-input-device');
  const selHeadphonesDev = document.getElementById('select-out-headphones-device');
  const selAuxDev = document.getElementById('select-out-aux-device');
  const btnRefreshDevs = document.getElementById('btn-refresh-devices');

  if (selInputDev) {
    selInputDev.addEventListener('change', async () => {
      await switchInputDevice(selInputDev.value);
    });
  }

  if (selHeadphonesDev) {
    selHeadphonesDev.addEventListener('change', async () => {
      await switchOutputDevice(selHeadphonesDev.value);
    });
  }

  if (selAuxDev) {
    selAuxDev.addEventListener('change', async () => {
      await switchOutputDevice(selAuxDev.value);
    });
  }

  if (btnRefreshDevs) {
    btnRefreshDevs.addEventListener('click', async () => {
      await enumerateAudioDevices();
    });
  }

  // Audio Output: Headphones ＆ Aux 2系統切り替えタブ
  const tabHeadphones = document.getElementById('tab-out-headphones');
  const tabAux = document.getElementById('tab-out-aux');
  const containerHeadphones = document.getElementById('container-out-headphones');
  const containerAux = document.getElementById('container-out-aux');

  if (tabHeadphones && tabAux && containerHeadphones && containerAux) {
    tabHeadphones.addEventListener('click', () => {
      containerHeadphones.classList.remove('hidden');
      containerAux.classList.add('hidden');
      tabHeadphones.className = 'px-4 py-2 rounded-xl text-xs font-black bg-sky-600/30 border border-sky-500/50 text-white flex items-center space-x-2 transition-all';
      tabAux.className = 'px-4 py-2 rounded-xl text-xs font-black bg-slate-900 border border-transparent text-slate-400 hover:text-white flex items-center space-x-2 transition-all';
      setTimeout(resizeCanvases, 50);
    });

    tabAux.addEventListener('click', () => {
      containerAux.classList.remove('hidden');
      containerHeadphones.classList.add('hidden');
      tabAux.className = 'px-4 py-2 rounded-xl text-xs font-black bg-purple-600/30 border border-purple-500/50 text-white flex items-center space-x-2 transition-all';
      tabHeadphones.className = 'px-4 py-2 rounded-xl text-xs font-black bg-slate-900 border border-transparent text-slate-400 hover:text-white flex items-center space-x-2 transition-all';
      setTimeout(resizeCanvases, 50);
    });
  }

  // Mic EQ Dynamic Band Add / Delete
  const btnMicAddBand = document.getElementById('btn-mic-eq-add-band');
  const btnMicDelBand = document.getElementById('btn-mic-eq-delete-band');
  const btnMicReset = document.getElementById('btn-mic-eq-reset');

  if (btnMicAddBand) {
    btnMicAddBand.addEventListener('click', () => {
      const newId = nextMicBandId++;
      micBands.push({ id: newId, type: 'peaking', freq: 2000, gain: 3, q: 1.0, node: null });
      selectedMicBandId = newId;
      rebuildMicEQChain();
      if (micStream && sourceNode) connectMicDSPPipeline(sourceNode);
    });
  }

  if (btnMicDelBand) {
    btnMicDelBand.addEventListener('click', () => {
      if (micBands.length <= 1) return; // 最低1バンドは保持
      micBands = micBands.filter(b => b.id !== selectedMicBandId);
      selectedMicBandId = micBands[0].id;
      rebuildMicEQChain();
      if (micStream && sourceNode) connectMicDSPPipeline(sourceNode);
    });
  }

  if (btnMicReset) {
    btnMicReset.addEventListener('click', () => {
      micBands = [
        { id: 1, type: 'lowshelf', freq: 100, gain: 0, q: 1.0, node: null },
        { id: 2, type: 'peaking', freq: 500, gain: 0, q: 1.0, node: null },
        { id: 3, type: 'peaking', freq: 1000, gain: 0, q: 1.0, node: null },
        { id: 4, type: 'peaking', freq: 3000, gain: 0, q: 1.0, node: null },
        { id: 5, type: 'highshelf', freq: 8000, gain: 0, q: 1.0, node: null }
      ];
      selectedMicBandId = 3;
      macroBass = 0; macroClarity = 0; macroAir = 0;
      rebuildMicEQChain();
      if (micStream && sourceNode) connectMicDSPPipeline(sourceNode);
    });
  }

  // Audio Output EQ Add / Delete / Reset
  const btnOutAddBand = document.getElementById('btn-out-eq-add-band');
  const btnOutDelBand = document.getElementById('btn-out-eq-delete-band');
  const btnOutReset = document.getElementById('btn-out-eq-reset');

  if (btnOutAddBand) {
    btnOutAddBand.addEventListener('click', () => {
      const newId = nextOutBandId++;
      outBands.push({ id: newId, type: 'peaking', freq: 2000, gain: 3, q: 1.0, node: null });
      selectedOutBandId = newId;
      rebuildOutEQChain();
    });
  }

  if (btnOutDelBand) {
    btnOutDelBand.addEventListener('click', () => {
      if (outBands.length <= 1) return;
      outBands = outBands.filter(b => b.id !== selectedOutBandId);
      selectedOutBandId = outBands[0].id;
      rebuildOutEQChain();
    });
  }

  if (btnOutReset) {
    btnOutReset.addEventListener('click', () => {
      outBands = [
        { id: 1, type: 'lowshelf', freq: 80, gain: 0, q: 1.0, node: null },
        { id: 2, type: 'peaking', freq: 250, gain: 0, q: 1.0, node: null },
        { id: 3, type: 'peaking', freq: 1000, gain: 0, q: 1.0, node: null },
        { id: 4, type: 'peaking', freq: 4000, gain: 0, q: 1.0, node: null },
        { id: 5, type: 'highshelf', freq: 10000, gain: 0, q: 1.0, node: null }
      ];
      selectedOutBandId = 3;
      rebuildOutEQChain();
    });
  }

  // Filter Type Select Controls
  const selMicType = document.getElementById('select-mic-band-type');
  if (selMicType) {
    selMicType.addEventListener('change', () => {
      let b = micBands.find(x => x.id === selectedMicBandId);
      if (b) {
        b.type = selMicType.value;
        if (b.node) b.node.type = b.type;
      }
    });
  }

  const selOutType = document.getElementById('select-out-band-type');
  if (selOutType) {
    selOutType.addEventListener('change', () => {
      let b = outBands.find(x => x.id === selectedOutBandId);
      if (b) {
        b.type = selOutType.value;
        if (b.node) b.node.type = b.type;
      }
    });
  }

  // Sliders: Mic Freq, Gain, Q
  const sMicFreq = document.getElementById('slider-mic-freq');
  const sMicGain = document.getElementById('slider-mic-gain');
  const sMicQ = document.getElementById('slider-mic-q');

  if (sMicFreq) sMicFreq.addEventListener('input', () => {
    let b = micBands.find(x => x.id === selectedMicBandId);
    if (b) { b.freq = parseFloat(sMicFreq.value); if (b.node) b.node.frequency.value = b.freq; }
  });
  if (sMicGain) sMicGain.addEventListener('input', () => {
    let b = micBands.find(x => x.id === selectedMicBandId);
    if (b) { b.gain = parseFloat(sMicGain.value); if (b.node) b.node.gain.value = b.gain; updateMacroEffects(); }
  });
  if (sMicQ) sMicQ.addEventListener('input', () => {
    let b = micBands.find(x => x.id === selectedMicBandId);
    if (b) { b.q = parseFloat(sMicQ.value); if (b.node) b.node.Q.value = b.q; }
  });

  // Macros Sliders
  const sMacroBass = document.getElementById('slider-macro-bass');
  const sMacroClarity = document.getElementById('slider-macro-clarity');
  const sMacroAir = document.getElementById('slider-macro-air');
  const txtBass = document.getElementById('txt-macro-bass');
  const txtClarity = document.getElementById('txt-macro-clarity');
  const txtAir = document.getElementById('txt-macro-air');

  if (sMacroBass) sMacroBass.addEventListener('input', () => { macroBass = parseFloat(sMacroBass.value); if(txtBass) txtBass.textContent = `${macroBass>0?'+':''}${macroBass}dB`; updateMacroEffects(); });
  if (sMacroClarity) sMacroClarity.addEventListener('input', () => { macroClarity = parseFloat(sMacroClarity.value); if(txtClarity) txtClarity.textContent = `${macroClarity>0?'+':''}${macroClarity}dB`; updateMacroEffects(); });
  if (sMacroAir) sMacroAir.addEventListener('input', () => { macroAir = parseFloat(sMacroAir.value); if(txtAir) txtAir.textContent = `${macroAir>0?'+':''}${macroAir}dB`; updateMacroEffects(); });

  // Compressor Controls
  const toggleCompEnable = document.getElementById('toggle-comp-enable');
  const sThresh = document.getElementById('slider-comp-thresh');
  const sRatio = document.getElementById('slider-comp-ratio');
  const sAttack = document.getElementById('slider-comp-attack');
  const sRelease = document.getElementById('slider-comp-release');
  const sMakeup = document.getElementById('slider-comp-makeup');
  const toggleAutoGain = document.getElementById('toggle-comp-autogain');

  if (toggleCompEnable) toggleCompEnable.addEventListener('change', () => {
    compParams.enabled = toggleCompEnable.checked;
    if (micStream && sourceNode) connectMicDSPPipeline(sourceNode);
  });
  if (sThresh) sThresh.addEventListener('input', () => { compParams.threshold = parseFloat(sThresh.value); document.getElementById('txt-comp-thresh').textContent = `${compParams.threshold}dB`; applyCompressorParams(); });
  if (sRatio) sRatio.addEventListener('input', () => { compParams.ratio = parseFloat(sRatio.value); document.getElementById('txt-comp-ratio').textContent = `${compParams.ratio}:1`; applyCompressorParams(); });
  if (sAttack) sAttack.addEventListener('input', () => { compParams.attack = parseFloat(sAttack.value) / 1000; document.getElementById('txt-comp-attack').textContent = `${sAttack.value}ms`; applyCompressorParams(); });
  if (sRelease) sRelease.addEventListener('input', () => { compParams.release = parseFloat(sRelease.value) / 1000; document.getElementById('txt-comp-release').textContent = `${sRelease.value}ms`; applyCompressorParams(); });
  if (sMakeup) sMakeup.addEventListener('input', () => { compParams.makeup = parseFloat(sMakeup.value); document.getElementById('txt-comp-makeup').textContent = `+${compParams.makeup}dB`; applyCompressorParams(); });
  if (toggleAutoGain) toggleAutoGain.addEventListener('change', () => { compParams.autoGain = toggleAutoGain.checked; applyCompressorParams(); });

  // Audio Output Presets
  const btnFlat = document.getElementById('btn-preset-flat');
  const btnFps = document.getElementById('btn-preset-fps');
  const btnMusic = document.getElementById('btn-preset-music');
  const btnMovie = document.getElementById('btn-preset-movie');

  function applyPreset(presetBands, activeBtn) {
    outBands = JSON.parse(JSON.stringify(presetBands));
    selectedOutBandId = outBands[0].id;
    rebuildOutEQChain();

    [btnFlat, btnFps, btnMusic, btnMovie].forEach(b => {
      if (b) b.className = 'px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-white transition-all';
    });
    if (activeBtn) activeBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-purple-600 transition-all';
  }

  if (btnFlat) btnFlat.addEventListener('click', () => applyPreset([
    { id: 1, type: 'lowshelf', freq: 80, gain: 0, q: 1.0, node: null },
    { id: 2, type: 'peaking', freq: 250, gain: 0, q: 1.0, node: null },
    { id: 3, type: 'peaking', freq: 1000, gain: 0, q: 1.0, node: null },
    { id: 4, type: 'peaking', freq: 4000, gain: 0, q: 1.0, node: null },
    { id: 5, type: 'highshelf', freq: 10000, gain: 0, q: 1.0, node: null }
  ], btnFlat));

  if (btnFps) btnFps.addEventListener('click', () => applyPreset([
    { id: 1, type: 'highpass', freq: 60, gain: 0, q: 1.0, node: null },
    { id: 2, type: 'peaking', freq: 150, gain: -3, q: 1.0, node: null },
    { id: 3, type: 'peaking', freq: 400, gain: 4, q: 1.4, node: null }, // 足音強調
    { id: 4, type: 'peaking', freq: 2500, gain: 5, q: 1.2, node: null }, // 銃声・環境音
    { id: 5, type: 'highshelf', freq: 8000, gain: 2, q: 1.0, node: null }
  ], btnFps));

  if (btnMusic) btnMusic.addEventListener('click', () => applyPreset([
    { id: 1, type: 'lowshelf', freq: 100, gain: 4.5, q: 1.0, node: null }, // ドンシャリ重低音
    { id: 2, type: 'peaking', freq: 300, gain: -1.5, q: 1.0, node: null },
    { id: 3, type: 'peaking', freq: 1200, gain: 1, q: 1.0, node: null },
    { id: 4, type: 'peaking', freq: 3500, gain: 2, q: 1.0, node: null },
    { id: 5, type: 'highshelf', freq: 10000, gain: 4, q: 1.0, node: null } // 透過高域
  ], btnMusic));

  if (btnMovie) btnMovie.addEventListener('click', () => applyPreset([
    { id: 1, type: 'lowshelf', freq: 80, gain: 3, q: 1.0, node: null },
    { id: 2, type: 'peaking', freq: 250, gain: -2, q: 1.0, node: null },
    { id: 3, type: 'peaking', freq: 2000, gain: 4, q: 1.2, node: null }, // セリフ強調
    { id: 4, type: 'peaking', freq: 5000, gain: 1, q: 1.0, node: null },
    { id: 5, type: 'highshelf', freq: 12000, gain: 2, q: 1.0, node: null }
  ], btnMovie));

  // EQ Canvas 相互ドラッグイベント登録
  setupEQCanvasInteraction('canvas-eq-mic', micBands, true);
  setupEQCanvasInteraction('canvas-eq-out', outBands, false);
}

// キャンバスリサイズ処理の拡張
const oldResizeCanvases = resizeCanvases;
resizeCanvases = function() {
  if (typeof oldResizeCanvases === 'function') oldResizeCanvases();

  ['canvas-eq-mic', 'canvas-eq-out', 'canvas-comp-graph', 'canvas-gr-meter'].forEach(id => {
    const cvs = document.getElementById(id);
    if (cvs && cvs.parentElement) {
      cvs.width = cvs.parentElement.clientWidth;
      cvs.height = cvs.parentElement.clientHeight;
    }
  });
};

// --------------------------------------------------------------------------
// メイン更新ループ (90 FPS 固定レート制御)
// --------------------------------------------------------------------------
let lastRenderTime = performance.now();
const TARGET_FPS = 90;
const FRAME_INTERVAL = 1000 / TARGET_FPS; // 約11.11ms (90FPS)

function updateLoop(timestamp) {
  requestAnimationFrame(updateLoop);

  const now = timestamp || performance.now();
  const elapsed = now - lastRenderTime;

  // 90FPS (約11.11ms) の固定ペースでフレーム描画を更新
  if (elapsed >= FRAME_INTERVAL - 0.5) {
    lastRenderTime = now - (elapsed % FRAME_INTERVAL);

    frameCount++;
    if (now - lastFpsTime >= 1000) {
      if (fpsCounter) fpsCounter.textContent = `${frameCount} FPS`;
      frameCount = 0;
      lastFpsTime = now;
    }

    analyzeVocalPitch();
    analyzePitchAccuracy(lastValidF0);
    analyzeFormants();
    detectVibrato();
    analyzeChordAndKey();
    analyzeDrumBeats();

    // 90FPS固定の滑らかな流れる速度
    drawSpectrogram(1.5);
    drawPitchTracker(1.5);
    drawSpectrum();

    // DSP (EQ & Compressor & GR Meter) 描画
    drawEQCanvas('canvas-eq-mic', micBands, true);
    drawEQCanvas('canvas-eq-out', outBands, false);
    drawCompressorGraph();
    drawGRMeter();
  }
}

// アプリ起動
window.addEventListener('DOMContentLoaded', async () => {
  resizeCanvases();
  setupUIEvents();
  bindDSPControls();
  await startAudioStream();
  requestAnimationFrame(updateLoop);
});
