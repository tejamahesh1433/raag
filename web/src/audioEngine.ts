/** Single shared HTMLAudioElement — avoids orphaned ghost playback. */

let audio: HTMLAudioElement | null = null;

// Web Audio API nodes (created lazily on first audio graph touch)
let _ctx: AudioContext | null = null;
let _src: MediaElementAudioSourceNode | null = null;
let _comp: DynamicsCompressorNode | null = null;
let _analyser: AnalyserNode | null = null;
let _eqBands: BiquadFilterNode[] = [];
let _normalizeOn = false;
let _crossfadeDuration = 0; // seconds

export type EqPreset = "flat" | "bass_boost" | "treble_boost" | "vocal" | "rock" | "pop";

const EQ_FREQUENCIES = [60, 230, 910, 4000, 14000];

const PRESETS: Record<EqPreset, number[]> = {
  flat: [0, 0, 0, 0, 0],
  bass_boost: [6, 4, 0, 0, 0],
  treble_boost: [0, 0, 0, 4, 6],
  vocal: [-2, 2, 5, 1, -2],
  rock: [4, 2, -1, 3, 5],
  pop: [-1, 2, 4, 2, -1],
};

let _currentPreset: EqPreset = "flat";
let _customGains: number[] = [0, 0, 0, 0, 0];

export function getAudio(): HTMLAudioElement {
  if (typeof Audio === "undefined") {
    throw new Error("Audio is not available in this environment");
  }
  if (!audio) {
    audio = new Audio();
    audio.preload = "auto";
  }
  return audio;
}

/** Pause and detach the current source so nothing keeps streaming. */
export function stopAudio(): void {
  if (!audio) return;
  try {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  } catch {
    /* ignore */
  }
}

export function pauseAudio(): void {
  if (!audio) return;
  try {
    audio.pause();
  } catch {
    /* ignore */
  }
}

function _initAudioGraph(): void {
  const el = audio;
  if (!el || _src) return;
  try {
    _ctx = new AudioContext();
    _src = _ctx.createMediaElementSource(el);
    _comp = _ctx.createDynamicsCompressor();
    _comp.threshold.value = -18;
    _comp.knee.value = 30;
    _comp.ratio.value = 8;
    _comp.attack.value = 0.003;
    _comp.release.value = 0.25;

    _eqBands = EQ_FREQUENCIES.map((freq) => {
      const filter = _ctx!.createBiquadFilter();
      filter.type = "peaking";
      filter.frequency.value = freq;
      filter.Q.value = 1.0;
      filter.gain.value = 0;
      return filter;
    });

    _analyser = _ctx.createAnalyser();
    _analyser.fftSize = 256;
    _analyser.smoothingTimeConstant = 0.8;

    _reconnectGraph();
  } catch {
    _ctx = _src = _comp = _analyser = null;
    _eqBands = [];
  }
}

function _reconnectGraph(): void {
  if (!_src || !_ctx) return;
  try {
    _src.disconnect();
    _comp?.disconnect();
    _analyser?.disconnect();
    _eqBands.forEach((b) => b.disconnect());

    let lastNode: AudioNode = _src;
    if (_eqBands.length > 0) {
      for (const filter of _eqBands) {
        lastNode.connect(filter);
        lastNode = filter;
      }
    }

    if (_normalizeOn && _comp) {
      lastNode.connect(_comp);
      lastNode = _comp;
    }

    if (_analyser) {
      lastNode.connect(_analyser);
      _analyser.connect(_ctx.destination);
    } else {
      lastNode.connect(_ctx.destination);
    }

    if (_ctx.state === "suspended") {
      void _ctx.resume();
    }
  } catch {
    /* ignore */
  }
}

/** Toggle loudness normalization via a DynamicsCompressor. */
export function setNormalize(enabled: boolean): void {
  _normalizeOn = enabled;
  _initAudioGraph();
  _reconnectGraph();
}

export function isNormalizeOn(): boolean {
  return _normalizeOn;
}

export function setEqPreset(preset: EqPreset): void {
  _currentPreset = preset;
  const gains = PRESETS[preset] || PRESETS.flat;
  _customGains = [...gains];
  _applyEqGains(_customGains);
}

export function setEqGains(gains: number[]): void {
  _customGains = gains.slice(0, 5);
  _applyEqGains(_customGains);
}

function _applyEqGains(gains: number[]): void {
  _initAudioGraph();
  _eqBands.forEach((filter, index) => {
    if (gains[index] !== undefined) {
      filter.gain.value = gains[index];
    }
  });
}

export function getEqGains(): number[] {
  return [..._customGains];
}

export function getEqPreset(): EqPreset {
  return _currentPreset;
}

export function setCrossfade(seconds: number): void {
  _crossfadeDuration = Math.max(0, Math.min(15, seconds));
}

export function getCrossfade(): number {
  return _crossfadeDuration;
}

/** Ensure Web Audio graph (and analyser) exists — call after user gesture. */
export function ensureAnalyser(): AnalyserNode | null {
  _initAudioGraph();
  return _analyser;
}

export function getAnalyser(): AnalyserNode | null {
  return _analyser;
}
