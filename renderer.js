// ==========================================================================
// Mana Resonance - Pure Zero-Based Audio Engine (ゼロからの完全新規再設計)
// ==========================================================================

const { ipcRenderer } = require('electron');

// --- DOM Elements ---
const canvasSpectrogram = document.getElementById('canvas-spectrogram');
const canvasPitchTracker = document.getElementById('canvas-pitch-tracker');
const canvasSpectrum = document.getElementById('canvas-spectrum');
const canvasVibratoRadar = document.getElementById('canvas-vibrato-radar');

const fpsCounter = document.getElementById('fps-counter');
const dropZone = document.getElementById('drop-zone');
const btnReconnect = document.getElementById('btn-reconnect');
const filterPresets = document.getElementById('filter-presets');

// --- 2D Contexts ---
let ctxSpectrogram = null;
let ctxPitchTracker = null;
let ctxSpectrum = null;
let ctxVibrato = null;

// --- Audio System ---
let audioCtx = null;
let currentStream = null;
let sourceNode = null;
let pitchAnalyser = null;
let spectrumAnalyser = null;
let lowAnalyser = null;

// --- Pitch State ---
let lastValidF0 = 0;
let lastConfidence = 0;

// --- Buffers & History ---
const PITCH_HISTORY_SIZE = 300;
// Array of { f0, conf }
let pitchRingBuffer = new Array(PITCH_HISTORY_SIZE).fill(null).map(() => ({ f0: 0, conf: 0 }));

let spectroBufferCanvas = null;
let spectroBufferCtx = null;

// --- Rendering Loop State ---
let frameCount = 0;
let lastFpsTimestamp = performance.now();

// ==========================================================================
// 1. App Initialization & Resize Observer
// ==========================================================================
document.addEventListener('DOMContentLoaded', async () => {
  if (canvasSpectrogram) ctxSpectrogram = canvasSpectrogram.getContext('2d');
  if (canvasPitchTracker) ctxPitchTracker = canvasPitchTracker.getContext('2d');
  if (canvasSpectrum) ctxSpectrum = canvasSpectrum.getContext('2d');
  if (canvasVibratoRadar) ctxVibrato = canvasVibratoRadar.getContext('2d');

  setupResizeObservers();
  setupUIEvents();

  // PCシステム音声優先接続
  await initAudioStream();

  // 100%常時メイン描画ループ
  requestAnimationFrame(mainRenderLoop);
});

function setupResizeObservers() {
  const syncSize = (canvas) => {
    if (!canvas || !canvas.parentElement) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    const w = Math.max(10, Math.floor(rect.width));
    const h = Math.max(10, Math.floor(rect.height));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  };

  const observer = new ResizeObserver(() => {
    syncSize(canvasSpectrogram);
    syncSize(canvasPitchTracker);
    syncSize(canvasSpectrum);
    syncSize(canvasVibratoRadar);
  });

  if (canvasSpectrogram?.parentElement) observer.observe(canvasSpectrogram.parentElement);
  if (canvasPitchTracker?.parentElement) observer.observe(canvasPitchTracker.parentElement);
  if (canvasSpectrum?.parentElement) observer.observe(canvasSpectrum.parentElement);
}

// ==========================================================================
// 2. Audio Stream Setup (PC System Audio First, Microphone Fallback)
// ==========================================================================
async function initAudioStream() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    try {
      // 1. PCシステム音声優先
      currentStream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
      currentStream.getVideoTracks().forEach(t => t.stop());
      console.log('Audio Source: PC System Audio Connected');
    } catch (errDisplay) {
      // 2. マイクフォールバック
      try {
        currentStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        console.log('Audio Source: Microphone Connected');
      } catch (errUser) {
        console.warn('Audio capture permission denied or failed:', errUser);
      }
    }

    if (currentStream && currentStream.getAudioTracks().length > 0) {
      if (sourceNode) sourceNode.disconnect();
      sourceNode = audioCtx.createMediaStreamSource(currentStream);

      pitchAnalyser = audioCtx.createAnalyser();
      pitchAnalyser.fftSize = 2048;

      spectrumAnalyser = audioCtx.createAnalyser();
      spectrumAnalyser.fftSize = 4096; // 低音域高分解能化

      lowAnalyser = audioCtx.createAnalyser();
      lowAnalyser.fftSize = 512;

      sourceNode.connect(pitchAnalyser);
      sourceNode.connect(spectrumAnalyser);
      sourceNode.connect(lowAnalyser);
    }
  } catch (err) {
    console.error('Audio Stream Initialization Error:', err);
  }
}

