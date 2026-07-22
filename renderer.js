// ==========================================================================
// Mana Resonance - Full Feature Audio Suite (1.0.8 Vocal Pitch Engine + 全解析連動)
// PitchTuner, Timbre, BPM, Vibrato, Chord/Key, Range, 3-Band Drum Analyzer 100%連動
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

// 上部 KPI ステータス表示
const pitchFreq = document.getElementById('pitch-freq');
const pitchNote = document.getElementById('pitch-note');
const pitchCentsDisplay = document.getElementById('pitch-cents-display');
const bpmDisplay = document.getElementById('bpm-display');
const timbreDisplay = document.getElementById('timbre-display');
const regChest = document.getElementById('reg-chest');
const regMix = document.getElementById('reg-mix');
const regHead = document.getElementById('reg-head');

const vibratoStatus = document.getElementById('vibrato-status');
const vibratoDot = document.getElementById('vibrato-dot');
const vibratoText = document.getElementById('vibrato-text');
const vibratoDetails = document.getElementById('vibrato-details');

const chordDisplay = document.getElementById('chord-display');
const keyDisplay = document.getElementById('key-display');

const rangeMin = document.getElementById('range-min');
const rangeMax = document.getElementById('range-max');
const rangeSpan = document.getElementById('range-span');
const btnResetRange = document.getElementById('btn-reset-range');
const btnRangeMode = document.getElementById('btn-range-mode');

// 3-Band Drum Analyzer Elements
const barLow = document.getElementById('bar-low');
const barMid = document.getElementById('bar-mid');
const barHigh = document.getElementById('bar-high');
const lowVal = document.getElementById('low-val');
const midVal = document.getElementById('mid-val');
const highVal = document.getElementById('high-val');
const beatEnergy = document.getElementById('beat-energy');
const beatPulseOuter = document.getElementById('beat-pulse-outer');
const beatPulseInner = document.getElementById('beat-pulse-inner');
const kickPeakDisplay = document.getElementById('kick-peak-display');

// --- 2D Contexts ---
let ctxSpectrogram = null;
let ctxPitchTracker = null;
let ctxSpectrum = null;
let ctxVibrato = null;

// --- Audio Nodes ---
let audioCtx = null;
let currentStream = null;
let sourceNode = null;
let pitchAnalyser = null;
let spectrumAnalyser = null;
let lowAnalyser = null;
let midAnalyser = null;
let highAnalyser = null;

let lowFilter = null;
let midFilter = null;
let highFilter = null;

// --- Pitch State ---
let lastValidF0 = -1;
let lastPitchConfidence = 0.0;
let lastPitchTime = performance.now();
const AUTO_RESET_TIMEOUT = 3000;

// Vocal Range Tracking
let lowestMidi = Infinity;
let highestMidi = -Infinity;
let vocalRangeMode = 'high';

// Vibrato Tracking Buffer
const pitchHistory = [];
const PITCH_HISTORY_MAX_LEN = 36;

// 3-Band Drum State
let lowMaxTracker = 40;
let lastLowEnergy = 0;
let beatTimes = [];
let lastBeatTime = 0;
let estimatedBpm = 0;

// Pitch Tracker Buffer
let winPitchTrackerBuffer = null;
let winPitchCtx = null;

// Spectrogram Buffer
let spectroBufferCanvas = null;
let spectroBufferCtx = null;

// FPS Counter
let frameCount = 0;
let lastTime = performance.now();

