const { ipcRenderer } = require('electron');

// UI要素の取得
const btnClose = document.getElementById('btn-close');
const btnMinimize = document.getElementById('btn-minimize');
const btnMaximize = document.getElementById('btn-maximize');

const dropZone = document.getElementById('drop-zone');
const filePlayerControls = document.getElementById('file-player-controls');
const btnPlayPause = document.getElementById('btn-play-pause');
const btnStop = document.getElementById('btn-stop');
const seekBar = document.getElementById('seek-bar');
const currentTimeSpan = document.getElementById('current-time');
const durationTimeSpan = document.getElementById('duration-time');
const fileNameSpan = document.getElementById('file-name');
const btnClearFile = document.getElementById('btn-clear-file');
const btnRecord = document.getElementById('btn-record');
const recDot = document.getElementById('rec-dot');
const recText = document.getElementById('rec-text');

// ファイルプレーヤーシーク用フラグ
let isSeeking = false;

const fpsCounter = document.getElementById('fps-counter');
const beatEnergy = document.getElementById('beat-energy');
const bpmDisplay = document.getElementById('bpm-display');

const barLow = document.getElementById('bar-low');
const barMid = document.getElementById('bar-mid');
const barHigh = document.getElementById('bar-high');
const lowVal = document.getElementById('low-val');
const midVal = document.getElementById('mid-val');
const highVal = document.getElementById('high-val');

const pitchFreq = document.getElementById('pitch-freq');
const pitchNote = document.getElementById('pitch-note');
const regChest = document.getElementById('reg-chest');
const regMix = document.getElementById('reg-mix');
const regHead = document.getElementById('reg-head');

const vibratoStatus = document.getElementById('vibrato-status');
const vibratoDot = document.getElementById('vibrato-dot');
const vibratoText = document.getElementById('vibrato-text');
const vibratoDetails = document.getElementById('vibrato-details');
const canvasVibratoRadar = document.getElementById('canvas-vibrato-radar');
const chordDisplay = document.getElementById('chord-display');
const keyDisplay = document.getElementById('key-display');

const rangeMin = document.getElementById('range-min');
const rangeMax = document.getElementById('range-max');
const rangeSpan = document.getElementById('range-span');
const btnResetRange = document.getElementById('btn-reset-range');
const btnRangeMode = document.getElementById('btn-range-mode');

const canvasSpectrogram = document.getElementById('canvas-spectrogram');
const canvasPitchTracker = document.getElementById('canvas-pitch-tracker');
const canvasSpectrum = document.getElementById('canvas-spectrum');
const canvas3Band = document.getElementById('canvas-3band');
let ctx3Band = null;

const beatPulseOuter = document.getElementById('beat-pulse-outer');
const beatPulseInner = document.getElementById('beat-pulse-inner');
const kickPeakDisplay = document.getElementById('kick-peak-display');
const btnReconnect = document.getElementById('btn-reconnect');

// ウィンドウコントロールの設定
btnClose.addEventListener('click', () => ipcRenderer.send('window-close'));
btnMinimize.addEventListener('click', () => ipcRenderer.send('window-minimize'));
btnMaximize.addEventListener('click', () => ipcRenderer.send('window-maximize'));

// 音響解析用変数
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

// 音声ファイルプレーヤー
let audioElement = null;
let fileSourceNode = null;
let isPlayingFile = false;

// ピッチトラッキング用バッファ
const pitchHistory = []; // ビブラート検出用のスライディングバッファ (直近600ms用)
const PITCH_HISTORY_MAX_LEN = 36; // 60fpsで600ms = 36サンプル

// 音域トラッキング
let lowestMidi = Infinity;
let highestMidi = -Infinity;
let lastPitchTime = performance.now(); // 最終ピッチ検出時間
const AUTO_RESET_TIMEOUT = 3000; // 無音自動リセット閾値 (3秒)
let vocalRangeMode = 'high'; // 'high' (高精度のみ) or 'all' (すべて)
let lastPitchConfidence = 0.0; // 最近検出されたピッチの自己相関信頼度スコア

// ドラムビートビジュアルスケール
let beatPulseScale = 1.0;
let outerPulseScale = 1.0; // 後ろの丸専用のビジュアルスケール
let lowPct = 0; // ドラム音圧 (パーセンテージ)
let lowMaxTracker = 40; // 小さい音量でも動作させるための自動ゲイン追従トラッカー
let outputGainNode = null; // スピーカー再生出力の音量制御（ミュート）用
let isMuted = true; // 初期状態はミュート（消音オン）

// ピークホールド機能用の変数 (切り替わりを目立たなくする)
let holdPeakHz = 0;
let holdPeakDb = -100;
let holdPeakMaxVal = 0;
let holdPeakTime = 0;
const PEAK_HOLD_DURATION = 1500; // 1.5秒ホールド
let lastLowEnergy = 0;
let lowEnergyThreshold = 55; // 最大値基準に合わせたビート検出閾値
let beatTimes = []; // ビート間隔記録用 (BPM推定用)
let lastBeatTime = 0; // 前回のビート検出時間
let estimatedBpm = 0;

// Canvas レンダリング用
let ctxSpectrogram = null;
let ctxPitchTracker = null;
let ctxSpectrum = null;
let ctxParticles = null;
let scrollPitchHistory = [];
let spectrogramHistory = [];
const MAC_MAX_HISTORY = 200; // Windows版と同じ速度で流れるように同期

// Windows用オフスクリーン描画バッファ
let winSpectrogramBuffer = null;
let winSpectroCtx = null;
let winPitchTrackerBuffer = null;
let winPitchCtx = null;
let lastTime = performance.now();
let frameCount = 0;

// ピッチトラッカー滑らか曲線連結用
let lastPitchX = -1;
let lastPitchY = -1;

// 3バンド プリセット設定
let activePreset = 'pop';
const bandPresets = {
  pop: { lowCut: 150, midCenter: 1300, highCut: 2500, threshold: 55 },
  edm: { lowCut: 120, midCenter: 1500, highCut: 3500, threshold: 65 },
  acoustic: { lowCut: 200, midCenter: 1000, highCut: 2000, threshold: 45 },
  hardcore: { lowCut: 160, midCenter: 1400, highCut: 3000, threshold: 75 },
  beatbox: { lowCut: 180, midCenter: 1100, highCut: 2200, threshold: 40 }
};

// 光学スペクトラム用
const opticCircles = [];
let opticBeatFactor = 0;
let opticHueShift = 0;

// パーティクル配列
const particles = [];

// コード判定用クロマ履歴
let chromaHistory = [];
const CHROMA_HISTORY_LIMIT = 12;

// 録音・エクスポート関連
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let recDestinationNode = null;

// ファイルロード時のBlob URL
let currentFileUrl = null;

// MIDI音名定義
const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// 初期化処理
window.addEventListener('DOMContentLoaded', async () => {
  // OSネイティブウィンドウ枠の適用調整
  const titleBar = document.querySelector('.title-bar');
  if (titleBar) {
    if (!isMac) {
      // Windows: OS標準のネイティブ枠が着くためHTMLタイトルバーは完全消去
      titleBar.style.display = 'none';
    } else {
      // Mac: 純正のインセット信号機ボタンが出るため、偽ボタンを非表示
      const controls = document.querySelector('.window-controls');
      if (controls) controls.style.visibility = 'hidden';
    }
  }

  initCanvases();
  setupResizeHandler();
  await startAudioStream();
  setupFileDragAndDrop();
  setupRangeReset();
  setupFilterPresetEvents();
  setupRecordEvents();
  setupMuteEvent();
  setupDeviceChangeListener();
  setupReconnectEvent();
  
  // アニメーションループ起動
  requestAnimationFrame(updateLoop);
});

// Canvas初期化
function initCanvases() {
  if (canvasSpectrogram) ctxSpectrogram = canvasSpectrogram.getContext('2d');
  if (canvasPitchTracker) ctxPitchTracker = canvasPitchTracker.getContext('2d');
  if (canvasSpectrum) ctxSpectrum = canvasSpectrum.getContext('2d');
  if (canvas3Band) ctx3Band = canvas3Band.getContext('2d');
  resizeCanvases();
}