// ==========================================================================
// 3. Main Animation & Analysis Loop (100% Constant 60/160 FPS)
// ==========================================================================
function mainRenderLoop(timestamp) {
  requestAnimationFrame(mainRenderLoop);

  // FPS Counter
  frameCount++;
  const delta = timestamp - lastFpsTimestamp;
  if (delta >= 1000) {
    if (fpsCounter) fpsCounter.textContent = `${Math.round((frameCount * 1000) / delta)} FPS`;
    frameCount = 0;
    lastFpsTimestamp = timestamp;
  }

  // Audio Processing (when running)
  if (audioCtx && audioCtx.state === 'running') {
    processPitchAnalysis();
    processPitchAccuracy(lastValidF0);
    processBPM();
    processFormants();
    processChord();
  } else {
    lastValidF0 = 0;
    lastConfidence = 0;
  }

  // Update Pitch Ring Buffer (Shift Left, Push New)
  pitchRingBuffer.shift();
  pitchRingBuffer.push({ f0: lastValidF0, conf: lastConfidence });

  // Render All Canvas Views (Always active)
  renderSpectrogramView();
  renderPitchTrackerView();
  renderSpectrumView();
  renderVibratoRadarView();
}

// ==========================================================================
// 4. Ultra-Precise Pitch Detection (NSDF Auto-Correlation)
// ==========================================================================
function processPitchAnalysis() {
  if (!pitchAnalyser) return;

  const buffer = new Float32Array(pitchAnalyser.fftSize);
  pitchAnalyser.getFloatTimeDomainData(buffer);

  // 1. RMS Energy
  let sumSq = 0;
  for (let i = 0; i < buffer.length; i++) sumSq += buffer[i] * buffer[i];
  const rms = Math.sqrt(sumSq / buffer.length);

  if (rms < 0.0005) {
    lastValidF0 = 0;
    lastConfidence = 0;
    updatePitchUI(0, '--');
    return;
  }

  // 2. Normalize Signal (Gain Auto-compensation for low PC Audio)
  const normBuffer = new Float32Array(buffer.length);
  const gainScale = 1.0 / (rms * 6);
  for (let i = 0; i < buffer.length; i++) {
    normBuffer[i] = Math.max(-1, Math.min(1, buffer[i] * gainScale));
  }

  const sampleRate = audioCtx.sampleRate;
  const minPeriod = Math.floor(sampleRate / 1200); // Max 1200Hz
  const maxPeriod = Math.floor(sampleRate / 45);   // Min 45Hz

  // 3. NSDF Normalized Correlation Search
  let maxNsdf = -1;
  let bestPeriod = -1;

  for (let tau = minPeriod; tau <= maxPeriod; tau++) {
    let acf = 0;
    let divisor = 0;
    const len = normBuffer.length - tau;

    for (let i = 0; i < len; i++) {
      acf += normBuffer[i] * normBuffer[i + tau];
      divisor += normBuffer[i] * normBuffer[i] + normBuffer[i + tau] * normBuffer[i + tau];
    }

    const nsdf = divisor > 0 ? (2 * acf) / divisor : 0;
    if (nsdf > maxNsdf) {
      maxNsdf = nsdf;
      bestPeriod = tau;
    }
  }

  if (bestPeriod > 0 && maxNsdf > 0.03) {
    const f0 = sampleRate / bestPeriod;
    if (f0 >= 45 && f0 <= 1200) {
      lastValidF0 = f0;
      // Confidence for transparency & glow density (0.15 ~ 1.0)
      lastConfidence = Math.min(1.0, Math.max(0.15, (maxNsdf - 0.03) * 1.6 + rms * 30));

      const midiNote = 12 * Math.log2(f0 / 440) + 69;
      const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      const noteName = noteNames[((Math.round(midiNote) % 12) + 12) % 12] + (Math.floor(Math.round(midiNote) / 12) - 1);

      updatePitchUI(f0, noteName);
      return;
    }
  }

  lastValidF0 = 0;
  lastConfidence = 0;
  updatePitchUI(0, '--');
}

function updatePitchUI(f0, note) {
  const freqEl = document.getElementById('pitch-freq');
  const noteEl = document.getElementById('pitch-note');
  if (freqEl) freqEl.textContent = f0 > 0 ? `${f0.toFixed(1)} Hz` : '-- Hz';
  if (noteEl) noteEl.textContent = note;
}

