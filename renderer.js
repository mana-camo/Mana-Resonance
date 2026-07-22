// ==========================================================================
// Mana Resonance - Clean & Robust Audio Engine (完全新規リライト版)
// - 対数スペクトラム: ベジェ曲線(Smooth Curve)マルチカラーグラデーション
// - ピッチトラッカー: 右から左へぬるぬる流れる緑色発光リボン
// - 100%常時描画ループ & PCシステム音声優先接続
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

// 音声解析データ
let lastValidF0 = 0;
const MAX_PITCH_HISTORY = 250;
let pitchHistory = new Array(MAX_PITCH_HISTORY).fill(0);

// スペクトログラム用スクロールバッファ
let spectroBufferCanvas = null;
let spectroBufferCtx = null;

// フレーム/FPS
let frameCount = 0;
let lastFpsTimestamp = performance.now();

// --------------------------------------------------------------------------
// 1. 初期化 ＆ サイズ同期
// --------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  if (canvasSpectrogram) ctxSpectrogram = canvasSpectrogram.getContext('2d');
  if (canvasPitchTracker) ctxPitchTracker = canvasPitchTracker.getContext('2d');
  if (canvasSpectrum) ctxSpectrum = canvasSpectrum.getContext('2d');
  if (canvasVibratoRadar) ctxVibrato = canvasVibratoRadar.getContext('2d');

  setupResizeObservers();
  setupEvents();

  // PCシステム音声優先キャプチャ
  await startAudioStream();

  // 100%常時描画ループ起動
  requestAnimationFrame(renderLoop);
});

function setupResizeObservers() {
  const resizeCanvas = (canvas) => {
    if (!canvas || !canvas.parentElement) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    const w = Math.max(20, Math.floor(rect.width));
    const h = Math.max(20, Math.floor(rect.height));

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  };

  const observer = new ResizeObserver(() => {
    resizeCanvas(canvasSpectrogram);
    resizeCanvas(canvasPitchTracker);
    resizeCanvas(canvasSpectrum);
    resizeCanvas(canvasVibratoRadar);
  });

  if (canvasSpectrogram && canvasSpectrogram.parentElement) observer.observe(canvasSpectrogram.parentElement);
  if (canvasPitchTracker && canvasPitchTracker.parentElement) observer.observe(canvasPitchTracker.parentElement);
  if (canvasSpectrum && canvasSpectrum.parentElement) observer.observe(canvasSpectrum.parentElement);
}

// --------------------------------------------------------------------------
// 2. 毎フレーム描画 ＆ 音声解析ループ (100%常時稼働)
// --------------------------------------------------------------------------
let lastRenderTimestamp = 0;
let pitchAnalyzeAccumulator = 0; // 自己相関の間引き用タイマー
const PITCH_ANALYZE_INTERVAL = 33; // 約30fpsレートで解析 (ms)

function renderLoop(timestamp) {
  requestAnimationFrame(renderLoop);

  const frameDelta = timestamp - (lastRenderTimestamp || timestamp);
  lastRenderTimestamp = timestamp;

  // FPS計算
  frameCount++;
  const delta = timestamp - lastFpsTimestamp;
  if (delta >= 1000) {
    if (fpsCounter) fpsCounter.textContent = `${Math.round((frameCount * 1000) / delta)} FPS`;
    frameCount = 0;
    lastFpsTimestamp = timestamp;
  }

  // 音声解析 (重い自己相関は30fps相当に間引いて実行)
  if (audioCtx && audioCtx.state === 'running') {
    pitchAnalyzeAccumulator += frameDelta;
    if (pitchAnalyzeAccumulator >= PITCH_ANALYZE_INTERVAL) {
      pitchAnalyzeAccumulator = 0;
      analyzePitch();
    }
    analyzePitchAccuracy(lastValidF0);
    analyzeBPM();
    analyzeFormants();
    analyzeChord();
  } else {
    lastValidF0 = 0;
  }

  // 描画処理 (audioCtx に関わらず 100% 常時描画)
  // frameDelta を渡してFPS非依存スクロールを実現
  drawSpectrogram();
  drawPitchTracker(frameDelta);
  drawSpectrum();
  drawVibratoRadar();
}

// --------------------------------------------------------------------------
// 3. 音声ストリームの接続 (PCシステム音声最優先)
// --------------------------------------------------------------------------
async function startAudioStream() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    // 第1優先: PCシステム音声キャプチャ
    try {
      currentStream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
      currentStream.getVideoTracks().forEach(t => t.stop());
      console.log('PCシステム音声ストリームの取得に成功しました。');
    } catch (e1) {
      console.warn('getDisplayMedia 失敗。マイク入力へフォールバック:', e1);
      try {
        currentStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        console.log('マイク音声ストリームの取得に成功しました。');
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
      spectrumAnalyser.fftSize = 4096; // 4096ビンで低音域の解像度を極限まで高精細化

      lowAnalyser = audioCtx.createAnalyser();
      lowAnalyser.fftSize = 512;

      sourceNode.connect(pitchAnalyser);
      sourceNode.connect(spectrumAnalyser);
      sourceNode.connect(lowAnalyser);
    }
  } catch (err) {
    console.error('Audio Stream Setup Error:', err);
  }
}

