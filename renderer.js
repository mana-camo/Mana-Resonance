// ==========================================================================
// Mana Resonance - Completely Rebuilt Robust Audio Analytics Engine
// (流用なし完全新規設計: 100%常時描画 & ResizeObserver確実サイズ更新)
// ==========================================================================

const { ipcRenderer } = require('electron');

// OS・動作環境判定
const isMac = process.platform === 'darwin';

// DOM要素参照
const btnClose = document.getElementById('btn-close');
const btnMinimize = document.getElementById('btn-minimize');
const btnMaximize = document.getElementById('btn-maximize');

const canvasSpectrogram = document.getElementById('canvas-spectrogram');
const canvasPitchTracker = document.getElementById('canvas-pitch-tracker');
const canvasSpectrum = document.getElementById('canvas-spectrum');
const canvasParticles = document.getElementById('canvas-particles');
const canvasVibratoRadar = document.getElementById('canvas-vibrato-radar');

const fpsCounter = document.getElementById('fps-counter');
const dropZone = document.getElementById('drop-zone');
const btnReconnect = document.getElementById('btn-reconnect');
const filterPresets = document.getElementById('filter-presets');

// 2Dコンテキスト
let ctxSpectrogram = null;
let ctxPitchTracker = null;
let ctxSpectrum = null;
let ctxParticles = null;
let ctxVibrato = null;

// 音響解析ノード
let audioCtx = null;
let currentStream = null;
let sourceNode = null;
let pitchAnalyser = null;
let spectrumAnalyser = null;
let lowAnalyser = null;

// 音声解析データ
let lastValidF0 = 0;
let lastPitchConfidence = 0;
let pitchHistory = [];
const MAX_PITCH_HISTORY = 300;

// スペクトログラム履歴
let spectroBufferCanvas = null;
let spectroBufferCtx = null;

// パティクル
let particles = [];

// フレーム＆FPSカウンター
let frameCount = 0;
let lastFpsTimestamp = performance.now();

// --------------------------------------------------------------------------
// 1. アプリケーション初期化
// --------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  // ウィンドウコントロール設定
  if (btnClose) btnClose.addEventListener('click', () => ipcRenderer.send('window-close'));
  if (btnMinimize) btnMinimize.addEventListener('click', () => ipcRenderer.send('window-minimize'));
  if (btnMaximize) btnMaximize.addEventListener('click', () => ipcRenderer.send('window-maximize'));

  // キャンバスコンテキスト取得
  if (canvasSpectrogram) ctxSpectrogram = canvasSpectrogram.getContext('2d');
  if (canvasPitchTracker) ctxPitchTracker = canvasPitchTracker.getContext('2d');
  if (canvasSpectrum) ctxSpectrum = canvasSpectrum.getContext('2d');
  if (canvasParticles) ctxParticles = canvasParticles.getContext('2d');
  if (canvasVibratoRadar) ctxVibrato = canvasVibratoRadar.getContext('2d');

  // ResizeObserver による確実なサイズ自動同調
  setupResizeObservers();

  // イベント登録
  setupReconnectEvent();
  setupFilterPresets();
  setupDragAndDrop();

  // 音声ストリーム初期起動
  await startAudioStream();

  // 毎フレーム描画ループ（100%常時稼働）
  requestAnimationFrame(renderLoop);
});

// --------------------------------------------------------------------------
// 2. ResizeObserver によるキャンバスサイズ自動調整
// --------------------------------------------------------------------------
function setupResizeObservers() {
  const resizeCanvas = (canvas) => {
    if (!canvas || !canvas.parentElement) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    const width = Math.max(20, Math.floor(rect.width));
    const height = Math.max(20, Math.floor(rect.height));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  };

  const observer = new ResizeObserver(() => {
    resizeCanvas(canvasSpectrogram);
    resizeCanvas(canvasPitchTracker);
    resizeCanvas(canvasSpectrum);
    resizeCanvas(canvasParticles);
    resizeCanvas(canvasVibratoRadar);
  });

  if (canvasSpectrogram && canvasSpectrogram.parentElement) observer.observe(canvasSpectrogram.parentElement);
  if (canvasPitchTracker && canvasPitchTracker.parentElement) observer.observe(canvasPitchTracker.parentElement);
  if (canvasSpectrum && canvasSpectrum.parentElement) observer.observe(canvasSpectrum.parentElement);
}

