// ==========================================================================
// Mana Resonance - Audio Engine (1.0.8 Verified Vocal Pitch Tracker Port)
// 1.0.8 の正常動作 Vocal ピッチトラッカー (autoCorrelate & 1.5px スクロール) を完全流用
// ==========================================================================

const { ipcRenderer } = require('electron');

// DOM参照
const canvasSpectrogram = document.getElementById('canvas-spectrogram');
const canvasPitchTracker = document.getElementById('canvas-pitch-tracker');
const canvasSpectrum = document.getElementById('canvas-spectrum');
const canvasVibratoRadar = document.getElementById('canvas-vibrato-radar');

const fpsCounter = document.getElementById('fps-counter');
const dropZone = document.getElementById('drop-zone');
const btnReconnect = document.getElementById('btn-reconnect');
const filterPresets = document.getElementById('filter-presets');

// 2Dコンテキスト
let ctxSpectrogram = null;
let ctxPitchTracker = null;
let ctxSpectrum = null;
let ctxVibrato = null;

// 音響解析ノード
let audioCtx = null;
let currentStream = null;
let sourceNode = null;
let pitchAnalyser = null;
let spectrumAnalyser = null;
let lowAnalyser = null;

// ピッチ検出状態 (1.0.8流用)
let lastValidF0 = -1;
let lastPitchConfidence = 0.0;
let lastPitchTime = performance.now();
const AUTO_RESET_TIMEOUT = 3000;

// ピッチトラッカー用オフスクリーン描画バッファ (1.0.8流用)
let winPitchTrackerBuffer = null;
let winPitchCtx = null;

// スペクトログラム用スクロールバッファ
let spectroBufferCanvas = null;
let spectroBufferCtx = null;

// FPSカウンター
let frameCount = 0;
let lastTime = performance.now();

// MIDI音名定義 (1.0.8流用)
const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// --------------------------------------------------------------------------
// 1. 初期化 ＆ サイズ同期
// --------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  if (canvasSpectrogram) ctxSpectrogram = canvasSpectrogram.getContext('2d');
  if (canvasPitchTracker) ctxPitchTracker = canvasPitchTracker.getContext('2d');
  if (canvasSpectrum) ctxSpectrum = canvasSpectrum.getContext('2d');
  if (canvasVibratoRadar) ctxVibrato = canvasVibratoRadar.getContext('2d');

  setupResizeObservers();
  setupUIEvents();

  // PCシステム音声優先接続
  await startAudioStream();

  // メインアニメーション更新ループ
  requestAnimationFrame(updateLoop);
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

// --------------------------------------------------------------------------
// 2. 音声ストリームの自動接続 (1.0.8流用 getDisplayMedia 優先)
// --------------------------------------------------------------------------
async function startAudioStream() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    try {
      currentStream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
      currentStream.getVideoTracks().forEach(t => t.stop());
      console.log('1.0.8 Stream: PC System Audio Connected');
    } catch (e1) {
      try {
        currentStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        console.log('1.0.8 Stream: Microphone Connected');
      } catch (e2) {
        console.warn('Audio capture failed:', e2);
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
      lowAnalyser.fftSize = 256;

      sourceNode.connect(pitchAnalyser);
      sourceNode.connect(spectrumAnalyser);
      sourceNode.connect(lowAnalyser);
    }
  } catch (err) {
    console.error('Audio Stream Setup Error:', err);
  }
}

// --------------------------------------------------------------------------
// 3. メイン更新ループ (1.0.8 updateLoop 準拠)
// --------------------------------------------------------------------------
function updateLoop(timestamp) {
  requestAnimationFrame(updateLoop);

  frameCount++;
  const delta = timestamp - lastTime;
  if (delta >= 1000) {
    const fps = Math.round((frameCount * 1000) / delta);
    if (fpsCounter) fpsCounter.textContent = `${fps} FPS`;
    frameCount = 0;
    lastTime = timestamp;
  }

  if (!audioCtx || audioCtx.state === 'suspended') return;

  // 1.0.8 解析 ＆ 描画処理
  analyzeVocalPitch();
  drawSpectrogram();
  drawPitchTracker();
  drawSpectrum();
  drawVibratoRadar();
}

