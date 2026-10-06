/** Dual-buffer audio engine — EQ, normalize, analyser, gapless / crossfade. */

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

let _a: HTMLAudioElement | null = null;
let _b: HTMLAudioElement | null = null;
let _active: "a" | "b" = "a";
let _ctx: AudioContext | null = null;
let _srcA: MediaElementAudioSourceNode | null = null;
let _srcB: MediaElementAudioSourceNode | null = null;
let _gainA: GainNode | null = null;
let _gainB: GainNode | null = null;
let _comp: DynamicsCompressorNode | null = null;
let _analyser: AnalyserNode | null = null;
let _eqBands: BiquadFilterNode[] = [];
let _normalizeOn = false;
let _crossfadeDuration = 0;
let _gapless = true;
let _currentPreset: EqPreset = "flat";
let _customGains: number[] = [0, 0, 0, 0, 0];
let _preloadedUrl: string | null = null;
let _switching = false;

function _makeAudio(): HTMLAudioElement {
  const el = new Audio();
  el.preload = "auto";
  el.setAttribute("x-webkit-airplay", "allow");
  el.setAttribute("playsinline", "true");
  // @ts-expect-error webkit AirPlay
  el.webkitPlaysinline = true;
  return el;
}

function _ensureElements(): void {
  if (typeof Audio === "undefined") throw new Error("Audio unavailable");
  if (!_a) _a = _makeAudio();
  if (!_b) _b = _makeAudio();
}

export function getAudio(): HTMLAudioElement {
  _ensureElements();
  return _active === "a" ? _a! : _b!;
}

function _inactive(): HTMLAudioElement {
  _ensureElements();
  return _active === "a" ? _b! : _a!;
}

export function stopAudio(): void {
  for (const el of [_a, _b]) {
    if (!el) continue;
    try {
      el.pause();
      el.removeAttribute("src");
      el.load();
    } catch {
      /* ignore */
    }
  }
  _preloadedUrl = null;
}

export function pauseAudio(): void {
  try {
    getAudio().pause();
  } catch {
    /* ignore */
  }
  try {
    _inactive().pause();
  } catch {
    /* ignore */
  }
}

function _initAudioGraph(): void {
  _ensureElements();
  if (_srcA && _srcB) return;
  try {
    _ctx = new AudioContext();
    _srcA = _ctx.createMediaElementSource(_a!);
    _srcB = _ctx.createMediaElementSource(_b!);
    _gainA = _ctx.createGain();
    _gainB = _ctx.createGain();
    _gainA.gain.value = _active === "a" ? 1 : 0;
    _gainB.gain.value = _active === "b" ? 1 : 0;

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
    _ctx = _srcA = _srcB = _gainA = _gainB = _comp = _analyser = null;
    _eqBands = [];
  }
}

function _reconnectGraph(): void {
  if (!_ctx || !_srcA || !_srcB || !_gainA || !_gainB) return;
  try {
    _srcA.disconnect();
    _srcB.disconnect();
    _gainA.disconnect();
    _gainB.disconnect();
    _comp?.disconnect();
    _analyser?.disconnect();
    _eqBands.forEach((b) => b.disconnect());

    _srcA.connect(_gainA);
    _srcB.connect(_gainB);

    const merge = _ctx.createGain();
    merge.gain.value = 1;
    _gainA.connect(merge);
    _gainB.connect(merge);

    let lastNode: AudioNode = merge;
    for (const filter of _eqBands) {
      lastNode.connect(filter);
      lastNode = filter;
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
    if (_ctx.state === "suspended") void _ctx.resume();
  } catch {
    /* ignore */
  }
}

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
  _customGains = [...(PRESETS[preset] || PRESETS.flat)];
  _applyEqGains(_customGains);
}

export function setEqGains(gains: number[]): void {
  _customGains = gains.slice(0, 5);
  _applyEqGains(_customGains);
}