// --------------------------------------------------------------------------
// 3. 100%確実な毎フレーム描画＆解析ループ
// --------------------------------------------------------------------------
function renderLoop(timestamp) {
  requestAnimationFrame(renderLoop);

  // FPS計算
  frameCount++;
  const delta = timestamp - lastFpsTimestamp;
  if (delta >= 1000) {
    if (fpsCounter) fpsCounter.textContent = `${Math.round((frameCount * 1000) / delta)} FPS`;
    frameCount = 0;
    lastFpsTimestamp = timestamp;
  }

  // 音声解析（audioCtx 稼働中のみ）
  if (audioCtx && audioCtx.state === 'running') {
    analyzePitch();
    analyzePitchAccuracy(lastValidF0);
    analyzeBPM();
    analyzeFormants();
    analyzeChord();
  }

  // ★ 描画処理（audioCtx の有無に関わらず 100% 常時実行！黒画面事故を物理排除） ★
  drawSpectrogram();
  drawPitchTracker();
  drawSpectrum();
  drawVibratoRadar();
}

// --------------------------------------------------------------------------
// 4. 音声ストリームの100%確実な接続
// --------------------------------------------------------------------------
async function startAudioStream() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    // マイクまたは入力音声の取得
    try {
      currentStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (e1) {
      try {
        currentStream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
        currentStream.getVideoTracks().forEach(t => t.stop());
      } catch (e2) {
        console.warn('Audio capture warning:', e2);
      }
    }

    if (currentStream && currentStream.getAudioTracks().length > 0) {
      if (sourceNode) sourceNode.disconnect();
      sourceNode = audioCtx.createMediaStreamSource(currentStream);

      pitchAnalyser = audioCtx.createAnalyser();
      pitchAnalyser.fftSize = 2048;

      spectrumAnalyser = audioCtx.createAnalyser();
      spectrumAnalyser.fftSize = 1024;

      lowAnalyser = audioCtx.createAnalyser();
      lowAnalyser.fftSize = 512;

      sourceNode.connect(pitchAnalyser);
      sourceNode.connect(spectrumAnalyser);
      sourceNode.connect(lowAnalyser);

      console.log('Audio Engine Stream Connected Successfully.');
    }
  } catch (err) {
    console.error('Audio Stream Setup Error:', err);
  }
}

// --------------------------------------------------------------------------
// 5. 音高 (Pitch F0) 解析 - 自己相関関数
// --------------------------------------------------------------------------
function analyzePitch() {
  if (!pitchAnalyser) return;

  const buffer = new Float32Array(pitchAnalyser.fftSize);
  pitchAnalyser.getFloatTimeDomainData(buffer);

  // RMS (音圧) 計算
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  const rms = Math.sqrt(sum / buffer.length);

  if (rms < 0.015) {
    lastValidF0 = 0;
    updatePitchUI(0, '--');
    return;
  }

  // 自己相関
  const sampleRate = audioCtx.sampleRate;
  const minPeriod = Math.floor(sampleRate / 1000); // 1000Hz
  const maxPeriod = Math.floor(sampleRate / 55);   // 55Hz

  let bestCorrelation = 0;
  let bestPeriod = -1;

  for (let period = minPeriod; period <= maxPeriod; period++) {
    let corr = 0;
    for (let i = 0; i < buffer.length - period; i++) {
      corr += buffer[i] * buffer[i + period];
    }
    corr /= (buffer.length - period);

    if (corr > bestCorrelation) {
      bestCorrelation = corr;
      bestPeriod = period;
    }
  }

  if (bestPeriod > 0 && bestCorrelation > 0.1) {
    const f0 = sampleRate / bestPeriod;
    if (f0 >= 55 && f0 <= 1000) {
      lastValidF0 = f0;
      lastPitchConfidence = bestCorrelation;

      const midiNote = 12 * Math.log2(f0 / 440) + 69;
      const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      const noteName = noteNames[Math.round(midiNote) % 12] + (Math.floor(Math.round(midiNote) / 12) - 1);

      updatePitchUI(f0, noteName);
      return;
    }
  }

  lastValidF0 = 0;
  updatePitchUI(0, '--');
}