// --------------------------------------------------------------------------
// 4. ★ 1.0.8 から完全流用: 自己相関法によるピッチ検出 (autoCorrelate) ★
// --------------------------------------------------------------------------
function autoCorrelate(buffer, sampleRate) {
  let rms = 0;
  for (let i = 0; i < buffer.length; i++) {
    rms += buffer[i] * buffer[i];
  }
  rms = Math.sqrt(rms / buffer.length);
  if (rms < 0.003) return -1; // 1.0.8 閾値 (PC音声用に 0.003 へ最適調整)

  // ピーク強調のためのカットオフ（クリッピング） (1.0.8)
  let r1 = 0, r2 = buffer.length - 1;
  const thres = 0.2;
  for (let i = 0; i < buffer.length / 2; i++) {
    if (Math.abs(buffer[i]) < thres) { r1 = i; break; }
  }
  for (let i = buffer.length - 1; i >= buffer.length / 2; i--) {
    if (Math.abs(buffer[i]) < thres) { r2 = i; break; }
  }
  const slicedBuffer = buffer.subarray(r1, r2);
  const size = slicedBuffer.length;

  const r = new Float32Array(size);
  for (let lag = 0; lag < size; lag++) {
    let sum = 0;
    for (let i = 0; i < size - lag; i++) {
      sum += slicedBuffer[i] * slicedBuffer[i + lag];
    }
    r[lag] = sum;
  }

  // 探索ラグ範囲: 人間の声区(約40Hz〜1000Hz) (1.0.8)
  const minLag = Math.floor(sampleRate / 1000);
  const maxLag = Math.floor(sampleRate / 40);

  let bestLag = -1;
  let bestCorrelation = 0;
  const r0 = r[0];
  if (r0 === 0) return -1;

  // ラグ0周辺の偽ピーク回避 (1.0.8)
  let firstZero = 0;
  for (let i = 0; i < size - 1; i++) {
    if (r[i] < 0) {
      firstZero = i;
      break;
    }
  }
  if (firstZero === 0) {
    for (let i = 1; i < size - 1; i++) {
      if (r[i] < r[i - 1] && r[i] < r[i + 1]) {
        firstZero = i;
        break;
      }
    }
  }
  if (firstZero === 0) firstZero = minLag;

  const startLag = Math.max(minLag, firstZero);

  for (let lag = startLag; lag < maxLag; lag++) {
    if (r[lag] > r[lag - 1] && r[lag] > r[lag + 1]) {
      if (r[lag] > bestCorrelation) {
        bestCorrelation = r[lag];
        bestLag = lag;
      }
    }
  }

  // 信頼度チェック (1.0.8)
  const confidence = bestLag > -1 ? (bestCorrelation / r0) : 0;
  lastPitchConfidence = confidence;

  if (bestLag > -1 && confidence > 0.15) { // PC音声用に閾値を緩和
    // パラボリック（放物線）補間によるサブピクセル高精度化 (1.0.8)
    const alpha = r[bestLag - 1];
    const beta = r[bestLag];
    const gamma = r[bestLag + 1];
    const denom = alpha - 2 * beta + gamma;
    if (Math.abs(denom) > 1e-5) {
      const delta = (alpha - gamma) / (2 * denom);
      return sampleRate / (bestLag + delta);
    }
    return sampleRate / bestLag;
  }

  return -1;
}