// --------------------------------------------------------------------------
// 4. 音高 (Pitch F0) 自己相関解析
// --------------------------------------------------------------------------
function analyzePitch() {
  if (!pitchAnalyser) return;

  const buffer = new Float32Array(pitchAnalyser.fftSize);
  pitchAnalyser.getFloatTimeDomainData(buffer);

  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  const rms = Math.sqrt(sum / buffer.length);

  if (rms < 0.015) {
    lastValidF0 = 0;
    updatePitchUI(0, '--');
    return;
  }

  const sampleRate = audioCtx.sampleRate;
  const minPeriod = Math.floor(sampleRate / 1000);
  const maxPeriod = Math.floor(sampleRate / 55);

  let bestCorr = 0;
  let bestPeriod = -1;

  for (let period = minPeriod; period <= maxPeriod; period++) {
    let corr = 0;
    for (let i = 0; i < buffer.length - period; i++) {
      corr += buffer[i] * buffer[i + period];
    }
    corr /= (buffer.length - period);

    if (corr > bestCorr) {
      bestCorr = corr;
      bestPeriod = period;
    }
  }

  if (bestPeriod > 0 && bestCorr > 0.1) {
    const f0 = sampleRate / bestPeriod;
    if (f0 >= 55 && f0 <= 1000) {
      lastValidF0 = f0;

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
// 5. 各種インジケーター解析
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
      const bpm = Math.round(60000 / (now - lastBpmBeatTime));
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

  el.textContent = (f2 / (f1 + 1)) > 0.8 ? 'BRIGHT' : 'DEEP';
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
// 6. 1段目 Companion Perspective (スペクトログラム) - 濃淡明瞭化
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
    const sampleRate = audioCtx.sampleRate;
    const totalBins = spectrumAnalyser.frequencyBinCount;

    for (let y = 0; y < h; y++) {
      const normY = 1.0 - (y / h);
      const targetFreq = 440 * Math.pow(2, ((minMidi + normY * (maxMidi - minMidi)) - 69) / 12);
      const binIdx = Math.round((targetFreq * totalBins * 2) / sampleRate);
      const energy = binIdx < data.length ? data[binIdx] : 0;

      if (energy > 12) {
        // ガンマ補正 1.4 で濃淡のコントラストを大幅強化
        const norm = Math.pow(energy / 255, 1.4);
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

  // 音高ガイドテキスト (右側)
  ctxSpectrogram.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctxSpectrogram.font = '9px monospace';
  ctxSpectrogram.textAlign = 'right';
  ctxSpectrogram.fillText('C6 (1047Hz)', w - 10, 14);
  ctxSpectrogram.fillText('C4 (262Hz)', w - 10, h / 2);
  ctxSpectrogram.fillText('C2 (65Hz)', w - 10, h - 8);
}

// --------------------------------------------------------------------------
// 7. 2段目 Vocal Pitch Tracker
// FPS非依存のデルタ時間ベーススクロール ＆ 固定スコープの定数
// --------------------------------------------------------------------------
const PITCH_MIN_MIDI = 36;
const PITCH_MAX_MIDI = 96;
const PITCH_SCROLL_SPEED = 80; // px/秒 (60FPS→約1.3px/frame、160FPS→0.5px/frame)

let pitchBufferCanvas = null;
let pitchBufferCtx = null;
let lastPitchY = -1;
let pitchScrollAccum = 0; // スクロール蓄積量

function drawPitchTracker(frameDelta) {
  if (!ctxPitchTracker || !canvasPitchTracker) return;

  const w = canvasPitchTracker.width;
  const h = canvasPitchTracker.height;
  if (w <= 0 || h <= 0) return;

  // オフスクリーンバッファ初期化
  if (!pitchBufferCanvas || pitchBufferCanvas.width !== w || pitchBufferCanvas.height !== h) {
    pitchBufferCanvas = document.createElement('canvas');
    pitchBufferCanvas.width = w;
    pitchBufferCanvas.height = h;
    pitchBufferCtx = pitchBufferCanvas.getContext('2d');
    pitchBufferCtx.fillStyle = '#020306';
    pitchBufferCtx.fillRect(0, 0, w, h);
    lastPitchY = -1;
    pitchScrollAccum = 0;
  }

  // ★ デルタ時間に基づいてスクロール量を計算 (FPS非依存) ★
  pitchScrollAccum += (PITCH_SCROLL_SPEED * (frameDelta || 16.7)) / 1000;
  const scrollPx = Math.floor(pitchScrollAccum);
  pitchScrollAccum -= scrollPx; // 残り小数を次フレームへ持ち越し

  if (scrollPx > 0) {
    // バッファ全体を左にscrollPxスクロール
    pitchBufferCtx.drawImage(pitchBufferCanvas, -scrollPx, 0);

    // 右端エリアをクリア
    pitchBufferCtx.fillStyle = '#020306';
    pitchBufferCtx.fillRect(w - scrollPx, 0, scrollPx, h);
  }

  // 右端への最新ピッチデータの追加描画
  const x = w - 1;

  if (lastValidF0 > 0) {
    const midi = 12 * Math.log2(lastValidF0 / 440) + 69;
    if (midi >= PITCH_MIN_MIDI && midi <= PITCH_MAX_MIDI) {
      const normY = (midi - PITCH_MIN_MIDI) / (PITCH_MAX_MIDI - PITCH_MIN_MIDI);
      const currentY = h - (normY * h);

      pitchBufferCtx.shadowBlur = 14;
      pitchBufferCtx.shadowColor = '#22c55e';
      pitchBufferCtx.strokeStyle = '#4ade80';
      pitchBufferCtx.lineWidth = 4.5;
      pitchBufferCtx.lineCap = 'round';

      pitchBufferCtx.beginPath();
      if (lastPitchY > 0) {
        pitchBufferCtx.moveTo(x - scrollPx - 1, lastPitchY);
        pitchBufferCtx.lineTo(x, currentY);
      } else {
        // 新たにピッチ検出が始まった瞬間
        pitchBufferCtx.moveTo(x, currentY);
        pitchBufferCtx.lineTo(x + 1, currentY);
      }
      pitchBufferCtx.stroke();
      pitchBufferCtx.shadowBlur = 0;

      lastPitchY = currentY;
    } else {
      lastPitchY = -1;
    }
  } else {
    lastPitchY = -1;
  }

  // メインキャンバスへ転送
  ctxPitchTracker.clearRect(0, 0, w, h);
  ctxPitchTracker.drawImage(pitchBufferCanvas, 0, 0);

  // 音高ガイドライン (C2 ~ C6) & Hzテキスト直描きオーバーレイ
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
    const normY = (item.midi - PITCH_MIN_MIDI) / (PITCH_MAX_MIDI - PITCH_MIN_MIDI);
    const y = h - (normY * h);
    ctxPitchTracker.beginPath();
    ctxPitchTracker.moveTo(0, y);
    ctxPitchTracker.lineTo(w, y);
    ctxPitchTracker.stroke();

    ctxPitchTracker.fillText(item.label, w - 10, y - 3);
  });
}

// --------------------------------------------------------------------------
// 8. 3段目 Log Hz Spectrum (★ ベジェ曲線 Spline 曲線のマルチカラー充填)
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

  // ★ 滑らかなベジェ曲線 (Smooth Spline Curve) で描くマルチカラースペクトラム ★
  if (spectrumAnalyser && audioCtx && audioCtx.state === 'running') {
    const data = new Uint8Array(spectrumAnalyser.frequencyBinCount);
    spectrumAnalyser.getByteFrequencyData(data);

    const totalBins = data.length;
    const sampleRate = audioCtx.sampleRate;

    // 低音域のステップ状段差を完全解消する高解像度サンプリング (200ポイント)
    const numPoints = 200;
    const rawPoints = [];

    for (let i = 0; i <= numPoints; i++) {
      const normX = i / numPoints;
      const x = normX * w;
      const freq = 30 * Math.pow(20000 / 30, normX);
      const exactBin = (freq * totalBins * 2) / sampleRate;

      // 小数ビンの線形補間 (30Hz〜1kHzの階段化を完全防止)
      const b0 = Math.floor(exactBin);
      const b1 = Math.min(totalBins - 1, b0 + 1);
      const frac = exactBin - b0;

      const v0 = b0 < data.length ? data[b0] : 0;
      const v1 = b1 < data.length ? data[b1] : 0;
      const interpolatedVal = v0 * (1 - frac) + v1 * frac;

      const y = h - (interpolatedVal / 255) * (h - 25) - 10;
      rawPoints.push({ x, y });
    }

    // 移動平均平滑化 (Smooth Moving Average Filter)
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

    // Smooth Bezier Curve Path (ベジェ滑らか曲線パス) の生成
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

    // 送信画像と全く同じ縦マルチカラーグラデーション充填
    const grad = ctxSpectrum.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(250, 204, 21, 0.85)'); // イエロー (頂点)
    grad.addColorStop(0.35, 'rgba(251, 146, 60, 0.7)'); // オレンジ
    grad.addColorStop(0.65, 'rgba(225, 29, 72, 0.55)'); // ローズ/マゼンタ
    grad.addColorStop(0.88, 'rgba(126, 34, 206, 0.3)');  // パープル
    grad.addColorStop(1, 'rgba(2, 3, 6, 0.0)');
    ctxSpectrum.fillStyle = grad;
    ctxSpectrum.fill();

    // Smooth Outlined Line (ベジェ滑らかアウトライン)
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

// --------------------------------------------------------------------------
// 9. イベントリスナー設定
// --------------------------------------------------------------------------
function setupEvents() {
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