function updatePitchUI(f0, note) {
  const freqEl = document.getElementById('pitch-freq');
  const noteEl = document.getElementById('pitch-note');
  if (freqEl) freqEl.textContent = f0 > 0 ? `${f0.toFixed(1)} Hz` : '-- Hz';
  if (noteEl) noteEl.textContent = note;
}

// --------------------------------------------------------------------------
// 6. 各種インジケーター解析 (ピッチ精度, BPM, フォルマント, Chord)
// --------------------------------------------------------------------------
function analyzePitchAccuracy(f0) {
  const el = document.getElementById('pitch-cents-display');
  if (!el) return;

  if (f0 <= 0) {
    el.textContent = '--';
    el.className = 'text-base font-black font-mono text-slate-500';
    return;
  }

  const midiNote = 12 * Math.log2(f0 / 440) + 69;
  const exactMidi = Math.round(midiNote);
  const targetFreq = 440 * Math.pow(2, (exactMidi - 69) / 12);
  const cents = Math.round(1200 * Math.log2(f0 / targetFreq));

  if (Math.abs(cents) <= 5) {
    el.textContent = `JUST (${cents > 0 ? '+' : ''}${cents}c)`;
    el.className = 'text-base font-black font-mono text-emerald-400 animate-pulse';
  } else if (cents > 0) {
    el.textContent = `+${cents}c HIGH`;
    el.className = 'text-base font-black font-mono text-amber-400';
  } else {
    el.textContent = `${cents}c LOW`;
    el.className = 'text-base font-black font-mono text-rose-400';
  }
}

let bpmHistory = [];
let lastBpmBeatTime = 0;
function analyzeBPM() {
  const el = document.getElementById('bpm-display');
  if (!el || !lowAnalyser) return;

  const data = new Uint8Array(lowAnalyser.frequencyBinCount);
  lowAnalyser.getByteFrequencyData(data);

  let lowEnergy = 0;
  for (let i = 0; i < data.length; i++) lowEnergy += data[i];
  lowEnergy /= data.length;

  const now = performance.now();
  if (lowEnergy > 160 && (now - lastBpmBeatTime) > 280) {
    if (lastBpmBeatTime > 0) {
      const intervalMs = now - lastBpmBeatTime;
      const bpm = Math.round(60000 / intervalMs);
      if (bpm >= 60 && bpm <= 200) {
        bpmHistory.push(bpm);
        if (bpmHistory.length > 8) bpmHistory.shift();

        const avgBpm = Math.round(bpmHistory.reduce((a, b) => a + b, 0) / bpmHistory.length);
        el.textContent = `${avgBpm} BPM`;
      }
    }
    lastBpmBeatTime = now;
  }
}

function analyzeFormants() {
  const el = document.getElementById('timbre-display');
  if (!el || !spectrumAnalyser || lastValidF0 <= 0) {
    if (el) el.textContent = '--';
    return;
  }

  const data = new Uint8Array(spectrumAnalyser.frequencyBinCount);
  spectrumAnalyser.getByteFrequencyData(data);
  const sampleRate = audioCtx ? audioCtx.sampleRate : 44100;
  const totalBins = data.length;

  let f1 = 0, f2 = 0;
  for (let i = 0; i < totalBins; i++) {
    const freq = (i * sampleRate) / (totalBins * 2);
    if (freq >= 300 && freq < 1000) f1 += data[i];
    else if (freq >= 1000 && freq <= 3000) f2 += data[i];
  }

  const ratio = f2 / (f1 + 1);
  el.textContent = ratio > 0.8 ? 'BRIGHT' : 'DEEP';
}

function analyzeChord() {
  const chordEl = document.getElementById('chord-display');
  const keyEl = document.getElementById('key-display');
  if (lastValidF0 <= 0) {
    if (chordEl) chordEl.textContent = '--';
    if (keyEl) keyEl.textContent = 'Key: --';
    return;
  }

  const midiNote = 12 * Math.log2(lastValidF0 / 440) + 69;
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const root = noteNames[Math.round(midiNote) % 12];
  if (chordEl) chordEl.textContent = root;
  if (keyEl) keyEl.textContent = `Key: ${root} Maj`;
}