// ==========================================================================
// 5. Aux Indicators (Tuner, BPM, Formant, Chord)
// ==========================================================================
function processPitchAccuracy(f0) {
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
let lastBeatTime = 0;
function processBPM() {
  const el = document.getElementById('bpm-display');
  if (!el || !lowAnalyser) return;

  const data = new Uint8Array(lowAnalyser.frequencyBinCount);
  lowAnalyser.getByteFrequencyData(data);

  let energy = 0;
  for (let i = 0; i < data.length; i++) energy += data[i];
  energy /= data.length;

  const now = performance.now();
  if (energy > 155 && (now - lastBeatTime) > 280) {
    if (lastBeatTime > 0) {
      const bpm = Math.round(60000 / (now - lastBeatTime));
      if (bpm >= 60 && bpm <= 200) {
        bpmHistory.push(bpm);
        if (bpmHistory.length > 8) bpmHistory.shift();
        const avg = Math.round(bpmHistory.reduce((a, b) => a + b, 0) / bpmHistory.length);
        el.textContent = `${avg} BPM`;
      }
    }
    lastBeatTime = now;
  }
}

function processFormants() {
  const el = document.getElementById('timbre-display');
  if (!el || !spectrumAnalyser || lastValidF0 <= 0) {
    if (el) el.textContent = '--';
    return;
  }

  const data = new Uint8Array(spectrumAnalyser.frequencyBinCount);
  spectrumAnalyser.getByteFrequencyData(data);
  const sr = audioCtx ? audioCtx.sampleRate : 44100;
  const total = data.length;

  let f1 = 0, f2 = 0;
  for (let i = 0; i < total; i++) {
    const freq = (i * sr) / (total * 2);
    if (freq >= 300 && freq < 1000) f1 += data[i];
    else if (freq >= 1000 && freq <= 3000) f2 += data[i];
  }

  el.textContent = (f2 / (f1 + 1)) > 0.8 ? 'BRIGHT' : 'DEEP';
}

function processChord() {
  const chordEl = document.getElementById('chord-display');
  const keyEl = document.getElementById('key-display');
  if (lastValidF0 <= 0) {
    if (chordEl) chordEl.textContent = '--';
    if (keyEl) keyEl.textContent = 'Key: --';
    return;
  }

  const midiNote = 12 * Math.log2(lastValidF0 / 440) + 69;
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const root = noteNames[((Math.round(midiNote) % 12) + 12) % 12];
  if (chordEl) chordEl.textContent = root;
  if (keyEl) keyEl.textContent = `Key: ${root} Maj`;
}

// ==========================================================================
// 6. View 1: Companion Perspective (Spectrogram - High Dynamic Contrast)
// ==========================================================================
function renderSpectrogramView() {
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

  // Shift left 1.5px
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
        // 濃淡メリハリ ガンマ補正 (Gamma 1.45)
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

  // Text overlay
  ctxSpectrogram.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctxSpectrogram.font = '9px monospace';
  ctxSpectrogram.textAlign = 'right';
  ctxSpectrogram.fillText('C6 (1047Hz)', w - 10, 14);
  ctxSpectrogram.fillText('C4 (262Hz)', w - 10, h / 2);
  ctxSpectrogram.fillText('C2 (65Hz)', w - 10, h - 8);
}

// ==========================================================================
// 7. View 2: Vocal Pitch Tracker (右から左へスムーズ流動 ＆ 発光濃淡グラデーション)
// ==========================================================================
function renderPitchTrackerView() {
  if (!ctxPitchTracker || !canvasPitchTracker) return;

  const w = canvasPitchTracker.width;
  const h = canvasPitchTracker.height;
  if (w <= 0 || h <= 0) return;

  // Background
  ctxPitchTracker.fillStyle = '#020306';
  ctxPitchTracker.fillRect(0, 0, w, h);

  const minMidi = 36;
  const maxMidi = 96;

  // 1. Grid Guidelines & Hz Labels
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
    const y = h - (normY * h);
    ctxPitchTracker.beginPath();
    ctxPitchTracker.moveTo(0, y);
    ctxPitchTracker.lineTo(w, y);
    ctxPitchTracker.stroke();

    ctxPitchTracker.fillText(item.label, w - 10, y - 3);
  });

  // 2. Render Smooth Glowing Ribbon Trajectory with Alpha Confidence Gradient
  const stepX = w / (PITCH_HISTORY_SIZE - 1);
  let isPathActive = false;
  let lastPoint = null;

  for (let i = 0; i < pitchRingBuffer.length; i++) {
    const item = pitchRingBuffer[i];
    const f0 = item ? item.f0 : 0;
    const conf = item ? item.conf : 0;

    if (f0 <= 0) {
      if (isPathActive) {
        ctxPitchTracker.stroke();
        ctxPitchTracker.beginPath();
        isPathActive = false;
      }
      lastPoint = null;
      continue;
    }

    const midi = 12 * Math.log2(f0 / 440) + 69;
    if (midi >= minMidi && midi <= maxMidi) {
      const normY = (midi - minMidi) / (maxMidi - minMidi);
      const ptY = h - (normY * h);
      const ptX = i * stepX;

      const alpha = Math.min(1.0, Math.max(0.2, conf));
      const lineWidth = 3.0 + alpha * 2.5;
      const shadowBlur = Math.round(6 + alpha * 10);

      ctxPitchTracker.shadowBlur = shadowBlur;
      ctxPitchTracker.shadowColor = `rgba(34, 197, 94, ${alpha})`;
      ctxPitchTracker.strokeStyle = `rgba(74, 222, 128, ${alpha})`;
      ctxPitchTracker.lineWidth = lineWidth;
      ctxPitchTracker.lineCap = 'round';
      ctxPitchTracker.lineJoin = 'round';

      if (!isPathActive) {
        ctxPitchTracker.beginPath();
        ctxPitchTracker.moveTo(ptX, ptY);
        isPathActive = true;
      } else {
        // ベジェ平滑補間
        const midX = (lastPoint.x + ptX) / 2;
        const midY = (lastPoint.y + ptY) / 2;
        ctxPitchTracker.quadraticCurveTo(lastPoint.x, lastPoint.y, midX, midY);
      }

      lastPoint = { x: ptX, y: ptY };
    }
  }

  if (isPathActive) {
    ctxPitchTracker.stroke();
  }

  // 3. Glowing Lead Aura Head (Rightmost active point)
  if (lastPoint && lastValidF0 > 0) {
    ctxPitchTracker.shadowBlur = 16;
    ctxPitchTracker.shadowColor = '#4ade80';
    ctxPitchTracker.fillStyle = '#86efac';
    ctxPitchTracker.beginPath();
    ctxPitchTracker.arc(lastPoint.x, lastPoint.y, 4, 0, Math.PI * 2);
    ctxPitchTracker.fill();
  }

  ctxPitchTracker.shadowBlur = 0; // Reset
}