// 高DPI対応のCanvasサイズ変更
function resizeCanvases() {
  const dpr = window.devicePixelRatio || 1;
  
  // スペクトログラム
  if (canvasSpectrogram && canvasSpectrogram.parentElement) {
    const rectG = canvasSpectrogram.parentElement.getBoundingClientRect();
    canvasSpectrogram.width = Math.max(10, rectG.width * dpr);
    canvasSpectrogram.height = Math.max(10, rectG.height * dpr);
    if (ctxSpectrogram) ctxSpectrogram.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ピッチトラッカー
  if (canvasPitchTracker && canvasPitchTracker.parentElement) {
    const rectP = canvasPitchTracker.parentElement.getBoundingClientRect();
    canvasPitchTracker.width = Math.max(10, rectP.width * dpr);
    canvasPitchTracker.height = Math.max(10, rectP.height * dpr);
    if (ctxPitchTracker) ctxPitchTracker.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // スペクトラム (Log Hz)
  if (canvasSpectrum && canvasSpectrum.parentElement) {
    const rectS = canvasSpectrum.parentElement.getBoundingClientRect();
    canvasSpectrum.width = Math.max(10, rectS.width * dpr);
    canvasSpectrum.height = Math.max(10, rectS.height * dpr);
    if (ctxSpectrum) ctxSpectrum.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // 3-Band スペクトラム
  if (canvas3Band && canvas3Band.parentElement) {
    const rect3 = canvas3Band.parentElement.getBoundingClientRect();
    canvas3Band.width = Math.max(10, rect3.width * dpr);
    canvas3Band.height = Math.max(10, rect3.height * dpr);
    if (ctx3Band) ctx3Band.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

function setupResizeHandler() {
  window.addEventListener('resize', () => {
    resizeCanvases();
  });
}

// 音域リセット設定＆高精度トグル設定
function setupRangeReset() {
  if (btnResetRange) {
    btnResetRange.addEventListener('click', () => {
      resetVocalRange();
    });
  }

  if (btnRangeMode) {
    btnRangeMode.addEventListener('click', () => {
      if (vocalRangeMode === 'high') {
        vocalRangeMode = 'all';
        btnRangeMode.textContent = 'ALL DETECT';
        btnRangeMode.classList.remove('bg-emerald-500/15', 'text-emerald-300', 'border-emerald-500/30');
        btnRangeMode.classList.add('bg-white/5', 'text-slate-400', 'border-white/10');
      } else {
        vocalRangeMode = 'high';
        btnRangeMode.textContent = 'HIGH CONF';
        btnRangeMode.classList.remove('bg-white/5', 'text-slate-400', 'border-white/10');
        btnRangeMode.classList.add('bg-emerald-500/15', 'text-emerald-300', 'border-emerald-500/30');
      }
    });
  }
}

// デスクトップ音声の自動開始（デバイス変更の追従対応版）
let isReconnecting = false;
async function startAudioStream() {
  if (isReconnecting) return;
  isReconnecting = true;

  try {
    // 既存ストリームと接続ノードを完全に停止・切断してリセット
    if (sourceNode) {
      try { sourceNode.disconnect(); } catch(e){}
      sourceNode = null;
    }
    if (currentStream) {
      currentStream.getTracks().forEach(track => {
        try { track.stop(); } catch(e){}
      });
      currentStream = null;
    }

    // AudioContext の初期化
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    if (!outputGainNode) {
      outputGainNode = audioCtx.createGain();
      outputGainNode.gain.value = isMuted ? 0 : 1;
      outputGainNode.connect(audioCtx.destination);
    }

    // 第1優先: getDisplayMedia (システム音声キャプチャ)
    try {
      currentStream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: true
      });
      currentStream.getVideoTracks().forEach(track => track.stop());
      console.log('システム音声ストリームの接続に成功しました。');
    } catch (err) {
      console.warn('getDisplayMedia (システム音声) の取得に失敗しました。マイク入力へフォールバックします:', err);
      // 第2優先 (フォールバック): マイク/標準入力
      currentStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
      });
      console.log('マイク音声ストリームの接続に成功しました。');
    }

    if (currentStream && currentStream.getAudioTracks().length > 0) {
      setupAudioNodes(audioCtx.createMediaStreamSource(currentStream));
    }

  } catch (err) {
    console.error('音声ストリームの自動取得に最終失敗しました:', err);
  } finally {
    isReconnecting = false;
  }
}

// 音響解析ノードの組み立て
function setupAudioNodes(source) {
  if (sourceNode) {
    sourceNode.disconnect();
  }
  sourceNode = source;

  // アナライザーの作成
  pitchAnalyser = audioCtx.createAnalyser();
  pitchAnalyser.fftSize = 2048;

  spectrumAnalyser = audioCtx.createAnalyser();
  spectrumAnalyser.fftSize = 2048;
  spectrumAnalyser.smoothingTimeConstant = 0.5;

  lowAnalyser = audioCtx.createAnalyser();
  lowAnalyser.fftSize = 256;
  midAnalyser = audioCtx.createAnalyser();
  midAnalyser.fftSize = 256;
  highAnalyser = audioCtx.createAnalyser();
  highAnalyser.fftSize = 256;

  // 3バンドフィルターの作成
  // LOW: Lowpass 150Hz
  lowFilter = audioCtx.createBiquadFilter();
  lowFilter.type = 'lowpass';
  lowFilter.frequency.value = 150;

  // MID: Bandpass 1300Hz (1.3kHzを中心周波数としてボーカル・スネア帯域をカバー)
  midFilter = audioCtx.createBiquadFilter();
  midFilter.type = 'bandpass';
  midFilter.frequency.value = 1300;
  midFilter.Q.value = 1.0;

  // HIGH: Highpass 2500Hz (2.5kHz以上)
  highFilter = audioCtx.createBiquadFilter();
  highFilter.type = 'highpass';
  highFilter.frequency.value = 2500;

  // ノード接続
  sourceNode.connect(pitchAnalyser);
  sourceNode.connect(spectrumAnalyser);

  // 3バンドパス接続
  sourceNode.connect(lowFilter);
  lowFilter.connect(lowAnalyser);

  sourceNode.connect(midFilter);
  midFilter.connect(midAnalyser);

  sourceNode.connect(highFilter);
  highFilter.connect(highAnalyser);

  // AudioContextのレジューム（ブラウザポリシー対策）
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

// 時間フォーマット補助関数 (例: 125秒 -> 2:05)
function formatTime(seconds) {
  if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

// ドラッグ＆ドロップファイル処理
function setupFileDragAndDrop() {
  // イベント防止
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, e => {
      e.preventDefault();
      e.stopPropagation();
    }, false);
  });

  dropZone.addEventListener('dragover', () => {
    dropZone.classList.add('border-purple-500', 'bg-purple-500/10');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('border-purple-500', 'bg-purple-500/10');
  });

  dropZone.addEventListener('drop', e => {
    dropZone.classList.remove('border-purple-500', 'bg-purple-500/10');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      loadFile(files[0]);
    }
  });

  dropZone.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*,video/*';
    input.onchange = e => {
      if (e.target.files.length > 0) {
        loadFile(e.target.files[0]);
      }
    };
    input.click();
  });

  // 再生/一時停止ボタン
  btnPlayPause.addEventListener('click', () => {
    if (!audioElement) return;
    if (isPlayingFile) {
      audioElement.pause();
      btnPlayPause.textContent = '再生';
      isPlayingFile = false;
    } else {
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      audioElement.play();
      btnPlayPause.textContent = '一時停止';
      isPlayingFile = true;
    }
  });

  // 停止ボタン (頭出しに戻して停止)
  btnStop.addEventListener('click', () => {
    if (!audioElement) return;
    audioElement.pause();
    audioElement.currentTime = 0;
    btnPlayPause.textContent = '再生';
    isPlayingFile = false;
    seekBar.value = 0;
    currentTimeSpan.textContent = '0:00';
  });

  // シークバーの操作 (ドラッグ中)
  seekBar.addEventListener('input', () => {
    isSeeking = true;
    if (audioElement) {
      currentTimeSpan.textContent = formatTime(seekBar.value);
    }
  });

  // シークバーの操作 (ドロップ/値確定時)
  seekBar.addEventListener('change', () => {
    isSeeking = false;
    if (audioElement) {
      audioElement.currentTime = seekBar.value;
    }
  });

  // クリアボタン
  btnClearFile.addEventListener('click', () => {
    stopFilePlay();
    filePlayerControls.classList.add('hidden');
    // デスクトップ音声入力へ切り替え
    startAudioStream();
  });
}

// ローカルファイルのロード
function loadFile(file) {
  stopFilePlay();

  fileNameSpan.textContent = file.name;
  filePlayerControls.classList.remove('hidden');

  currentFileUrl = URL.createObjectURL(file);
  audioElement = new Audio(currentFileUrl);
  audioElement.crossOrigin = 'anonymous';
  audioElement.loop = false; // シークと終了判定を正常に行うためループはオフにする

  // メタデータロード完了時の設定
  audioElement.addEventListener('loadedmetadata', () => {
    const duration = audioElement.duration;
    seekBar.max = Math.floor(duration);
    durationTimeSpan.textContent = formatTime(duration);
    seekBar.value = 0;
    currentTimeSpan.textContent = '0:00';
  });

  // 時間進行イベント
  audioElement.addEventListener('timeupdate', () => {
    if (!isSeeking) {
      seekBar.value = Math.floor(audioElement.currentTime);
      currentTimeSpan.textContent = formatTime(audioElement.currentTime);
    }
  });

  // 再生終了時
  audioElement.addEventListener('ended', () => {
    btnPlayPause.textContent = '再生';
    isPlayingFile = false;
    seekBar.value = 0;
    currentTimeSpan.textContent = '0:00';
  });

  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  if (!outputGainNode) {
    outputGainNode = audioCtx.createGain();
    outputGainNode.gain.value = isMuted ? 0 : 1;
    outputGainNode.connect(audioCtx.destination);
  }

  // 既存のマイク入力ストリームを停止
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
  }

  // ファイルソースノードの接続
  fileSourceNode = audioCtx.createMediaElementSource(audioElement);
  setupAudioNodes(fileSourceNode);

  // 実際の再生音をスピーカー出力用ゲインノードに接続する (直接destinationに接続するのをやめる)
  fileSourceNode.connect(outputGainNode);

  // 自動再生開始
  audioElement.play();
  btnPlayPause.textContent = '一時停止';
  isPlayingFile = true;
}

// ファイル再生の完全停止と解放
function stopFilePlay() {
  if (audioElement) {
    audioElement.pause();
    audioElement.removeAttribute('src');
    audioElement.load();
    audioElement = null;
  }
  if (currentFileUrl) {
    URL.revokeObjectURL(currentFileUrl);
    currentFileUrl = null;
  }
  isPlayingFile = false;
  btnPlayPause.textContent = '再生';
  seekBar.value = 0;
  currentTimeSpan.textContent = '0:00';
  durationTimeSpan.textContent = '0:00';
}

// メイン更新ループ
function updateLoop(timestamp) {
  requestAnimationFrame(updateLoop);

  // FPSカウンターの計算
  frameCount++;
  const delta = timestamp - lastTime;
  if (delta >= 1000) {
    const fps = Math.round((frameCount * 1000) / delta);
    fpsCounter.textContent = `${fps} FPS`;
    frameCount = 0;
    lastTime = timestamp;
  }

  if (!audioCtx || audioCtx.state === 'suspended') return;

  // 各種分析値の処理
  analyzeDrumBeats();
  analyzeVocalPitch();
  drawSpectrogram();
  drawPitchTracker();
  drawSpectrum();
  draw3BandSpectrum();
  drawParticles();
  analyzeChromaAndEstimateChord();
}

// 3バンドドラムビート分析
function analyzeDrumBeats() {
  if (!lowAnalyser || !midAnalyser || !highAnalyser) return;

  const lowData = new Uint8Array(lowAnalyser.frequencyBinCount);
  const midData = new Uint8Array(midAnalyser.frequencyBinCount);
  const highData = new Uint8Array(highAnalyser.frequencyBinCount);

  lowAnalyser.getByteFrequencyData(lowData);
  midAnalyser.getByteFrequencyData(midData);
  highAnalyser.getByteFrequencyData(highData);

  // 各帯域の最大エネルギー（ピーク・アタック値）を求める (全ビンの平均だとフィルターによるゼロ値で値が薄まるため)
  const getMaxVal = arr => (arr && arr.length > 0) ? Math.max(...arr) : 0;
  const lowAvg = getMaxVal(lowData);
  const midAvg = getMaxVal(midData);
  const highAvg = getMaxVal(highData);

  // ノイズゲート: 低音エネルギーが一定（6）未満の場合は完全な無音（0）として扱う
  const gatedLowAvg = lowAvg < 6 ? 0 : lowAvg;

  // 過去の最大低音エネルギーを緩やかにトラッキング (自動ゲイン調整用)
  // 減衰率 0.996 でゆっくりと下降させ、アタックで上昇。最低値は無音ゲイン爆発を防ぐため 35 に設定
  lowMaxTracker = Math.max(lowMaxTracker * 0.996, gatedLowAvg, 35);

  // LEDバー幅の反映 (0% - 100%)
  const maxVal = 255;
  // リアルタイム音圧 (lowPct) をこのトラッカー基準でノーマライズ (自動ゲイン調整)
  // 無音時はノーマライズ後のパーセントも確実に 0% に落とす
  const normalizedLowPct = gatedLowAvg > 0 ? (gatedLowAvg / lowMaxTracker) * 100 : 0;
  lowPct = normalizedLowPct;
  
  const midPct = (midAvg / maxVal) * 100;
  const highPct = (highAvg / maxVal) * 100;

  barLow.style.width = `${lowPct}%`;
  barMid.style.width = `${midPct}%`;
  barHigh.style.width = `${highPct}%`;

  // デシベル相当 of 簡易dB表示 (-100dB ~ 0dB)
  const toDbStr = avg => {
    if (avg === 0) return '-100 dB';
    const db = Math.round(20 * Math.log10(avg / 255));
    return `${db} dB`;
  };
  lowVal.textContent = toDbStr(lowAvg);
  midVal.textContent = toDbStr(midAvg);
  highVal.textContent = toDbStr(highAvg);

  // キックドラムビート検出 (LOW帯域のスパイク)
  // 音が小さい前奏や弱音時でも拾うよう、アタック判定の閾値ガード下限を 8 まで徹底的に引き下げる
  const activeThreshold = Math.max(8, Math.min(lowEnergyThreshold, lowMaxTracker * 0.8));

  // 直前フレームとの差分（アタックの立ち上がり感度）の閾値も、全体の音量に合わせて動的に最小 3.0 まで超高感度化する
  const diffThreshold = Math.max(3.0, Math.min(10.0, lowMaxTracker * 0.15));

  // 直前フレームとの差分と閾値を用いて判定
  const diff = gatedLowAvg - lastLowEnergy;
  const now = performance.now();
  if (gatedLowAvg > activeThreshold && diff > diffThreshold) {
    beatPulseScale = 1.35; // ドラムビート検出で円形ビジュアル拡大
    outerPulseScale = 1.65; // 後ろの丸は大きく跳ね上げて波打つようにする


    // リアルタイムBPM（テンポ）推定ロジック
    if (lastBeatTime > 0) {
      const interval = now - lastBeatTime;
      // 現実的な音楽テンポの範囲 (BPM 60〜200, つまり拍間隔 300ms 〜 1000ms)
      if (interval >= 300 && interval <= 1000) {
        beatTimes.push(interval);
        if (beatTimes.length > 8) {
          beatTimes.shift(); // 直近8回の間隔を保持
        }
        // 平均拍間隔からBPMを算出
        const avgInterval = beatTimes.reduce((a, b) => a + b, 0) / beatTimes.length;
        estimatedBpm = Math.round(60000 / avgInterval);
        if (bpmDisplay) {
          bpmDisplay.textContent = `BPM: ${estimatedBpm}`;
        }
      }
    }
    lastBeatTime = now;
  }
  lastLowEnergy = lowAvg;

  // 3秒間ビート検出がない場合はBPM表示をリセット
  if (now - lastBeatTime > 3000) {
    beatTimes = [];
    estimatedBpm = 0;
    if (bpmDisplay) {
      bpmDisplay.textContent = 'BPM: --';
    }
  }

  // 円の内部にLOWの強さを表示
  const energyPercentage = Math.round(lowPct);
  beatEnergy.textContent = `${energyPercentage}%`;
}

// 自己相関法によるピッチ検出
function autoCorrelate(buffer, sampleRate) {
  let rms = 0;
  for (let i = 0; i < buffer.length; i++) {
    rms += buffer[i] * buffer[i];
  }
  rms = Math.sqrt(rms / buffer.length);
  if (rms < 0.006) return -1; // 閾値未満は無音判定

  // ピーク強調のための簡易カットオフ（クリッピング）
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

  // 探索ラグ範囲: 人間の声区(約40Hz〜1000Hz)
  const minLag = Math.floor(sampleRate / 1000);
  const maxLag = Math.floor(sampleRate / 40);

  let bestLag = -1;
  let bestCorrelation = 0;
  const r0 = r[0];
  if (r0 === 0) return -1;

  // ラグ0周辺の偽ピークを避けるため、極小値（最初の谷）を見つける
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

  // 相関関係の信頼度チェック (0.35以上)
  const confidence = bestLag > -1 ? (bestCorrelation / r0) : 0;
  lastPitchConfidence = confidence;

  if (bestLag > -1 && confidence > 0.35) {
    // パラボリック（放物線）補間によるサブピクセル高精度化
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

// 周波数データから最大音量のピーク周波数（二次補間による高精度算出）とデシベルを求める
function getPeakFrequencyAndDb(data, analyser, audioCtx) {
  if (!data || !analyser || !audioCtx) return { hz: 0, db: -100, maxVal: 0 };
  
  const sampleRate = audioCtx.sampleRate;
  const fftSize = analyser.fftSize;
  const totalBins = data.length;

  let maxVal = -1;
  let maxIdx = -1;

  // 30Hz 〜 20000Hz に相当するビン範囲を探索 (DCオフセットや超低域ノイズを除外)
  const minBin = Math.max(Math.floor((30 * fftSize) / sampleRate), 2);
  const maxBin = Math.min(Math.floor((20000 * fftSize) / sampleRate), totalBins);

  for (let i = minBin; i < maxBin; i++) {
    if (data[i] > maxVal) {
      maxVal = data[i];
      maxIdx = i;
    }
  }

  if (maxIdx === -1 || maxVal === 0) {
    return { hz: 0, db: -100, maxVal: 0 };
  }

  // 精度の高い周波数を算出するため、近隣のビンを用いた二次補間（Parabolic Interpolation）を適用
  let interpolatedIdx = maxIdx;
  if (maxIdx > 0 && maxIdx < totalBins - 1) {
    const alpha = data[maxIdx - 1];
    const beta = data[maxIdx];
    const gamma = data[maxIdx + 1];
    const denom = alpha - 2 * beta + gamma;
    if (Math.abs(denom) > 1e-4) {
      const p = 0.5 * (alpha - gamma) / denom;
      interpolatedIdx = maxIdx + p;
    }
  }

  const hz = (interpolatedIdx * sampleRate) / fftSize;
  // デシベル変換 (255基準)
  const db = Math.round(20 * Math.log10((maxVal || 1) / 255));

  return { hz, db, maxVal };
}

// 歌唱・ビートボックス解析
let lastValidF0 = -1;
function analyzeVocalPitch() {
  if (!pitchAnalyser) return;

  const buffer = new Float32Array(pitchAnalyser.fftSize);
  pitchAnalyser.getFloatTimeDomainData(buffer);

  const f0 = autoCorrelate(buffer, audioCtx.sampleRate);

  if (f0 > 0 && f0 < 2000) {
    lastValidF0 = f0;
    lastPitchTime = performance.now(); // 最終ピッチ検出時間を更新
    // 表示更新
    pitchFreq.textContent = `${f0.toFixed(1)} Hz`;

    // MIDIノート番号への変換
    const midiNoteNum = 12 * Math.log2(f0 / 440) + 69;
    const roundedMidi = Math.round(midiNoteNum);
    const octave = Math.floor(roundedMidi / 12) - 1;
    const noteName = noteNames[roundedMidi % 12];
    pitchNote.textContent = `${noteName}${octave} (MIDI: ${roundedMidi})`;

    // 音域の自動記録 (設定に応じて高精度なデータのみに厳選)
    let shouldUpdateRange = true;
    if (vocalRangeMode === 'high') {
      // 信頼度スコア(自己相関度)が0.78以上の澄んだ単音かつノイズのないピッチのみに厳選
      shouldUpdateRange = (lastPitchConfidence >= 0.78);
    }

    if (shouldUpdateRange) {
      if (roundedMidi < lowestMidi) {
        lowestMidi = roundedMidi;
        const minOctave = Math.floor(lowestMidi / 12) - 1;
        const minName = noteNames[lowestMidi % 12];
        rangeMin.textContent = `${minName}${minOctave}`;
      }
      if (roundedMidi > highestMidi) {
        highestMidi = roundedMidi;
        const maxOctave = Math.floor(highestMidi / 12) - 1;
        const maxName = noteNames[highestMidi % 12];
        rangeMax.textContent = `${maxName}${maxOctave}`;
      }
    }

    // 音域スパンの算出
    if (lowestMidi !== Infinity && highestMidi !== -Infinity) {
      const semitones = highestMidi - lowestMidi;
      const octaves = Math.floor(semitones / 12);
      const remainingSemitones = semitones % 12;
      rangeSpan.textContent = `${octaves} Octave ${remainingSemitones} Semitone`;
    }

    // 声区の自動判別 (G3=55以下, G#3=56〜B4=71, C5=72以上)
    regChest.classList.remove('active-chest');
    regMix.classList.remove('active-mix');
    regHead.classList.remove('active-head');

    if (roundedMidi <= 55) {
      regChest.classList.add('active-chest');
    } else if (roundedMidi >= 56 && roundedMidi <= 71) {
      regMix.classList.add('active-mix');
    } else if (roundedMidi >= 72) {
      regHead.classList.add('active-head');
    }

    // ビブラート用バッファに追記
    pitchHistory.push({ time: performance.now(), pitch: midiNoteNum });
    if (pitchHistory.length > PITCH_HISTORY_MAX_LEN) {
      pitchHistory.shift();
    }

    // ビブラートの評価
    detectVibrato();

  } else {
    // 未検出の場合
    pitchFreq.textContent = '-- Hz';
    pitchNote.textContent = '--';
    regChest.classList.remove('active-chest');
    regMix.classList.remove('active-mix');
    regHead.classList.remove('active-head');

    // 3秒以上音声が途絶えたら音域を自動リセット
    if (performance.now() - lastPitchTime > AUTO_RESET_TIMEOUT) {
      resetVocalRange();
    }

    // ピッチ履歴をフェードアウト
    if (pitchHistory.length > 0) {
      pitchHistory.shift();
    }
    vibratoStatus.className = "text-xs font-bold text-slate-500 flex items-center space-x-1.5 mt-1";
    vibratoDot.className = "w-2 h-2 rounded-full bg-slate-600 inline-block";
    vibratoText.textContent = "OFF";
    vibratoDetails.textContent = "-- Hz / -- cents";
    drawVibratoRadar(0, 0);
    lastValidF0 = -1;
  }
}

// 音域のリセット
function resetVocalRange() {
  lowestMidi = Infinity;
  highestMidi = -Infinity;
  rangeMin.textContent = '--';
  rangeMax.textContent = '--';
  rangeSpan.textContent = '--';
}

// ビブラート検出
function detectVibrato() {
  if (pitchHistory.length < 15) return; // 分析可能な最小限の長さを確保

  const pitches = pitchHistory.map(ph => ph.pitch);
  const times = pitchHistory.map(ph => ph.time);

  // 平均値の算出
  const avgPitch = pitches.reduce((a, b) => a + b, 0) / pitches.length;

  // デトレンド（中心化）
  const detrended = pitches.map(p => p - avgPitch);

  // 揺れの幅（最大値 - 最小値）をセントに変換
  const minP = Math.min(...pitches);
  const maxP = Math.max(...pitches);
  const widthCents = (maxP - minP) * 50; // 片側振幅としてのセント値 (最大-最小の半分 * 100)

  // ゼロ交差法（平均値をまたぐ回数）で周波数を算出
  let crossings = 0;
  for (let i = 1; i < detrended.length; i++) {
    if ((detrended[i - 1] < 0 && detrended[i] >= 0) || (detrended[i - 1] > 0 && detrended[i] <= 0)) {
      crossings++;
    }
  }

  const durationSec = (times[times.length - 1] - times[0]) / 1000;
  if (durationSec <= 0) return;

  const vibFreq = (crossings / 2) / durationSec;

  // 美しいビブラートの基準: 4.0Hz〜8.5Hz、幅が±15〜110セント
  if (vibFreq >= 4.0 && vibFreq <= 8.5 && widthCents >= 15 && widthCents <= 110) {
    vibratoStatus.className = "text-xs font-bold text-green-400 flex items-center space-x-1.5 mt-1";
    vibratoDot.className = "w-2 h-2 rounded-full bg-green-500 inline-block animate-pulse";
    vibratoText.textContent = "DETECTED";
    vibratoDetails.textContent = `${vibFreq.toFixed(1)} Hz / ±${widthCents.toFixed(0)} cents`;
    drawVibratoRadar(vibFreq, widthCents);
  } else {
    vibratoStatus.className = "text-xs font-bold text-slate-500 flex items-center space-x-1.5 mt-1";
    vibratoDot.className = "w-2 h-2 rounded-full bg-slate-600 inline-block";
    vibratoText.textContent = "OFF";
    vibratoDetails.textContent = "-- Hz / -- cents";
    drawVibratoRadar(0, 0);
  }
}

const isMac = navigator.userAgent.toLowerCase().includes('mac');

// --- Spectrogram (Companion Perspective) ---
function drawSpectrogram() {
  if (isMac) {
    drawSpectrogramMac();
  } else {
    drawSpectrogramWin();
  }
}

let macOffscreenCanvas = null;
let macOffscreenCtx = null;
let macImageData = null;

function drawSpectrogramMac() {
  if (!spectrumAnalyser || !ctxSpectrogram) return;

  const width = canvasSpectrogram.clientWidth;
  const height = canvasSpectrogram.clientHeight;
  const dpr = window.devicePixelRatio || 1;

  const renderWidth = Math.floor(width * dpr);
  const renderHeight = Math.floor(height * dpr);

  if (!macOffscreenCanvas || macOffscreenCanvas.width !== renderWidth || macOffscreenCanvas.height !== renderHeight) {
    macOffscreenCanvas = document.createElement('canvas');
    macOffscreenCanvas.width = renderWidth;
    macOffscreenCanvas.height = renderHeight;
    macOffscreenCtx = macOffscreenCanvas.getContext('2d');
    macImageData = macOffscreenCtx.createImageData(renderWidth, renderHeight);
  }

  const data = new Uint8Array(spectrumAnalyser.frequencyBinCount);
  spectrumAnalyser.getByteFrequencyData(data);

  const minMidi = 36;
  const maxMidi = 96;
  const sampleRate = audioCtx.sampleRate;
  const totalBins = spectrumAnalyser.frequencyBinCount;

  const frameEnergy = new Uint8Array(renderHeight);
  for (let y = 0; y < renderHeight; y++) {
    const normY = 1.0 - (y / renderHeight);
    const midiNote = minMidi + normY * (maxMidi - minMidi);
    const targetFreq = 440 * Math.pow(2, (midiNote - 69) / 12);
    const binIdx = Math.round((targetFreq * totalBins * 2) / sampleRate);
    frameEnergy[y] = binIdx < data.length ? data[binIdx] : 0;
  }

  spectrogramHistory.push(frameEnergy);
  if (spectrogramHistory.length > MAC_MAX_HISTORY) {
    spectrogramHistory.shift();
  }

  // 32ビットピクセルバッファによる1フレーム1リクエストの超高速メモリ書き込み
  const buf32 = new Uint32Array(macImageData.data.buffer);
  buf32.fill(0xFF050202); // #020205 一括クリア

  const numCols = spectrogramHistory.length;
  const colWidthPx = renderWidth / MAC_MAX_HISTORY;

  for (let i = 0; i < numCols; i++) {
    const energies = spectrogramHistory[i];
    const startX = Math.floor(i * colWidthPx);
    const endX = Math.min(renderWidth, Math.floor((i + 1) * colWidthPx + 1));

    for (let y = 0; y < renderHeight; y++) {
      const energy = energies[y];
      if (energy <= 0) continue;

      const normEnergy = energy / 255;
      const r = Math.round(6 + normEnergy * 230);
      const g = Math.round(18 + normEnergy * 54);
      const b = Math.round(50 + normEnergy * 103);
      const a = Math.round(38 + normEnergy * 204);

      const color32 = (a << 24) | (b << 16) | (g << 8) | r;

      const rowOffset = y * renderWidth;
      for (let x = startX; x < endX; x++) {
        buf32[rowOffset + x] = color32;
      }
    }
  }

  macOffscreenCtx.putImageData(macImageData, 0, 0);

  ctxSpectrogram.setTransform(1, 0, 0, 1, 0, 0);
  ctxSpectrogram.clearRect(0, 0, canvasSpectrogram.width, canvasSpectrogram.height);
  ctxSpectrogram.drawImage(macOffscreenCanvas, 0, 0);
}

function drawSpectrogramWin() {
  if (!spectrumAnalyser || !ctxSpectrogram) return;

  const width = canvasSpectrogram.clientWidth;
  const height = canvasSpectrogram.clientHeight;

  if (!winSpectrogramBuffer || winSpectrogramBuffer.width !== width || winSpectrogramBuffer.height !== height) {
    winSpectrogramBuffer = document.createElement('canvas');
    winSpectrogramBuffer.width = width;
    winSpectrogramBuffer.height = height;
    winSpectroCtx = winSpectrogramBuffer.getContext('2d');
    winSpectroCtx.fillStyle = '#020205';
    winSpectroCtx.fillRect(0, 0, width, height);
  }

  // Windows: スムーズな自己複製スクロール
  winSpectroCtx.drawImage(winSpectrogramBuffer, -1.5, 0);

  const data = new Uint8Array(spectrumAnalyser.frequencyBinCount);
  spectrumAnalyser.getByteFrequencyData(data);

  const minMidi = 36;
  const maxMidi = 96;
  const x = width - 1.5;
  const sampleRate = audioCtx.sampleRate;
  const totalBins = spectrumAnalyser.frequencyBinCount;

  for (let y = 0; y < height; y++) {
    const normY = 1.0 - (y / height);
    const midiNote = minMidi + normY * (maxMidi - minMidi);
    const targetFreq = 440 * Math.pow(2, (midiNote - 69) / 12);
    const binIdx = Math.round((targetFreq * totalBins * 2) / sampleRate);
    const energy = binIdx < data.length ? data[binIdx] : 0;

    let color;
    if (energy > 0) {
      const normEnergy = energy / 255;
      const r = Math.round(6 + normEnergy * 230);
      const g = Math.round(18 + normEnergy * 54);
      const b = Math.round(50 + normEnergy * 103);
      const a = 0.15 + normEnergy * 0.8;
      color = `rgba(${r}, ${g}, ${b}, ${a})`;
    } else {
      color = 'rgba(2, 2, 5, 1)';
    }

    winSpectroCtx.fillStyle = color;
    winSpectroCtx.fillRect(x, y, 1.5, 1.2);
  }

  ctxSpectrogram.clearRect(0, 0, width, height);
  ctxSpectrogram.drawImage(winSpectrogramBuffer, 0, 0);
}


// --- Pitch Tracker (Vocal Pitch Tracker) ---
function drawPitchTracker() {
  if (isMac) {
    drawPitchTrackerMac();
  } else {
    drawPitchTrackerWin();
  }
}

function drawPitchTrackerMac() {
  if (!ctxPitchTracker) return;

  const cssWidth = canvasPitchTracker.clientWidth;
  const cssHeight = canvasPitchTracker.clientHeight;
  const dpr = window.devicePixelRatio || 1;

  ctxPitchTracker.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctxPitchTracker.fillStyle = '#020205';
  ctxPitchTracker.fillRect(0, 0, cssWidth, cssHeight);

  scrollPitchHistory.push({
    f0: lastValidF0 > 0 ? lastValidF0 : 0,
    confidence: lastValidF0 > 0 ? (typeof lastPitchConfidence !== 'undefined' ? lastPitchConfidence : 1.0) : 0
  });
  if (scrollPitchHistory.length > MAC_MAX_HISTORY) {
    scrollPitchHistory.shift();
  }

  const minMidi = 36;
  const maxMidi = 96;

  // 背景ガイドライン描画
  const guideMidis = [36, 48, 60, 72, 84, 96];
  ctxPitchTracker.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctxPitchTracker.lineWidth = 1;
  guideMidis.forEach(midi => {
    const normY = (midi - minMidi) / (maxMidi - minMidi);
    const y = cssHeight - (normY * cssHeight);
    ctxPitchTracker.beginPath();
    ctxPitchTracker.moveTo(0, y);
    ctxPitchTracker.lineTo(cssWidth, y);
    ctxPitchTracker.stroke();
  });

  const dotXRatio = cssWidth / MAC_MAX_HISTORY;
  const numDots = scrollPitchHistory.length;

  for (let i = 0; i < numDots; i++) {
    const item = scrollPitchHistory[i];
    const f0 = (item && typeof item === 'object') ? item.f0 : item;
    const confidence = (item && typeof item === 'object') ? item.confidence : 1.0;

    if (f0 <= 0) continue;

    const midiNoteNum = 12 * Math.log2(f0 / 440) + 69;
    if (midiNoteNum >= minMidi && midiNoteNum <= maxMidi) {
      const normY = (midiNoteNum - minMidi) / (maxMidi - minMidi);
      const dotY = cssHeight - (normY * cssHeight);
      const dotX = i * dotXRatio;

      // 確信度(0.35〜0.9)に応じてアルファ値を0.1〜1.0にマッピング
      const alpha = Math.max(0.1, Math.min(1.0, (confidence - 0.35) / (0.9 - 0.35)));

      ctxPitchTracker.fillStyle = `rgba(34, 197, 94, ${alpha})`;
      ctxPitchTracker.fillRect(dotX - 1.5, dotY - 1.5, 3, 3); // 非常に軽量な四角ドット
    }
  }
}

function drawPitchTrackerWin() {
  if (!ctxPitchTracker) return;

  const width = canvasPitchTracker.clientWidth;
  const height = canvasPitchTracker.clientHeight;

  if (!winPitchTrackerBuffer || winPitchTrackerBuffer.width !== width || winPitchTrackerBuffer.height !== height) {
    winPitchTrackerBuffer = document.createElement('canvas');
    winPitchTrackerBuffer.width = width;
    winPitchTrackerBuffer.height = height;
    winPitchCtx = winPitchTrackerBuffer.getContext('2d');
    winPitchCtx.fillStyle = '#020205';
    winPitchCtx.fillRect(0, 0, width, height);
  }

  // Windows: スムーズな自己複製スクロール
  winPitchCtx.drawImage(winPitchTrackerBuffer, -1.5, 0);

  const x = width - 1.5;
  winPitchCtx.fillStyle = '#020205';
  winPitchCtx.fillRect(x, 0, 1.5, height);

  const minMidi = 36;
  const maxMidi = 96;

  if (lastValidF0 > 0) {
    const midiNoteNum = 12 * Math.log2(lastValidF0 / 440) + 69;
    if (midiNoteNum >= minMidi && midiNoteNum <= maxMidi) {
      const normY = (midiNoteNum - minMidi) / (maxMidi - minMidi);
      const dotY = height - (normY * height);
      const currentX = width - 1;

      winPitchCtx.beginPath();
      winPitchCtx.arc(currentX, dotY, 2, 0, 2 * Math.PI);
      winPitchCtx.fillStyle = '#22c55e';
      winPitchCtx.shadowColor = '#22c55e';
      winPitchCtx.shadowBlur = 4;
      winPitchCtx.fill();
      winPitchCtx.shadowBlur = 0;
    }
  }

  ctxPitchTracker.clearRect(0, 0, width, height);
  ctxPitchTracker.drawImage(winPitchTrackerBuffer, 0, 0);

  const guideMidis = [36, 48, 60, 72, 84, 96];
  ctxPitchTracker.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctxPitchTracker.lineWidth = 1;
  guideMidis.forEach(midi => {
    const normY = (midi - minMidi) / (maxMidi - minMidi);
    const y = height - (normY * height);
    ctxPitchTracker.beginPath();
    ctxPitchTracker.moveTo(0, y);
    ctxPitchTracker.lineTo(width, y);
    ctxPitchTracker.stroke();
  });
}

// 背景を漂う光学的な屈折円オブジェクト
class OpticCircle {
  constructor(canvasWidth, canvasHeight) {
    this.x = Math.random() * canvasWidth;
    this.y = Math.random() * canvasHeight;
    this.baseSize = 4 + Math.random() * 12; // 初期サイズ (3band用に少し小さめにする)
    this.size = this.baseSize;
    this.angle = Math.random() * Math.PI * 2;
    this.orbitSpeed = (Math.random() - 0.5) * 0.02; // 回転速度
    this.slideSpeed = 0.2 + Math.random() * 0.5; // スライド速度
    this.vx = (Math.random() - 0.5) * this.slideSpeed;
    this.vy = (Math.random() - 0.5) * this.slideSpeed;
    this.hue = Math.random() * 360;
    this.alpha = 0.06 + Math.random() * 0.18;
  }

  update(centerX, centerY, beatFactor, hueShift) {
    // 中心への引き寄せ運動 (収束) - 音圧(beatFactor)で引き寄せ力と速度を同期
    const dx = centerX - this.x;
    const dy = centerY - this.y;
    const dist = Math.sqrt(dx*dx + dy*dy) || 1;
    
    // beatFactor が強いほど中心への加速度が高まる
    this.vx += (dx / dist) * (0.003 + beatFactor * 0.015);
    this.vy += (dy / dist) * (0.003 + beatFactor * 0.015);
    
    // 速度制限を beatFactor で引き上げる (激しく動く)
    const speed = Math.sqrt(this.vx*this.vx + this.vy*this.vy);
    const maxSpeed = 0.8 + beatFactor * 3.5;
    if (speed > maxSpeed) {
      this.vx = (this.vx / speed) * maxSpeed;
      this.vy = (this.vy / speed) * maxSpeed;
    }

    this.x += this.vx;
    this.y += this.vy;

    // オービット軌道運動
    this.angle += this.orbitSpeed;
    this.x += Math.cos(this.angle) * 0.15;
    this.y += Math.sin(this.angle) * 0.15;

    // ビートに同期したサイズ・光量の変化
    this.size = this.baseSize * (1.0 + beatFactor * 0.45);
    this.currentAlpha = Math.min(this.alpha * (1.0 + beatFactor * 1.5), 0.8);
    
    this.currentHue = (this.hue + hueShift) % 360;
  }

  draw(ctx) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    
    const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size);
    grad.addColorStop(0, `hsla(${this.currentHue}, 85%, 65%, ${this.currentAlpha})`);
    grad.addColorStop(0.5, `hsla(${this.currentHue}, 80%, 55%, ${this.currentAlpha * 0.4})`);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    
    ctx.fillStyle = grad;
    ctx.fill();
  }
}

// 対数スペクトラムアナライザー (イコライザー波形のみ)
function drawSpectrum() {
  if (!spectrumAnalyser || !ctxSpectrum) return;

  const width = canvasSpectrum.clientWidth;
  const height = canvasSpectrum.clientHeight;
  const dpr = window.devicePixelRatio || 1;

  // DPRトランスフォームを毎フレーム明示的にリセット・設定 (累積バグの防止)
  ctxSpectrum.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctxSpectrum.fillStyle = '#020205';
  ctxSpectrum.fillRect(0, 0, width, height);

  const data = new Uint8Array(spectrumAnalyser.frequencyBinCount);
  spectrumAnalyser.getByteFrequencyData(data);

  const sampleRate = audioCtx.sampleRate;
  const totalBins = spectrumAnalyser.frequencyBinCount;

  // 対数マッピングの限界周波数
  const minFreq = 30;
  const maxFreq = 20000;

  // ガイドラインを描画
  const gridFreqs = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  ctxSpectrum.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctxSpectrum.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctxSpectrum.font = '9px monospace';
  ctxSpectrum.lineWidth = 1;

  gridFreqs.forEach(freq => {
    const x = width * (Math.log(freq / minFreq) / Math.log(maxFreq / minFreq));
    if (x >= 0 && x <= width) {
      ctxSpectrum.beginPath();
      ctxSpectrum.moveTo(x, 0);
      ctxSpectrum.lineTo(x, height - 15);
      ctxSpectrum.stroke();

      const label = freq >= 1000 ? `${freq / 1000}kHz` : `${freq}Hz`;
      ctxSpectrum.fillText(label, x - 10, height - 4);
    }
  });

  // 波形パスの作成
  ctxSpectrum.beginPath();
  const points = [];
  for (let x = 0; x < width; x++) {
    const freq = minFreq * Math.pow(maxFreq / minFreq, x / width);
    const binIdx = (freq * totalBins * 2) / sampleRate;
    const idxBase = Math.floor(binIdx);
    const idxFract = binIdx - idxBase;
    
    let energy = 0;
    if (idxBase < data.length) {
      const val0 = data[idxBase];
      const val1 = (idxBase + 1 < data.length) ? data[idxBase + 1] : val0;
      energy = val0 + idxFract * (val1 - val0);
    }

    const normEnergy = energy / 255;
    const y = height - 18 - (normEnergy * (height - 30));
    
    if (x === 0) {
      ctxSpectrum.moveTo(x, y);
    } else {
      ctxSpectrum.lineTo(x, y);
    }
    points.push({ x, y });
  }

  // 1. 縦方向の熱（ヒートマップ）グラデーション塗りつぶしの作成
  if (points.length > 0) {
    ctxSpectrum.save();
    ctxSpectrum.beginPath();
    ctxSpectrum.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctxSpectrum.lineTo(points[i].x, points[i].y);
    }
    ctxSpectrum.lineTo(width, height - 18);
    ctxSpectrum.lineTo(0, height - 18);
    ctxSpectrum.closePath();

    // 縦方向に低い部分(青紫)から、中(ピンク)、高い(オレンジ)、最大(黄)に変化するグラデーション
    const heatGrad = ctxSpectrum.createLinearGradient(0, height - 18, 0, 10);
    heatGrad.addColorStop(0.0, 'rgba(59, 130, 246, 0.0)');    // 最下部は透明に近いブルー
    heatGrad.addColorStop(0.2, 'rgba(139, 92, 246, 0.35)');  // 低音量：ディープパープル
    heatGrad.addColorStop(0.5, 'rgba(236, 72, 153, 0.65)');  // 中音量：ビビッドピンク
    heatGrad.addColorStop(0.8, 'rgba(249, 115, 22, 0.88)');   // 大音量：オレンジ 🔥
    heatGrad.addColorStop(1.0, 'rgba(253, 224, 71, 0.95)');   // 最大音量：イエロー 🔥

    ctxSpectrum.fillStyle = heatGrad;
    ctxSpectrum.fill();
    ctxSpectrum.restore();
  }

  // 2. アナライザーの上部のストローク線（音が大きい部分ほど白熱化するグラデーションでシャープに描画）
  ctxSpectrum.beginPath();
  ctxSpectrum.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctxSpectrum.lineTo(points[i].x, points[i].y);
  }
  const strokeGrad = ctxSpectrum.createLinearGradient(0, height - 18, 0, 10);
  strokeGrad.addColorStop(0.0, 'rgba(139, 92, 246, 0.25)');
  strokeGrad.addColorStop(0.5, 'rgba(236, 72, 153, 0.8)');
  strokeGrad.addColorStop(0.8, 'rgba(249, 115, 22, 0.95)'); // 高いところは鮮やかなオレンジ
  strokeGrad.addColorStop(1.0, '#ffffff'); // 頂点は真っ白

  ctxSpectrum.strokeStyle = strokeGrad;
  ctxSpectrum.lineWidth = 2.0;
  ctxSpectrum.stroke();

  // 5. 最大音量ピーク周波数（Hz/dB）を波形上にプロット表示 (ピークホールド処理)
  const instPeak = getPeakFrequencyAndDb(data, spectrumAnalyser, audioCtx);
  const now = performance.now();
  
  // 瞬時ピークが現在のホールド値より大きい、または1.5秒経過したら更新
  if (instPeak.hz > 0 && instPeak.db > -90) {
    if (instPeak.maxVal > holdPeakMaxVal || (now - holdPeakTime > PEAK_HOLD_DURATION)) {
      holdPeakHz = instPeak.hz;
      holdPeakDb = instPeak.db;
      holdPeakMaxVal = instPeak.maxVal;
      holdPeakTime = now;
    }
  } else {
    // 完全に無音が長く続いた場合はゆっくり減衰・リセット
    if (now - holdPeakTime > PEAK_HOLD_DURATION) {
      holdPeakHz = 0;
      holdPeakDb = -100;
      holdPeakMaxVal = 0;
    }
  }

  // ホールドされたピークを使用して描画
  if (holdPeakHz > 0 && holdPeakDb > -90) {
    // 对数軸上のX座標を計算
    const peakX = width * (Math.log(holdPeakHz / minFreq) / Math.log(maxFreq / minFreq));
    
    // Y座標は、最大値（holdPeakMaxVal）の高さ
    const normEnergy = holdPeakMaxVal / 255;
    const peakY = height - 18 - (normEnergy * (height - 30));

    if (peakX >= 0 && peakX <= width) {
      // ピーク地点に光るドットを描画 (ピンクと白の多重円)
      ctxSpectrum.save();
      
      // 光彩（シャドウ）
      ctxSpectrum.shadowColor = '#ec4899';
      ctxSpectrum.shadowBlur = 10;
      
      // 外側の円
      ctxSpectrum.fillStyle = 'rgba(236, 72, 153, 0.85)';
      ctxSpectrum.beginPath();
      ctxSpectrum.arc(peakX, peakY, 4.5, 0, Math.PI * 2);
      ctxSpectrum.fill();
      
      // 内側の白い芯の円
      ctxSpectrum.shadowBlur = 0;
      ctxSpectrum.fillStyle = '#ffffff';
      ctxSpectrum.beginPath();
      ctxSpectrum.arc(peakX, peakY, 1.8, 0, Math.PI * 2);
      ctxSpectrum.fill();

      // フローティングテキストラベルと背景黒ボックスを描画
      const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
      const midiNum = 12 * Math.log2(holdPeakHz / 440) + 69;
      const noteName = holdPeakHz > 0 ? noteNames[Math.round(midiNum) % 12] : '';
      const octave = Math.floor(Math.round(midiNum) / 12) - 1;
      const cents = Math.round((midiNum - Math.round(midiNum)) * 100);
      
      const label = `${holdPeakDb.toFixed(1)} dB | ${holdPeakHz.toFixed(1)} Hz | ${noteName}${octave} ${cents >= 0 ? '+' : ''}${cents}c`;
      ctxSpectrum.font = '9px monospace';

      const textWidth = ctxSpectrum.measureText(label).width;
      const boxW = textWidth + 8;
      const boxH = 14;

      // 表示位置調整
      let textX = peakX;
      let textY = peakY - 11;
      let boxX = peakX - boxW / 2;
      let boxY = peakY - 20;

      // 画面両端からはみ出さないように調整
      if (boxX < 4) {
        boxX = 4;
        textX = boxX + boxW / 2;
      } else if (boxX + boxW > width - 4) {
        boxX = width - boxW - 4;
        textX = boxX + boxW / 2;
      }
      if (boxY < 2) {
        boxY = peakY + 8;
        textY = boxY + 10;
      }

      // 黒い背景ボックスの描画
      ctxSpectrum.fillStyle = 'rgba(15, 23, 42, 0.88)'; // 暗いネイビーの半透明
      ctxSpectrum.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctxSpectrum.lineWidth = 0.8;
      ctxSpectrum.beginPath();
      ctxSpectrum.rect(boxX, boxY, boxW, boxH);
      ctxSpectrum.fill();
      ctxSpectrum.stroke();

      // 白い文字を描画
      ctxSpectrum.fillStyle = '#f8fafc';
      ctxSpectrum.textAlign = 'center';
      ctxSpectrum.fillText(label, textX, textY);
      ctxSpectrum.restore();
    }
  }
}

// フィルタープリセット切り替えイベント登録
function setupFilterPresetEvents() {
  const container = document.getElementById('filter-presets');
  if (!container) return;

  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.preset-btn');
    if (!btn) return;

    // アクティブクラスの切り替え
    container.querySelectorAll('.preset-btn').forEach(b => {
      b.classList.remove('active', 'bg-purple-500/20', 'text-purple-300', 'border-purple-500/30');
      b.classList.add('bg-white/5', 'hover:bg-white/10', 'text-slate-400', 'border-white/10');
    });

    btn.classList.add('active', 'bg-purple-500/20', 'text-purple-300', 'border-purple-500/30');
    btn.classList.remove('bg-white/5', 'hover:bg-white/10', 'text-slate-400', 'border-white/10');

    activePreset = btn.dataset.preset;
    
    // アナライザーのフィルター周波数および閾値を更新
    const preset = bandPresets[activePreset];
    if (lowFilter) lowFilter.frequency.value = preset.lowCut;
    if (midFilter) {
      midFilter.frequency.value = preset.midCenter;
      midFilter.Q.value = 1.0; 
    }
    if (highFilter) highFilter.frequency.value = preset.highCut;
    lowEnergyThreshold = preset.threshold;
  });
}

// 録音 & エクスポートイベント登録
function setupRecordEvents() {
  if (!btnRecord) return;

  btnRecord.addEventListener('click', () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  });
}

// 録音開始
function startRecording() {
  if (!audioCtx) {
    alert("音声の解析ストリームが開始されていません。");
    return;
  }

  recordedChunks = [];
  
  try {
    // 録音用のMediaStreamDestinationを作成
    recDestinationNode = audioCtx.createMediaStreamDestination();
    
    // 現在アクティブな接続元ノードを録音ノードにバイパス接続する
    if (sourceNode) {
      sourceNode.connect(recDestinationNode);
    }
    if (fileSourceNode) {
      fileSourceNode.connect(recDestinationNode);
    }

    // MediaRecorderを初期化
    mediaRecorder = new MediaRecorder(recDestinationNode.stream, {
      mimeType: 'audio/webm;codecs=opus'
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      // 録音データのBlobを作成
      const blob = new Blob(recordedChunks, { type: 'audio/webm' });
      const url = URL.createObjectURL(blob);
      
      // 保存ダイアログ用のaタグを生成してトリガー
      const a = document.createElement('a');
      a.href = url;
      a.download = `ManaAudioPro-Record-${Date.now()}.webm`;
      document.body.appendChild(a);
      a.click();
      
      // クリーンアップ
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      
      // 接続解除
      try {
        if (sourceNode) sourceNode.disconnect(recDestinationNode);
        if (fileSourceNode) fileSourceNode.disconnect(recDestinationNode);
      } catch (err) {
        // すでに解放済みの場合は無視
      }
    };

    mediaRecorder.start();
    isRecording = true;
    
    // UIを録音中状態へ変更 (赤く点滅)
    btnRecord.classList.remove('bg-red-600/10', 'text-red-400', 'border-red-500/30');
    btnRecord.classList.add('bg-red-600/35', 'text-red-200', 'border-red-500/80');
    recDot.classList.add('animate-ping');
    recText.textContent = "REC ON";
    
  } catch (err) {
    console.error("録音の開始に失敗しました:", err);
    alert("録音の開始に失敗しました。この環境ではMediaRecorderがサポートされていない可能性があります。");
  }
}

// 録音停止
function stopRecording() {
  if (!mediaRecorder || !isRecording) return;
  
  mediaRecorder.stop();
  isRecording = false;
  
  // UIを通常状態へ戻す
  btnRecord.classList.add('bg-red-600/10', 'text-red-400', 'border-red-500/30');
  btnRecord.classList.remove('bg-red-600/35', 'text-red-200', 'border-red-500/80');
  recDot.classList.remove('animate-ping');
  recText.textContent = "RECORD";
}

// 出力ミュートトグルイベントの登録
function setupMuteEvent() {
  const btnMute = document.getElementById('btn-mute');
  const muteIcon = document.getElementById('mute-icon');
  const muteText = document.getElementById('mute-text');
  if (!btnMute) return;

  btnMute.addEventListener('click', () => {
    isMuted = !isMuted;
    
    // Web Audio API のゲインノードに反映
    if (outputGainNode) {
      outputGainNode.gain.setValueAtTime(isMuted ? 0 : 1, audioCtx.currentTime);
    }
    
    // UI表示の更新
    if (isMuted) {
      btnMute.classList.remove('bg-white/5', 'text-slate-400', 'border-white/10');
      btnMute.classList.add('bg-purple-500/20', 'text-purple-300', 'border-purple-500/30');
      if (muteIcon) muteIcon.textContent = '🔇';
      if (muteText) muteText.textContent = 'MUTE';
    } else {
      btnMute.classList.remove('bg-purple-500/20', 'text-purple-300', 'border-purple-500/30');
      btnMute.classList.add('bg-white/5', 'text-slate-400', 'border-white/10');
      if (muteIcon) muteIcon.textContent = '🔊';
      if (muteText) muteText.textContent = 'UNMUTE';
    }
  });
}

// デバイス変更（ヘッドホン抜き差し、デフォルト機器の切り替え）イベントの登録
function setupDeviceChangeListener() {
  let deviceChangeTimeout = null;
  navigator.mediaDevices.addEventListener('devicechange', () => {
    console.log('オーディオデバイスの変更を検知しました。再接続をスケジュールします...');
    // Windowsの切り替え処理時間を考慮して600msのディレイ後に自動再起動する (デバウンス)
    if (deviceChangeTimeout) clearTimeout(deviceChangeTimeout);
    deviceChangeTimeout = setTimeout(async () => {
      // ファイル再生中以外（システム音声キャプチャ中）の場合のみ再接続を行う
      if (!isPlayingFile) {
        await startAudioStream();
      }
    }, 600);
  });
}

// 手動再接続（RECONNECT）ボタンのクリックイベント登録
function setupReconnectEvent() {
  if (btnReconnect) {
    btnReconnect.addEventListener('click', async () => {
      // 手動でストリームを再取得・再起動
      await startAudioStream();
    });
  }
}

// ドラム音圧およびビートに同期して、HTMLの円（ただの丸）を滑らかに伸縮させる
function drawParticles() {
  if (!beatPulseOuter || !beatPulseInner) return;

  // 減衰処理 (内側はすばやく、外側はゆったり減衰させて時間差を作る)
  beatPulseScale += (1.0 - beatPulseScale) * 0.12;
  outerPulseScale += (1.0 - outerPulseScale) * 0.07;

  // ドラム音圧 (lowPct) によるリアルタイムな微動も合成 (1.0 〜 1.35 / 1.65 の範囲で鼓動)
  const innerScale = beatPulseScale + (lowPct / 100) * 0.12;
  const outerScale = outerPulseScale + (lowPct / 100) * 0.15;

  // CSS トランスフォームで伸縮を反映
  beatPulseOuter.style.transform = `scale(${outerScale})`;
  beatPulseInner.style.transform = `scale(${innerScale})`;

  // 左カラム中央のピーク周波数表示も更新 (ホールドされているピークを使用)
  if (kickPeakDisplay) {
    if (holdPeakHz > 0 && holdPeakDb > -90) {
      kickPeakDisplay.textContent = `Peak: ${Math.round(holdPeakHz)} Hz (${holdPeakDb} dB)`;
    } else {
      kickPeakDisplay.textContent = `Peak: -- Hz (-- dB)`;
    }
  }
}

// ビブラートレーダーチャートの描画
function drawVibratoRadar(vibratoRate, vibratoWidth) {
  if (!canvasVibratoRadar) return;

  const ctx = canvasVibratoRadar.getContext('2d');
  const width = canvasVibratoRadar.width;
  const height = canvasVibratoRadar.height;
  const centerX = width / 2;
  const centerY = height / 2;

  // 残光を残すため、少しずつクリア
  ctx.fillStyle = 'rgba(2, 2, 5, 0.25)';
  ctx.fillRect(0, 0, width, height);

  // 十字線の描画
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(0, centerY); ctx.lineTo(width, centerY);
  ctx.moveTo(centerX, 0); ctx.lineTo(centerX, height);
  ctx.stroke();

  // 外枠の同心円
  ctx.strokeStyle = 'rgba(139, 92, 246, 0.08)';
  ctx.beginPath();
  ctx.arc(centerX, centerY, width / 2.3, 0, Math.PI * 2);
  ctx.arc(centerX, centerY, width / 4, 0, Math.PI * 2);
  ctx.stroke();

  // ビブラートが有効な場合、レーダー上にプロット
  if (vibratoRate > 0 && vibratoWidth > 0) {
    const normX = Math.min(vibratoWidth / 120, 1.0); // 0〜1に正規化 (120 cents上限)
    const normY = Math.min((vibratoRate - 4) / 6, 1.0); // 0〜1に正規化 (4〜10Hz)

    const plotX = centerX + (normX * (width / 2.5));
    const plotY = centerY - (normY * (height / 2.5));

    // プロット点の描画 (緑色の輝くドット)
    ctx.beginPath();
    ctx.arc(plotX, plotY, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#22c55e';
    ctx.shadowColor = '#22c55e';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

// リアルタイムクロマベクトル抽出 ＆ コード判定
function analyzeChromaAndEstimateChord() {
  if (!spectrumAnalyser || !chordDisplay || !keyDisplay) return;

  const data = new Uint8Array(spectrumAnalyser.frequencyBinCount);
  spectrumAnalyser.getByteFrequencyData(data);

  const sampleRate = audioCtx.sampleRate;
  const totalBins = spectrumAnalyser.frequencyBinCount;

  const chroma = new Float32Array(12);

  const startMidi = 48; // C3
  const endMidi = 84;   // C6

  for (let midi = startMidi; midi <= endMidi; midi++) {
    const f0 = 440 * Math.pow(2, (midi - 69) / 12);
    const semitone = midi % 12;

    for (let harm = 1; harm <= 3; harm++) {
      const f = f0 * harm;
      const binIdx = Math.round((f * totalBins * 2) / sampleRate);
      if (binIdx < data.length) {
        const weight = 1.0 / harm;
        chroma[semitone] += data[binIdx] * weight;
      }
    }
  }

  const maxVal = Math.max(...chroma);
  if (maxVal > 10) {
    for (let i = 0; i < 12; i++) {
      chroma[i] /= maxVal;
    }
    chromaHistory.push(chroma);
    if (chromaHistory.length > CHROMA_HISTORY_LIMIT) {
      chromaHistory.shift();
    }
  } else {
    if (chromaHistory.length > 0) chromaHistory.shift();
    chordDisplay.textContent = '--';
    return;
  }

  const avgChroma = new Float32Array(12);
  for (const c of chromaHistory) {
    for (let i = 0; i < 12; i++) {
      avgChroma[i] += c[i];
    }
  }
  for (let i = 0; i < 12; i++) {
    avgChroma[i] /= chromaHistory.length;
  }

  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const majorPattern = [0, 4, 7];
  const minorPattern = [0, 3, 7];

  let bestChord = '--';
  let maxScore = -1;

  for (let root = 0; root < 12; root++) {
    // Major
    let scoreMaj = 0;
    majorPattern.forEach(interval => {
      const note = (root + interval) % 12;
      scoreMaj += avgChroma[note];
    });
    let penaltyMaj = 0;
    for (let i = 0; i < 12; i++) {
      if (!majorPattern.map(n => (root + n) % 12).includes(i)) {
        penaltyMaj += avgChroma[i] * 0.15;
      }
    }
    const finalScoreMaj = scoreMaj - penaltyMaj;
    if (finalScoreMaj > maxScore) {
      maxScore = finalScoreMaj;
      bestChord = noteNames[root];
    }

    // Minor
    let scoreMin = 0;
    minorPattern.forEach(interval => {
      const note = (root + interval) % 12;
      scoreMin += avgChroma[note];
    });
    let penaltyMin = 0;
    for (let i = 0; i < 12; i++) {
      if (!minorPattern.map(n => (root + n) % 12).includes(i)) {
        penaltyMin += avgChroma[i] * 0.15;
      }
    }
    const finalScoreMin = scoreMin - penaltyMin;
    if (finalScoreMin > maxScore) {
      maxScore = finalScoreMin;
      bestChord = `${noteNames[root]}m`;
    }
  }

  if (maxScore > 0.4) {
    chordDisplay.textContent = bestChord;
    const isMinor = bestChord.endsWith('m');
    const rootName = isMinor ? bestChord.slice(0, -1) : bestChord;
    keyDisplay.textContent = `Key: ${rootName} ${isMinor ? 'Minor' : 'Major'}`;
  } else {
    chordDisplay.textContent = '--';
  }
}

// BETA UPDATES (プレリリース自動検出) トグル状態の同期・保存
(function() {
  try {
    const { ipcRenderer } = require('electron');
    const betaToggle = document.getElementById('beta-update-toggle');
    
    if (betaToggle) {
      // 保存された設定値があればロード (デフォルトは false)
      const savedVal = localStorage.getItem('allowPrerelease') === 'true';
      betaToggle.checked = savedVal;
      
      // メインプロセスへ初期設定値を送信
      ipcRenderer.send('set-allow-prerelease', savedVal);

      // トグルスイッチ変更イベントの監視
      betaToggle.addEventListener('change', function() {
        const isChecked = this.checked;
        localStorage.setItem('allowPrerelease', isChecked);
        ipcRenderer.send('set-allow-prerelease', isChecked);
      });
    }
  } catch (e) {
    console.warn('Beta update settings load failed:', e);
  }
})();

// --- 3-Band Spectrum Analysis ---
function draw3BandSpectrum() {
  if (!spectrumAnalyser || !ctx3Band || !canvas3Band) return;

  const width = canvas3Band.clientWidth;
  const height = canvas3Band.clientHeight;
  const dpr = window.devicePixelRatio || 1;

  ctx3Band.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx3Band.fillStyle = '#020306';
  ctx3Band.fillRect(0, 0, width, height);

  const data = new Uint8Array(spectrumAnalyser.frequencyBinCount);
  spectrumAnalyser.getByteFrequencyData(data);

  const totalBins = data.length;
  const sampleRate = audioCtx.sampleRate;

  let lowSum = 0, lowCount = 0;
  let midSum = 0, midCount = 0;
  let highSum = 0, highCount = 0;

  for (let i = 0; i < totalBins; i++) {
    const freq = (i * sampleRate) / (totalBins * 2);
    const val = data[i];
    if (freq >= 20 && freq < 250) {
      lowSum += val; lowCount++;
    } else if (freq >= 250 && freq < 4000) {
      midSum += val; midCount++;
    } else if (freq >= 4000 && freq <= 20000) {
      highSum += val; highCount++;
    }
  }

  const lowAvg = lowCount > 0 ? (lowSum / lowCount) / 255 : 0;
  const midAvg = midCount > 0 ? (midSum / midCount) / 255 : 0;
  const highAvg = highCount > 0 ? (highSum / highCount) / 255 : 0;

  const bands = [
    { label: 'LOW (BASS)', val: lowAvg, color: '#38bdf8', grad: ['rgba(56, 189, 248, 0.2)', 'rgba(56, 189, 248, 0.9)'] },
    { label: 'MID (VOCAL)', val: midAvg, color: '#c084fc', grad: ['rgba(192, 132, 252, 0.2)', 'rgba(192, 132, 252, 0.9)'] },
    { label: 'HIGH (TREBLE)', val: highAvg, color: '#34d399', grad: ['rgba(52, 211, 153, 0.2)', 'rgba(52, 211, 153, 0.9)'] }
  ];

  const gap = 12;
  const barWidth = (width - gap * 4) / 3;

  bands.forEach((band, idx) => {
    const x = gap + idx * (barWidth + gap);
    const barH = band.val * (height - 30);
    const y = height - 18 - barH;

    // レール
    ctx3Band.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx3Band.fillRect(x, 10, barWidth, height - 28);

    // バー
    if (barH > 0) {
      const g = ctx3Band.createLinearGradient(0, height - 18, 0, Math.max(0, y));
      g.addColorStop(0, band.grad[0]);
      g.addColorStop(1, band.grad[1]);
      ctx3Band.fillStyle = g;
      ctx3Band.fillRect(x, y, barWidth, barH);

      // 上部発光キャップ
      ctx3Band.fillStyle = band.color;
      ctx3Band.fillRect(x, y - 2, barWidth, 2);
    }

    // テキスト
    ctx3Band.fillStyle = band.color;
    ctx3Band.font = 'bold 9px monospace';
    ctx3Band.textAlign = 'center';
    ctx3Band.fillText(band.label, x + barWidth / 2, height - 5);
  });
}