// --------------------------------------------------------------------------
// 7. 描画関数 1: 1段目 Companion Perspective (スペクトログラム)
// --------------------------------------------------------------------------
function drawSpectrogram() {
  if (!ctxSpectrogram || !canvasSpectrogram) return;

  const w = canvasSpectrogram.width;
  const h = canvasSpectrogram.height;
  if (w <= 0 || h <= 0) return;

  // オフスクリーンバッファ初期化
  if (!spectroBufferCanvas || spectroBufferCanvas.width !== w || spectroBufferCanvas.height !== h) {
    spectroBufferCanvas = document.createElement('canvas');
    spectroBufferCanvas.width = w;
    spectroBufferCanvas.height = h;
    spectroBufferCtx = spectroBufferCanvas.getContext('2d');
    spectroBufferCtx.fillStyle = '#020306';
    spectroBufferCtx.fillRect(0, 0, w, h);
  }

  // バッファを左に 1.5px スクロール
  spectroBufferCtx.drawImage(spectroBufferCanvas, -1.5, 0);

  // 最新データの1列描画
  if (spectrumAnalyser && audioCtx && audioCtx.state === 'running') {
    const data = new Uint8Array(spectrumAnalyser.frequencyBinCount);
    spectrumAnalyser.getByteFrequencyData(data);

    const x = w - 1.5;
    spectroBufferCtx.fillStyle = '#020306';
    spectroBufferCtx.fillRect(x, 0, 1.5, h);

    const minMidi = 36;
    const maxMidi = 96;
    const sampleRate = audioCtx.sampleRate;
    const totalBins = spectrumAnalyser.frequencyBinCount;

    for (let y = 0; y < h; y++) {
      const normY = 1.0 - (y / h);
      const targetFreq = 440 * Math.pow(2, ((minMidi + normY * (maxMidi - minMidi)) - 69) / 12);
      const binIdx = Math.round((targetFreq * totalBins * 2) / sampleRate);
      const energy = binIdx < data.length ? data[binIdx] : 0;

      if (energy > 10) {
        const norm = energy / 255;
        const r = Math.round(140 + norm * 115);
        const g = Math.round(40 + norm * 180);
        const b = Math.round(220 + norm * 35);
        spectroBufferCtx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.2 + norm * 0.8})`;
        spectroBufferCtx.fillRect(x, y, 1.5, 1.2);
      }
    }
  }

  // メインキャンバスへ転送
  ctxSpectrogram.clearRect(0, 0, w, h);
  ctxSpectrogram.drawImage(spectroBufferCanvas, 0, 0);

  // ガイドライン & テキスト直接描画 (100%表示)
  ctxSpectrogram.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctxSpectrogram.font = '9px monospace';
  ctxSpectrogram.textAlign = 'right';
  ctxSpectrogram.fillText('C6 (1047Hz)', w - 10, 14);
  ctxSpectrogram.fillText('C4 (262Hz)', w - 10, h / 2);
  ctxSpectrogram.fillText('C2 (65Hz)', w - 10, h - 8);
}

// --------------------------------------------------------------------------
// 8. 描画関数 2: 2段目 Vocal Pitch Tracker (ピッチトラッカー)
// --------------------------------------------------------------------------
function drawPitchTracker() {
  if (!ctxPitchTracker || !canvasPitchTracker) return;

  const w = canvasPitchTracker.width;
  const h = canvasPitchTracker.height;
  if (w <= 0 || h <= 0) return;

  // キャンバス背景塗りつぶし
  ctxPitchTracker.fillStyle = '#020306';
  ctxPitchTracker.fillRect(0, 0, w, h);

  // 音高ガイドライン (C2 ~ C6) & Hzテキスト描画
  const guideLabels = [
    { midi: 36, label: 'C2 (65Hz)' },
    { midi: 48, label: 'C3 (131Hz)' },
    { midi: 60, label: 'C4 (262Hz)' },
    { midi: 72, label: 'C5 (523Hz)' },
    { midi: 84, label: 'C6 (1047Hz)' }
  ];

  const minMidi = 36;
  const maxMidi = 96;

  ctxPitchTracker.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctxPitchTracker.lineWidth = 1;
  ctxPitchTracker.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctxPitchTracker.font = '10px monospace';
  ctxPitchTracker.textAlign = 'right';

  guideLabels.forEach(item => {
    const normY = (item.midi - minMidi) / (maxMidi - minMidi);
    const y = h - (normY * h);
    ctxPitchTracker.beginPath();
    ctxPitchTracker.moveTo(0, y);
    ctxPitchTracker.lineTo(w, y);
    ctxPitchTracker.stroke();

    ctxPitchTracker.fillText(item.label, w - 10, y - 3);
  });

  // ピッチ履歴の保持 ＆ スクロール描画
  if (lastValidF0 > 0) {
    pitchHistory.push(lastValidF0);
  } else {
    pitchHistory.push(0);
  }
  if (pitchHistory.length > MAX_PITCH_HISTORY) pitchHistory.shift();

  const stepX = w / MAX_PITCH_HISTORY;
  for (let i = 0; i < pitchHistory.length; i++) {
    const f0 = pitchHistory[i];
    if (f0 <= 0) continue;

    const midi = 12 * Math.log2(f0 / 440) + 69;
    if (midi >= minMidi && midi <= maxMidi) {
      const normY = (midi - minMidi) / (maxMidi - minMidi);
      const dotY = h - (normY * h);
      const dotX = i * stepX;

      ctxPitchTracker.fillStyle = '#34d399';
      ctxPitchTracker.beginPath();
      ctxPitchTracker.arc(dotX, dotY, 2, 0, Math.PI * 2);
      ctxPitchTracker.fill();
    }
  }
}

// --------------------------------------------------------------------------
// 9. 描画関数 3: 3段目 Log Hz Spectrum (対数スペクトラム)
// --------------------------------------------------------------------------
function drawSpectrum() {
  if (!ctxSpectrum || !canvasSpectrum) return;

  const w = canvasSpectrum.width;
  const h = canvasSpectrum.height;
  if (w <= 0 || h <= 0) return;

  ctxSpectrum.fillStyle = '#020306';
  ctxSpectrum.fillRect(0, 0, w, h);

  // 周波数グリッド線描画
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

  // リアルタイムスペクトラム波形描画
  if (spectrumAnalyser && audioCtx && audioCtx.state === 'running') {
    const data = new Uint8Array(spectrumAnalyser.frequencyBinCount);
    spectrumAnalyser.getByteFrequencyData(data);

    const totalBins = data.length;
    const sampleRate = audioCtx.sampleRate;

    ctxSpectrum.beginPath();
    ctxSpectrum.strokeStyle = '#38bdf8';
    ctxSpectrum.lineWidth = 1.5;

    for (let x = 0; x < w; x++) {
      const normX = x / w;
      const freq = 30 * Math.pow(20000 / 30, normX);
      const binIdx = Math.round((freq * totalBins * 2) / sampleRate);
      const val = binIdx < data.length ? data[binIdx] : 0;
      const y = h - (val / 255) * (h - 20) - 15;

      if (x === 0) ctxSpectrum.moveTo(x, y);
      else ctxSpectrum.lineTo(x, y);
    }
    ctxSpectrum.stroke();
  }
}

function drawVibratoRadar() {
  if (!ctxVibrato || !canvasVibratoRadar) return;
  const w = canvasVibratoRadar.width;
  const h = canvasVibratoRadar.height;
  ctxVibrato.fillStyle = '#020306';
  ctxVibrato.fillRect(0, 0, w, h);
  ctxVibrato.strokeStyle = 'rgba(168, 85, 247, 0.4)';
  ctxVibrato.beginPath();
  ctxVibrato.arc(w / 2, h / 2, w / 3, 0, Math.PI * 2);
  ctxVibrato.stroke();
}

// --------------------------------------------------------------------------
// 10. イベント処理
// --------------------------------------------------------------------------
function setupReconnectEvent() {
  if (btnReconnect) {
    btnReconnect.addEventListener('click', async () => {
      await startAudioStream();
    });
  }
}

function setupFilterPresets() {
  if (!filterPresets) return;
  const btns = filterPresets.querySelectorAll('.preset-btn');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

function setupDragAndDrop() {
  if (!dropZone) return;
  dropZone.addEventListener('dragover', e => { e.preventDefault(); });
  dropZone.addEventListener('drop', e => { e.preventDefault(); });
}
