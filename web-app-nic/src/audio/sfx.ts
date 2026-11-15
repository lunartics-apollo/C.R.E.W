// Original synthesised sound effects and ambient pad (Web Audio). Starts only after a user gesture.
export type Sfx = 'click' | 'hover' | 'snap' | 'remove' | 'error' | 'success' | 'alarm' | 'whoosh' | 'beep' | 'type' | 'deploy' | 'chime' | 'go' | 'nogo' | 'capture' | 'static';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxGain: GainNode | null = null;
let musicGain: GainNode | null = null;
let musicStarted = false;
let unlocked = false;
let settings = { sfx: 0.6, music: 0.35, muted: false };

function ensure(): AudioContext | null {
  if (typeof window === 'undefined' || !unlocked) return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    sfxGain = ctx.createGain();
    musicGain = ctx.createGain();
    sfxGain.connect(master);
    musicGain.connect(master);
    master.connect(ctx.destination);
    apply();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function apply() {
  if (!master || !sfxGain || !musicGain || !ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(settings.muted ? 0 : 1, t, 0.05);
  sfxGain.gain.setTargetAtTime(settings.sfx * 0.5, t, 0.05);
  musicGain.gain.setTargetAtTime(settings.music * 0.16, t, 0.3);
}

export function configureAudio(s: { sfx: number; music: number; muted: boolean }) {
  settings = s;
  apply();
  if (ctx && s.music > 0 && !s.muted) startMusic();
}

/** Call from the first pointer/key interaction (browser autoplay rules). */
export function unlockAudio() {
  unlocked = true;
  const c = ensure();
  if (c && settings.music > 0 && !settings.muted) startMusic();
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, slideTo?: number) {
  const c = ensure();
  if (!c || !sfxGain) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(sfxGain);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur: number, vol: number, filterFreq: number, delay = 0, q = 0.8) {
  const c = ensure();
  if (!c || !sfxGain) return;
  const t = c.currentTime + delay;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = filterFreq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(sfxGain);
  src.start(t);
}

export function play(name: Sfx) {
  if (settings.muted || settings.sfx <= 0) return;
  switch (name) {
    case 'click':
      tone(880, 0.05, 'square', 0.12);
      tone(1320, 0.04, 'square', 0.06, 0.02);
      break;
    case 'hover':
      tone(1600, 0.025, 'sine', 0.03);
      break;
    case 'snap':
      noise(0.06, 0.4, 2500, 0, 2);
      tone(180, 0.12, 'square', 0.18, 0.01, 90);
      tone(1046, 0.08, 'triangle', 0.1, 0.08);
      break;
    case 'remove':
      tone(400, 0.12, 'square', 0.1, 0, 200);
      break;
    case 'error':
      tone(220, 0.14, 'sawtooth', 0.12);
      tone(165, 0.2, 'sawtooth', 0.12, 0.13);
      break;
    case 'success':
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'triangle', 0.12, i * 0.07));
      break;
    case 'alarm':
      for (let i = 0; i < 3; i++) {
        tone(740, 0.15, 'square', 0.1, i * 0.32);
        tone(587, 0.15, 'square', 0.1, i * 0.32 + 0.16);
      }
      break;
    case 'whoosh':
      noise(0.7, 0.35, 700, 0, 0.6);
      break;
    case 'beep':
      tone(1200, 0.08, 'sine', 0.12);
      break;
    case 'type':
      tone(2200 + Math.random() * 400, 0.015, 'square', 0.02);
      break;
    case 'deploy':
      noise(0.08, 0.3, 4000, 0, 3);
      tone(300, 0.3, 'triangle', 0.12, 0.05, 600);
      break;
    case 'chime':
      tone(1318, 0.4, 'sine', 0.1);
      tone(1760, 0.5, 'sine', 0.08, 0.1);
      break;
    case 'go':
      [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, 'square', 0.08, i * 0.09));
      break;
    case 'nogo':
      tone(311, 0.35, 'sawtooth', 0.12);
      tone(233, 0.5, 'sawtooth', 0.12, 0.3);
      break;
    case 'capture':
      noise(0.04, 0.3, 6000, 0, 4);
      tone(2000, 0.06, 'square', 0.06, 0.05);
      break;
    case 'static':
      noise(0.35, 0.12, 1800, 0, 0.4);
      break;
  }
}

/** Long low rumble for the launch (seconds). */
export function rumble(seconds: number) {
  if (settings.muted || settings.sfx <= 0) return;
  const c = ensure();
  if (!c || !sfxGain) return;
  const t = c.currentTime;
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = last * 0.985 + (Math.random() * 2 - 1) * 0.015;
    d[i] = last * 6;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.9, t + 1.5);
  g.gain.linearRampToValueAtTime(0.0001, t + seconds);
  src.connect(g).connect(sfxGain);
  src.start(t);
}

function startMusic() {
  const c = ensure();
  if (!c || !musicGain || musicStarted) return;
  musicStarted = true;
  // Slow original ambient pad: detuned voices through a breathing low-pass filter.
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 600;
  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  lfo.frequency.value = 0.05;
  lfoGain.gain.value = 300;
  lfo.connect(lfoGain).connect(filter.frequency);
  filter.connect(musicGain);
  [110, 164.81, 220.5, 277.18].forEach((f, i) => {
    const o = c.createOscillator();
    o.type = i % 2 ? 'sine' : 'triangle';
    o.frequency.value = f;
    o.detune.value = (i - 1.5) * 6;
    const g = c.createGain();
    g.gain.value = 0.25;
    o.connect(g).connect(filter);
    o.start();
  });
  lfo.start();
}