// MIDI Note Definitions
const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// ==========================================================================
// 1. Initialization
// ==========================================================================
document.addEventListener('DOMContentLoaded', async () => {
  if (canvasSpectrogram) ctxSpectrogram = canvasSpectrogram.getContext('2d');
  if (canvasPitchTracker) ctxPitchTracker = canvasPitchTracker.getContext('2d');
  if (canvasSpectrum) ctxSpectrum = canvasSpectrum.getContext('2d');
  if (canvasVibratoRadar) ctxVibrato = canvasVibratoRadar.getContext('2d');

  setupResizeObservers();
  setupUIEvents();

  await startAudioStream();
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

// ==========================================================================
// 2. Audio Stream Setup (3-Band Filters & Analysers Connected)
// ==========================================================================
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
      console.log('Stream Connected: PC System Audio');
    } catch (e1) {
      try {
        currentStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        console.log('Stream Connected: Microphone');
      } catch (e2) {
        console.warn('Audio stream error:', e2);
      }
    }

    if (currentStream && currentStream.getAudioTracks().length > 0) {
      if (sourceNode) sourceNode.disconnect();
      sourceNode = audioCtx.createMediaStreamSource(currentStream);

      pitchAnalyser = audioCtx.createAnalyser();
      pitchAnalyser.fftSize = 2048;

      spectrumAnalyser = audioCtx.createAnalyser();
      spectrumAnalyser.fftSize = 4096;

      lowAnalyser = audioCtx.createAnalyser();
      lowAnalyser.fftSize = 256;
      midAnalyser = audioCtx.createAnalyser();
      midAnalyser.fftSize = 256;
      highAnalyser = audioCtx.createAnalyser();
      highAnalyser.fftSize = 256;

      lowFilter = audioCtx.createBiquadFilter();
      lowFilter.type = 'lowpass';
      lowFilter.frequency.value = 150;

      midFilter = audioCtx.createBiquadFilter();
      midFilter.type = 'bandpass';
      midFilter.frequency.value = 1300;
      midFilter.Q.value = 1.0;

      highFilter = audioCtx.createBiquadFilter();
      highFilter.type = 'highpass';
      highFilter.frequency.value = 2500;

      sourceNode.connect(pitchAnalyser);
      sourceNode.connect(spectrumAnalyser);

      sourceNode.connect(lowFilter);
      lowFilter.connect(lowAnalyser);

      sourceNode.connect(midFilter);
      midFilter.connect(midAnalyser);

      sourceNode.connect(highFilter);
      highFilter.connect(highAnalyser);
    }
  } catch (err) {
    console.error('Audio Stream Setup Error:', err);
  }
}

// ==========================================================================
// 3. Main Update Loop (100% All Analytics Realtime Linked)
// ==========================================================================
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

  // 全解析関数の更新実行
  analyzeVocalPitch();
  analyzePitchAccuracy(lastValidF0);
  analyzeFormants();
  analyzeChordAndKey(lastValidF0);
  analyzeDrumBeats();

  // キャンバス描画実行
  drawSpectrogram();
  drawPitchTracker();
  drawSpectrum();
  drawVibratoRadar();
}