function _applyEqGains(gains: number[]): void {
  _initAudioGraph();
  _eqBands.forEach((filter, index) => {
    if (gains[index] !== undefined) filter.gain.value = gains[index];
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

export function setGapless(enabled: boolean): void {
  _gapless = enabled;
}

export function isGapless(): boolean {
  return _gapless;
}

export function ensureAnalyser(): AnalyserNode | null {
  _initAudioGraph();
  return _analyser;
}

export function getAnalyser(): AnalyserNode | null {
  return _analyser;
}

/** Prefetch next track into the inactive buffer. */
export function preloadNext(url: string): void {
  if (!_gapless && _crossfadeDuration <= 0) return;
  _ensureElements();
  _initAudioGraph();
  const el = _inactive();
  if (_preloadedUrl === url && el.src) return;
  try {
    el.src = url;
    el.load();
    _preloadedUrl = url;
  } catch {
    _preloadedUrl = null;
  }
}

/**
 * Start playing `url` on the active element (hard cut).
 * Call after user gesture / playNow.
 */
export function playUrl(url: string, resumeAt = 0): Promise<void> {
  _ensureElements();
  _initAudioGraph();
  const el = getAudio();
  const other = _inactive();
  try {
    other.pause();
  } catch {
    /* ignore */
  }
  if (_gainA && _gainB && _ctx) {
    const now = _ctx.currentTime;
    if (_active === "a") {
      _gainA.gain.setValueAtTime(1, now);
      _gainB.gain.setValueAtTime(0, now);
    } else {
      _gainB.gain.setValueAtTime(1, now);
      _gainA.gain.setValueAtTime(0, now);
    }
  }
  el.src = url;
  el.currentTime = resumeAt;
  _preloadedUrl = null;
  return el.play().then(() => undefined);
}

/**
 * Crossfade / gapless handoff to a URL (preferably already preloaded).
 * Returns true if handoff started.
 */
export function handoffTo(url: string): boolean {
  if (_switching) return false;
  _ensureElements();
  _initAudioGraph();
  if (!_ctx || !_gainA || !_gainB) {
    void playUrl(url);
    return true;
  }
  const next = _inactive();
  const cur = getAudio();
  if (_preloadedUrl !== url) {
    try {
      next.src = url;
      next.load();
      _preloadedUrl = url;
    } catch {
      return false;
    }
  }
  _switching = true;
  const fade = Math.max(0.05, _crossfadeDuration || (_gapless ? 0.08 : 0));
  const now = _ctx.currentTime;
  const nextIsB = _active === "a";

  next.currentTime = 0;
  void next.play().catch(() => undefined);

  if (nextIsB) {
    _gainB.gain.cancelScheduledValues(now);
    _gainA.gain.cancelScheduledValues(now);
    _gainB.gain.setValueAtTime(0, now);
    _gainB.gain.linearRampToValueAtTime(1, now + fade);
    _gainA.gain.setValueAtTime(1, now);
    _gainA.gain.linearRampToValueAtTime(0, now + fade);
  } else {
    _gainA.gain.cancelScheduledValues(now);
    _gainB.gain.cancelScheduledValues(now);
    _gainA.gain.setValueAtTime(0, now);
    _gainA.gain.linearRampToValueAtTime(1, now + fade);
    _gainB.gain.setValueAtTime(1, now);
    _gainB.gain.linearRampToValueAtTime(0, now + fade);
  }

  window.setTimeout(() => {
    try {
      cur.pause();
      cur.removeAttribute("src");
      cur.load();
    } catch {
      /* ignore */
    }
    _active = nextIsB ? "b" : "a";
    _preloadedUrl = null;
    _switching = false;
  }, fade * 1000 + 40);

  return true;
}

/** Remaining seconds on the active element. */
export function remainingTime(): number {
  const el = getAudio();
  if (!Number.isFinite(el.duration) || el.duration <= 0) return Infinity;
  return Math.max(0, el.duration - el.currentTime);
}

export function showAirPlayPicker(): boolean {
  const el = getAudio() as HTMLAudioElement & {
    webkitShowPlaybackTargetPicker?: () => void;
  };
  if (typeof el.webkitShowPlaybackTargetPicker === "function") {
    el.webkitShowPlaybackTargetPicker();
    return true;
  }
  return false;
}

export function airPlayAvailable(): boolean {
  const el = getAudio() as HTMLAudioElement & {
    webkitShowPlaybackTargetPicker?: () => void;
  };
  return typeof el.webkitShowPlaybackTargetPicker === "function";
}

/** Attach the same listener to both buffers (active swaps during gapless). */
export function addAudioListener(
  type: string,
  fn: EventListenerOrEventListenerObject,
): () => void {
  _ensureElements();
  _a!.addEventListener(type, fn);
  _b!.addEventListener(type, fn);
  return () => {
    _a?.removeEventListener(type, fn);
    _b?.removeEventListener(type, fn);
  };
}
