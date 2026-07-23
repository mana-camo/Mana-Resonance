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
  return [
    path.join(process.cwd(), filename),
    path.join(path.dirname(process.execPath), filename),
    path.join(__dirname, filename),
    path.join(__dirname, '..', filename),
    path.join(__dirname, '..', '..', filename)
  ];
}

function loadAppConfig() {
  // 1. config.json の探索
  const configPaths = findCandidatePaths('config.json');
  for (const p of configPaths) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed.language) currentAppLang = parsed.language.toUpperCase();
        if (typeof parsed.betaUpdate === 'boolean') currentAppBeta = parsed.betaUpdate;
        break;
      }
    } catch (e) {}
  }

  // 2. language.txt の探索 (Installer.cs が作成した初期言語の確定取得)
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
async function startAudioStream() {
  if (isReconnecting) return;
  isReconnecting = true;

  try {
    if (sourceNode) {
      try { sourceNode.disconnect(); } catch (e) {}
      sourceNode = null;
    }
    if (micStream) {
      micStream.getTracks().forEach(track => {
        try { track.stop(); } catch (e) {}
      });
      micStream = null;
    }

    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    // 1.0.8 同等: getDisplayMedia を使用してシステム音声（デスクトップオーディオ）を直接キャプチャ
    micStream = await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: true
    });

    // 不要なビデオトラックを即座に停止・解放
    micStream.getVideoTracks().forEach(track => track.stop());

    sourceNode = audioCtx.createMediaStreamSource(micStream);
    setupAudioNodes(sourceNode);
    console.log('システム音声ストリームの接続に成功しました。');

  } catch (err) {
    console.error('システム音声の自動取得に失敗しました:', err);
    // フォールバック: マイク入力
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
      sourceNode = audioCtx.createMediaStreamSource(micStream);
      setupAudioNodes(sourceNode);
    } catch (e) {}
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
  if (!lowAnalyser) return;
  const lowData = new Uint8Array(lowAnalyser.frequencyBinCount);
  const midData = new Uint8Array(midAnalyser.frequencyBinCount);
  const highData = new Uint8Array(highAnalyser.frequencyBinCount);

  lowAnalyser.getByteFrequencyData(lowData);
  midAnalyser.getByteFrequencyData(midData);
  highAnalyser.getByteFrequencyData(highData);

  const getAvg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
  const lowAvg = getAvg(lowData);
  const midAvg = getAvg(midData);
  const highAvg = getAvg(highData);

  const lowDb = Math.round(20 * Math.log10((lowAvg || 1) / 255));
  const midDb = Math.round(20 * Math.log10((midAvg || 1) / 255));
  const highDb = Math.round(20 * Math.log10((highAvg || 1) / 255));

  if (lowVal) lowVal.textContent = `${lowDb} dB`;
  if (midVal) midVal.textContent = `${midDb} dB`;
  if (highVal) highVal.textContent = `${highDb} dB`;

  if (barLow) barLow.style.width = `${(lowAvg / 255) * 100}%`;
  if (barMid) barMid.style.width = `${(midAvg / 255) * 100}%`;
  if (barHigh) barHigh.style.width = `${(highAvg / 255) * 100}%`;

  const kickPct = Math.round((lowAvg / 255) * 100);
  if (kickPeakDisplay) kickPeakDisplay.textContent = `${kickPct}%`;
  if (beatEnergyText) beatEnergyText.textContent = `${kickPct}%`;

  if (beatPulseOuter && beatPulseInner) {
    if (kickPct > 50) {
      beatPulseOuter.style.borderColor = 'rgba(168, 85, 247, 0.9)';
      beatPulseOuter.style.transform = 'scale(1.08)';
      beatPulseInner.style.backgroundColor = 'rgba(147, 51, 234, 0.7)';
    } else {
      beatPulseOuter.style.borderColor = 'rgba(168, 85, 247, 0.3)';
      beatPulseOuter.style.transform = 'scale(1.0)';
      beatPulseInner.style.backgroundColor = 'rgba(147, 51, 234, 0.3)';
    }
  }

  const now = performance.now();
  if (lowAvg - lastLowEnergy > 35 && now - lastBeatTime > 250) {
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
  lastLowEnergy = lowAvg;

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

    // ★ Peak Hold 保持 ＆ 浮遊ラベル表示 ★
    const nowTime = performance.now();

    if (peakIdx >= 0 && maxVal > 15) {
      const currentPeak = points[peakIdx];
      if (!holdPeakPoint || (nowTime - lastPeakHoldTime > PEAK_HOLD_DURATION_MS)) {
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

  const navCatTitle = document.getElementById('nav-cat-title');
  const navTxtAnalytics = document.getElementById('nav-txt-analytics');
  const navTxtSettings = document.getElementById('nav-txt-settings');

  if (navCatTitle) navCatTitle.textContent = isJA ? '解析機能' : 'ANALYTICS';
  if (navTxtAnalytics) navTxtAnalytics.textContent = isJA ? 'ライブ解析 (Live)' : 'Live Analysis';
  if (navTxtSettings) navTxtSettings.textContent = isJA ? 'システム設定 (Settings)' : 'Settings';

  const settingsHeadTitle = document.getElementById('settings-head-title');
  const settingsHeadSub = document.getElementById('settings-head-sub');
  const lblCfgLang = document.getElementById('lbl-cfg-lang');
  const descCfgLang = document.getElementById('desc-cfg-lang');
  const lblCfgBeta = document.getElementById('lbl-cfg-beta');
  const descCfgBeta = document.getElementById('desc-cfg-beta');
  const lblCfgAudio = document.getElementById('lbl-cfg-audio');
  const descCfgAudio = document.getElementById('desc-cfg-audio');
  const btnSaveCfg = document.getElementById('btn-save-cfg');
  const cfgSavedMsg = document.getElementById('cfg-saved-msg');

  if (settingsHeadTitle) settingsHeadTitle.innerHTML = isJA ? 'システム設定 (SETTINGS)' : 'APPLICATION SETTINGS';
  if (settingsHeadSub) settingsHeadSub.textContent = isJA ? 'Mana Resonance のシステムオプションおよび表示言語の設定管理' : 'Configure system options and user preference settings';
  if (lblCfgLang) lblCfgLang.textContent = isJA ? '表示言語 (DISPLAY LANGUAGE)' : 'DISPLAY LANGUAGE';
  if (descCfgLang) descCfgLang.textContent = isJA ? 'UIおよびセットアップで使用する表示言語を選択します' : 'Select the language for the user interface and setup wizard';
  if (lblCfgBeta) lblCfgBeta.textContent = isJA ? 'ベータアップデート自動受信' : 'BETA UPDATES';
  if (descCfgBeta) descCfgBeta.textContent = isJA ? '開発中の最新実験的機能アップデートを優先受信します' : 'Receive early experimental feature updates automatically';
  if (lblCfgAudio) lblCfgAudio.textContent = isJA ? 'オーディオ感度設定 (将来拡張スロット)' : 'AUDIO GAIN & NOISE CUT (EXPANSION SLOT)';
  if (descCfgAudio) descCfgAudio.textContent = isJA ? '自動ノイズゲートおよび感度コントロール' : 'Automatic Noise Gate and Sensitivity Control';
  if (btnSaveCfg) btnSaveCfg.textContent = isJA ? '設定を保存する' : 'SAVE SETTINGS / 設定を保存';
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

  // ★ 同一ウィンドウ内 ページ切り替え (Live Analysis ↔ Settings) ★
  const navBtnAnalytics = document.getElementById('nav-btn-analytics');
  const navBtnSettings = document.getElementById('nav-btn-settings');
  const viewAnalytics = document.getElementById('view-analytics');
  const viewSettings = document.getElementById('view-settings');

  if (navBtnAnalytics && navBtnSettings && viewAnalytics && viewSettings) {
    navBtnAnalytics.addEventListener('click', () => {
      viewAnalytics.classList.remove('hidden');
      viewSettings.classList.add('hidden');

      navBtnAnalytics.className = 'w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-bold text-white bg-purple-600/30 border border-purple-500/50 transition-all';
      navBtnSettings.className = 'w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-white/5 border border-transparent transition-all';

      // Live Analytics 画面に切り替わったときに Canvas サイズを再同期
      setTimeout(resizeCanvases, 50);
    });

    navBtnSettings.addEventListener('click', () => {
      viewSettings.classList.remove('hidden');
      viewAnalytics.classList.add('hidden');

      navBtnSettings.className = 'w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-bold text-white bg-purple-600/30 border border-purple-500/50 transition-all';
      navBtnAnalytics.className = 'w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-white/5 border border-transparent transition-all';

      // ページ開時に設定状態を最新化
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

  if (dropZone) {
    dropZone.addEventListener('dragover', e => { e.preventDefault(); });
    dropZone.addEventListener('drop', e => { e.preventDefault(); });
  }

  // 初期読み込み時のベータ許可IPC送信 ＆ UI設定適用
  ipcRenderer.send('set-allow-prerelease', currentAppBeta);
  updateUIForLanguage();
}

// --------------------------------------------------------------------------
// メイン更新ループ
// --------------------------------------------------------------------------
function updateLoop() {
  const now = performance.now();
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

  drawSpectrogram();
  drawPitchTracker();
  drawSpectrum();

  requestAnimationFrame(updateLoop);
}

// アプリ起動
window.addEventListener('DOMContentLoaded', async () => {
  resizeCanvases();
  setupUIEvents();
  await startAudioStream();
  requestAnimationFrame(updateLoop);
});