// ==========================================================================
// 4. 1.0.8 Auto-Correlation Pitch Algorithm
// ==========================================================================
function autoCorrelate(buffer, sampleRate) {
  let rms = 0;
  for (let i = 0; i < buffer.length; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / buffer.length);
  if (rms < 0.003) return -1;

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

  const minLag = Math.floor(sampleRate / 1000);
  const maxLag = Math.floor(sampleRate / 40);

  let bestLag = -1;
  let bestCorrelation = 0;
  const r0 = r[0];
  if (r0 === 0) return -1;

  let firstZero = 0;
  for (let i = 0; i < size - 1; i++) {
    if (r[i] < 0) { firstZero = i; break; }
  }
  if (firstZero === 0) {
    for (let i = 1; i < size - 1; i++) {
      if (r[i] < r[i - 1] && r[i] < r[i + 1]) { firstZero = i; break; }
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

  const confidence = bestLag > -1 ? (bestCorrelation / r0) : 0;
  lastPitchConfidence = confidence;

  if (bestLag > -1 && confidence > 0.15) {
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

// ==========================================================================
// 5. Vocal Pitch Analysis & Range & Vibrato Detector
// ==========================================================================
function analyzeVocalPitch() {
  if (!pitchAnalyser) return;

  const buffer = new Float32Array(pitchAnalyser.fftSize);
  pitchAnalyser.getFloatTimeDomainData(buffer);

  const f0 = autoCorrelate(buffer, audioCtx.sampleRate);

  if (f0 > 0 && f0 < 2000) {
    lastValidF0 = f0;
    lastPitchTime = performance.now();

    if (pitchFreq) pitchFreq.textContent = `${f0.toFixed(1)} Hz`;

    const midiNoteNum = 12 * Math.log2(f0 / 440) + 69;
    const roundedMidi = Math.round(midiNoteNum);
    const octave = Math.floor(roundedMidi / 12) - 1;
    const noteName = noteNames[((roundedMidi % 12) + 12) % 12];
    if (pitchNote) pitchNote.textContent = `${noteName}${octave}`;

    // 音域トラッキング
    let shouldUpdateRange = (vocalRangeMode === 'high') ? (lastPitchConfidence >= 0.65) : true;
    if (shouldUpdateRange) {
      if (roundedMidi < lowestMidi) {
        lowestMidi = roundedMidi;
        const minOct = Math.floor(lowestMidi / 12) - 1;
        const minName = noteNames[((lowestMidi % 12) + 12) % 12];
        if (rangeMin) rangeMin.textContent = `${minName}${minOct}`;
      }
      if (roundedMidi > highestMidi) {
        highestMidi = roundedMidi;
        const maxOct = Math.floor(highestMidi / 12) - 1;
        const maxName = noteNames[((highestMidi % 12) + 12) % 12];
        if (rangeMax) rangeMax.textContent = `${maxName}${maxOct}`;
      }

      if (lowestMidi !== Infinity && highestMidi !== -Infinity && rangeSpan) {
        const semitones = highestMidi - lowestMidi;
        const octs = Math.floor(semitones / 12);
        const remSemi = semitones % 12;
        rangeSpan.textContent = `${octs} Oct ${remSemi} Semi`;
      }
    }

    // Voice Register
    if (regChest && regMix && regHead) {
      regChest.classList.remove('active-chest');
      regMix.classList.remove('active-mix');
      regHead.classList.remove('active-head');

      if (roundedMidi <= 55) regChest.classList.add('active-chest');
      else if (roundedMidi >= 56 && roundedMidi <= 71) regMix.classList.add('active-mix');
      else if (roundedMidi >= 72) regHead.classList.add('active-head');
    }

    // Vibrato history
    pitchHistory.push({ time: performance.now(), pitch: midiNoteNum });
    if (pitchHistory.length > PITCH_HISTORY_MAX_LEN) pitchHistory.shift();
    detectVibrato();

  } else {
    lastValidF0 = -1;
    if (pitchFreq) pitchFreq.textContent = '-- Hz';
    if (pitchNote) pitchNote.textContent = '--';
    if (regChest && regMix && regHead) {
      regChest.classList.remove('active-chest');
      regMix.classList.remove('active-mix');
      regHead.classList.remove('active-head');
    }

    if (performance.now() - lastPitchTime > AUTO_RESET_TIMEOUT) {
      resetVocalRange();
    }

    if (pitchHistory.length > 0) pitchHistory.shift();
    if (vibratoText) vibratoText.textContent = 'OFF';
    if (vibratoDot) vibratoDot.className = 'w-1.5 h-1.5 rounded-full bg-slate-600 inline-block';
  }
}

function detectVibrato() {
  if (pitchHistory.length < 15) {
    if (vibratoText) vibratoText.textContent = 'OFF';
    if (vibratoDot) vibratoDot.className = 'w-1.5 h-1.5 rounded-full bg-slate-600 inline-block';
    if (vibratoDetails) vibratoDetails.textContent = '-- Hz/-- c';
    return;
  }

  const pitches = pitchHistory.map(p => p.pitch);
  const mean = pitches.reduce((a, b) => a + b, 0) / pitches.length;
  const zeroCrossings = [];

  for (let i = 1; i < pitches.length; i++) {
    const prev = pitches[i - 1] - mean;
    const curr = pitches[i] - mean;
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

function resetVocalRange() {
  lowestMidi = Infinity;
  highestMidi = -Infinity;
  if (rangeMin) rangeMin.textContent = '--';
  if (rangeMax) rangeMax.textContent = '--';
  if (rangeSpan) rangeSpan.textContent = '--';
}

// ==========================================================================
// 6. Pitch Tuner, Timbre & Chord/Key Analysis
// ==========================================================================
function analyzePitchAccuracy(f0) {
  if (!pitchCentsDisplay) return;

  if (f0 <= 0) {
    pitchCentsDisplay.textContent = '--';
    pitchCentsDisplay.className = 'text-base font-black font-mono text-slate-500';
    return;
  }

  const midiNote = 12 * Math.log2(f0 / 440) + 69;
  const exactMidi = Math.round(midiNote);
  const targetFreq = 440 * Math.pow(2, (exactMidi - 69) / 12);
  const cents = Math.round(1200 * Math.log2(f0 / targetFreq));

  if (Math.abs(cents) <= 5) {
    pitchCentsDisplay.textContent = `PERFECT (${cents > 0 ? '+' : ''}${cents}c)`;
    pitchCentsDisplay.className = 'text-base font-black font-mono text-emerald-400 animate-pulse';
  } else if (cents > 0) {
    pitchCentsDisplay.textContent = `+${cents}c HIGH`;
    pitchCentsDisplay.className = 'text-base font-black font-mono text-amber-400';
  } else {
    pitchCentsDisplay.textContent = `${cents}c LOW`;
    pitchCentsDisplay.className = 'text-base font-black font-mono text-rose-400';
  }
}

function analyzeFormants() {
  if (!timbreDisplay || !spectrumAnalyser || lastValidF0 <= 0) {
    if (timbreDisplay) timbreDisplay.textContent = '--';
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

  const ratio = f2 / (f1 + 1);
  timbreDisplay.textContent = ratio > 0.85 ? 'BRIGHT (Vowel)' : 'WARM (Chest)';
}

function analyzeChordAndKey(f0) {
  if (f0 <= 0) {
    if (chordDisplay) chordDisplay.textContent = '--';
    if (keyDisplay) keyDisplay.textContent = 'Key: --';
    return;
  }

  const midiNote = 12 * Math.log2(f0 / 440) + 69;
  const root = noteNames[((Math.round(midiNote) % 12) + 12) % 12];
  if (chordDisplay) chordDisplay.textContent = root;
  if (keyDisplay) keyDisplay.textContent = `Key: ${root} Maj`;
}

// ==========================================================================
// 7. 3-Band Drum-Beat Analyzer
// ==========================================================================
function analyzeDrumBeats() {
  if (!lowAnalyser || !midAnalyser || !highAnalyser) return;

  const lowData = new Uint8Array(lowAnalyser.frequencyBinCount);
  const midData = new Uint8Array(midAnalyser.frequencyBinCount);
  const highData = new Uint8Array(highAnalyser.frequencyBinCount);

  lowAnalyser.getByteFrequencyData(lowData);
  midAnalyser.getByteFrequencyData(midData);
  highAnalyser.getByteFrequencyData(highData);

  const getMaxVal = arr => (arr && arr.length > 0) ? Math.max(...arr) : 0;
  const lowAvg = getMaxVal(lowData);
  const midAvg = getMaxVal(midData);
  const highAvg = getMaxVal(highData);

  const gatedLowAvg = lowAvg < 6 ? 0 : lowAvg;
  lowMaxTracker = Math.max(lowMaxTracker * 0.996, gatedLowAvg, 35);

  const lowPct = gatedLowAvg > 0 ? (gatedLowAvg / lowMaxTracker) * 100 : 0;
  const midPct = (midAvg / 255) * 100;
  const highPct = (highAvg / 255) * 100;

  if (barLow) barLow.style.width = `${lowPct}%`;
  if (barMid) barMid.style.width = `${midPct}%`;
  if (barHigh) barHigh.style.width = `${highPct}%`;

  const toDbStr = avg => (avg === 0 ? '-100 dB' : `${Math.round(20 * Math.log10(avg / 255))} dB`);
  if (lowVal) lowVal.textContent = toDbStr(lowAvg);
  if (midVal) midVal.textContent = toDbStr(midAvg);
  if (highVal) highVal.textContent = toDbStr(highAvg);

  if (beatEnergy) beatEnergy.textContent = `${Math.round(lowPct)}%`;
  if (kickPeakDisplay) kickPeakDisplay.textContent = `${Math.round(lowPct)}%`;

  // キックパルスリングアニメーション
  if (beatPulseOuter && beatPulseInner) {
    const scaleOuter = 1.0 + (lowPct / 100) * 0.25;
    const scaleInner = 1.0 + (lowPct / 100) * 0.15;
    beatPulseOuter.style.transform = `scale(${scaleOuter})`;
    beatPulseInner.style.transform = `scale(${scaleInner})`;
  }

  // Realtime BPM Calculation
  const now = performance.now();
  const diff = gatedLowAvg - lastLowEnergy;
  if (gatedLowAvg > 20 && diff > 5) {
    if (lastBeatTime > 0) {
      const interval = now - lastBeatTime;
      if (interval >= 300 && interval <= 1000) {
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

// ==========================================================================
// 8. Vocal Pitch Tracker (1.0.8準拠 シャープドット描画・伸びバグ完全防止)
// ==========================================================================
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

  // 1.0.8 スムーズな左スクロール (1.5px)
  winPitchCtx.drawImage(winPitchTrackerBuffer, -1.5, 0);

  const x = width - 1.5;
  winPitchCtx.fillStyle = '#020306';
  winPitchCtx.fillRect(x, 0, 1.5, height);

  const minMidi = 36;
  const maxMidi = 96;

  // 1.0.8: 有効なピッチ検出時のみ右端に独立した1個のポイント/ドットを描画 (伸びバグを根絶)
  if (lastValidF0 > 0) {
    const midiNoteNum = 12 * Math.log2(lastValidF0 / 440) + 69;
    if (midiNoteNum >= minMidi && midiNoteNum <= maxMidi) {
      const normY = (midiNoteNum - minMidi) / (maxMidi - minMidi);
      const dotY = height - (normY * height);
      const currentX = width - 1;

      const isVocal = (lastPitchConfidence >= 0.35);

      winPitchCtx.beginPath();
      if (isVocal) {
        // ★ ボーカル判定: 鮮やかな緑色でくっきり発光ドット ★
        winPitchCtx.arc(currentX, dotY, 1.8, 0, 2 * Math.PI);
        winPitchCtx.fillStyle = '#22c55e';
        winPitchCtx.shadowColor = '#22c55e';
        winPitchCtx.shadowBlur = 4.0;
      } else {
        // ★ 非ボーカル判定: 完全消去せず半透明に薄く描画 ★
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

  // 音高ガイドライン (C2 ~ C6)
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
// 9. Companion Perspective (スペクトログラム)
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
// 10. Log Hz Spectrum (★ 送信画像2枚目完全一致 Peak発光球 ＆ ツールチップ)
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

// ピークホールド変数 (その場にしばらく留まるアニメーション)
let peakHoldPoint = null;
let lastPeakHoldTime = 0;
const PEAK_HOLD_DURATION_MS = 900; // 0.9秒間その場に留まる

    // ★ Peak発光球 ＋ ツールチップパネル (ホールド留まり仕様) ★
    const nowTime = performance.now();

    if (peakIdx >= 0 && maxVal > 15) {
      const currentPeak = points[peakIdx];
      
      // 新しいピークの更新判定（前回のピークより大きいか、一定時間経過時）
      if (!peakHoldPoint || maxVal >= peakHoldPoint.val * 0.95 || (nowTime - lastPeakHoldTime > PEAK_HOLD_DURATION_MS)) {
        peakHoldPoint = {
          x: currentPeak.x,
          y: currentPeak.y,
          val: maxVal,
          freq: currentPeak.freq
        };
        lastPeakHoldTime = nowTime;
      }
    }

    if (peakHoldPoint && (nowTime - lastPeakHoldTime < PEAK_HOLD_DURATION_MS + 400)) {
      const pkX = peakHoldPoint.x;
      const pkY = peakHoldPoint.y;

      // 1. ピンク/マゼンタ発光球体 (Orb)
      ctxSpectrum.shadowBlur = 14;
      ctxSpectrum.shadowColor = '#f43f5e';

      ctxSpectrum.beginPath();
      ctxSpectrum.arc(pkX, pkY, 4.5, 0, Math.PI * 2);
      ctxSpectrum.fillStyle = '#ffffff';
      ctxSpectrum.fill();

      ctxSpectrum.beginPath();
      ctxSpectrum.arc(pkX, pkY, 7.0, 0, Math.PI * 2);
      ctxSpectrum.fillStyle = 'rgba(244, 63, 94, 0.5)';
      ctxSpectrum.fill();

      ctxSpectrum.shadowBlur = 0; // リセット

      // 2. ピーク情報計算 (dB | Hz | Note + Cent)
      const db = Math.max(-100, Math.min(0, 20 * Math.log10(peakHoldPoint.val / 255)));
      const peakHz = peakHoldPoint.freq;
      const midiNote = 12 * Math.log2(peakHz / 440) + 69;
      const roundedMidi = Math.round(midiNote);
      const targetFreq = 440 * Math.pow(2, (roundedMidi - 69) / 12);
      const cents = Math.round(1200 * Math.log2(peakHz / targetFreq));
      const octave = Math.floor(roundedMidi / 12) - 1;
      const noteName = noteNames[((roundedMidi % 12) + 12) % 12];

      const textStr = `${db.toFixed(1)} dB  |  ${peakHz.toFixed(1)} Hz  |  ${noteName}${octave} ${cents >= 0 ? '+' : ''}${cents}c`;

      // 3. ブラック浮遊ツールチップパネル
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