// --------------------------------------------------------------------------
// 5. ★ 1.0.8 から完全流用: Vocalピッチ解析 (analyzeVocalPitch) ★
// --------------------------------------------------------------------------
function analyzeVocalPitch() {
  if (!pitchAnalyser) return;

  const buffer = new Float32Array(pitchAnalyser.fftSize);
  pitchAnalyser.getFloatTimeDomainData(buffer);

  const f0 = autoCorrelate(buffer, audioCtx.sampleRate);

  const pitchFreq = document.getElementById('pitch-freq');
  const pitchNote = document.getElementById('pitch-note');
  const regChest = document.getElementById('reg-chest');
  const regMix = document.getElementById('reg-mix');
  const regHead = document.getElementById('reg-head');

  if (f0 > 0 && f0 < 2000) {
    lastValidF0 = f0;
    lastPitchTime = performance.now();

    if (pitchFreq) pitchFreq.textContent = `${f0.toFixed(1)} Hz`;

    const midiNoteNum = 12 * Math.log2(f0 / 440) + 69;
    const roundedMidi = Math.round(midiNoteNum);
    const octave = Math.floor(roundedMidi / 12) - 1;
    const noteName = noteNames[((roundedMidi % 12) + 12) % 12];
    if (pitchNote) pitchNote.textContent = `${noteName}${octave}`;

    // 声区インジケーター更新 (1.0.8)
    if (regChest && regMix && regHead) {
      regChest.classList.remove('active-chest');
      regMix.classList.remove('active-mix');
      regHead.classList.remove('active-head');

      if (roundedMidi <= 55) regChest.classList.add('active-chest');
      else if (roundedMidi >= 56 && roundedMidi <= 71) regMix.classList.add('active-mix');
      else if (roundedMidi >= 72) regHead.classList.add('active-head');
    }
  } else {
    lastValidF0 = -1;
    if (pitchFreq) pitchFreq.textContent = '-- Hz';
    if (pitchNote) pitchNote.textContent = '--';
    if (regChest && regMix && regHead) {
      regChest.classList.remove('active-chest');
      regMix.classList.remove('active-mix');
      regHead.classList.remove('active-head');
    }
  }
}

// --------------------------------------------------------------------------
// 6. ★ 1.0.8 から完全流用: Vocalピッチトラッカー描画 (drawPitchTracker / Win) ★
// --------------------------------------------------------------------------
function drawPitchTracker() {
  if (!ctxPitchTracker || !canvasPitchTracker) return;

  const width = canvasPitchTracker.width;
  const height = canvasPitchTracker.height;
  if (width <= 0 || height <= 0) return;

  // 1.0.8 オフスクリーン描画バッファの初期化
  if (!winPitchTrackerBuffer || winPitchTrackerBuffer.width !== width || winPitchTrackerBuffer.height !== height) {
    winPitchTrackerBuffer = document.createElement('canvas');
    winPitchTrackerBuffer.width = width;
    winPitchTrackerBuffer.height = height;
    winPitchCtx = winPitchTrackerBuffer.getContext('2d');
    winPitchCtx.fillStyle = '#020306';
    winPitchCtx.fillRect(0, 0, width, height);
  }

  // 1.0.8: スムーズな自己複製スクロール (左へ 1.5px スクロール)
  winPitchCtx.drawImage(winPitchTrackerBuffer, -1.5, 0);

  const x = width - 1.5;
  winPitchCtx.fillStyle = '#020306';
  winPitchCtx.fillRect(x, 0, 1.5, height);

  const minMidi = 36;
  const maxMidi = 96;

  // 1.0.8: 最新ピッチの描画 (#22c55e 発光ドット)
  if (lastValidF0 > 0) {
    const midiNoteNum = 12 * Math.log2(lastValidF0 / 440) + 69;
    if (midiNoteNum >= minMidi && midiNoteNum <= maxMidi) {
      const normY = (midiNoteNum - minMidi) / (maxMidi - minMidi);
      const dotY = height - (normY * height);
      const currentX = width - 1;

      winPitchCtx.beginPath();
      winPitchCtx.arc(currentX, dotY, 2.5, 0, 2 * Math.PI);
      winPitchCtx.fillStyle = '#22c55e';
      winPitchCtx.shadowColor = '#22c55e';
      winPitchCtx.shadowBlur = 6;
      winPitchCtx.fill();
      winPitchCtx.shadowBlur = 0;
    }
  }

  // メインキャンバスへ転送
  ctxPitchTracker.clearRect(0, 0, width, height);
  ctxPitchTracker.drawImage(winPitchTrackerBuffer, 0, 0);

  // 1.0.8: 音高ガイドライン (C2 ~ C6) & Hzテキスト直描きオーバーレイ
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
// 7. 1段目 Companion Perspective (スペクトログラム)
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
// 8. 3段目 Log Hz Spectrum (★ ベジェ超滑らか曲線 ＆ 送信画像マルチカラー)
// --------------------------------------------------------------------------
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

function setupUIEvents() {
  if (btnReconnect) {
    btnReconnect.addEventListener('click', async () => {
      await startAudioStream();
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