// ==========================================================================
// 8. View 3: Log Hz Spectrum (★ ベジェ超滑らか曲線 ＆ 送信画像マルチカラー)
// ==========================================================================
function renderSpectrumView() {
  if (!ctxSpectrum || !canvasSpectrum) return;

  const w = canvasSpectrum.width;
  const h = canvasSpectrum.height;
  if (w <= 0 || h <= 0) return;

  ctxSpectrum.fillStyle = '#020306';
  ctxSpectrum.fillRect(0, 0, w, h);

  // Log Frequency Grid Lines
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

  // Smooth Log Spectrum Waveform
  if (spectrumAnalyser && audioCtx && audioCtx.state === 'running') {
    const data = new Uint8Array(spectrumAnalyser.frequencyBinCount);
    spectrumAnalyser.getByteFrequencyData(data);

    const totalBins = data.length;
    const sr = audioCtx.sampleRate;

    // 高密度220サンプル ＋ 小数点以下内挿補間 (1kHz以下も超スムーズ)
    const numPoints = 220;
    const rawPoints = [];

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

      const y = h - (val / 255) * (h - 25) - 10;
      rawPoints.push({ x, y });
    }

    // 移動平均フィルター (Smoothing Filter)
    const points = [];
    for (let i = 0; i < rawPoints.length; i++) {
      let sumY = 0;
      let count = 0;
      for (let k = -2; k <= 2; k++) {
        const idx = Math.max(0, Math.min(rawPoints.length - 1, i + k));
        sumY += rawPoints[idx].y;
        count++;
      }
      points.push({ x: rawPoints[i].x, y: sumY / count });
    }

    // ベジェ曲線パスの充填
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

    // 送信画像と全く同じプロ仕様マルチカラーグラデーション
    const grad = ctxSpectrum.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(250, 204, 21, 0.85)'); // イエロー
    grad.addColorStop(0.35, 'rgba(251, 146, 60, 0.7)'); // オレンジ
    grad.addColorStop(0.65, 'rgba(225, 29, 72, 0.55)'); // ローズ/マゼンタ
    grad.addColorStop(0.88, 'rgba(126, 34, 206, 0.3)');  // パープル
    grad.addColorStop(1, 'rgba(2, 3, 6, 0.0)');
    ctxSpectrum.fillStyle = grad;
    ctxSpectrum.fill();

    // アウトライン発光線
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
  }
}

function renderVibratoRadarView() {
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

// ==========================================================================
// 9. UI Events Setup
// ==========================================================================
function setupUIEvents() {
  if (btnReconnect) {
    btnReconnect.addEventListener('click', async () => {
      await initAudioStream();
    });
  }

  if (filterPresets) {
    const btns = filterPresets.querySelectorAll('.preset-btn');
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        btns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  if (dropZone) {
    dropZone.addEventListener('dragover', e => { e.preventDefault(); });
    dropZone.addEventListener('drop', e => { e.preventDefault(); });
  }
}
