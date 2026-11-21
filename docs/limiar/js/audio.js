/* LIMIAR — tiny WebAudio synth. All sound effects are generated, no files. */
(function (global) {
  'use strict';
  let ctx = null;
  let master = null;
  let muted = false;
  try { muted = localStorage.getItem('limiar-muted') === '1'; } catch (e) { /* storage blocked */ }

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    return ctx;
  }

  function noiseBuffer(dur) {
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function noise(dur, freq, q, vol, type) {
    if (!ensure()) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur);
    const f = ctx.createBiquadFilter();
    f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur);
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure()) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const t = ctx.currentTime;
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur);
  }

  const SFX = {
    unlock: ensure,
    whiff() { noise(0.08, 1800, 1.2, 0.15); },
    hit() { noise(0.12, 900, 0.8, 0.6); tone(160, 0.08, 'square', 0.25, 60); },
    bigHit() { noise(0.2, 500, 0.7, 0.8); tone(120, 0.18, 'sawtooth', 0.35, 40); },
    slam() { noise(0.4, 180, 0.6, 1.0, 'lowpass'); tone(80, 0.35, 'sine', 0.8, 30); },
    jump() { tone(220, 0.12, 'square', 0.12, 520); },
    grab() { tone(300, 0.06, 'square', 0.15, 200); },
    count() { tone(880, 0.25, 'square', 0.25); },
    block() { tone(420, 0.06, 'square', 0.18, 300); noise(0.05, 2500, 2, 0.2); },
    parry() { tone(1560, 0.35, 'triangle', 0.35); tone(2340, 0.25, 'sine', 0.2); noise(0.08, 4000, 3, 0.3); },
    telegraph() { tone(180, 0.25, 'sawtooth', 0.12, 260); },
    special() { tone(120, 0.5, 'sawtooth', 0.3, 600); noise(0.5, 900, 0.5, 0.4); },
    pickup() { tone(880, 0.1, 'triangle', 0.25, 1320); setTimeout(() => tone(1320, 0.2, 'triangle', 0.2, 1760), 90); },
    blip() { tone(1200, 0.02, 'square', 0.05); },
    lampsOut() { tone(300, 0.6, 'sine', 0.2, 60); },
    bellOne() { tone(660, 1.4, 'triangle', 0.4); tone(990, 1.0, 'sine', 0.18); tone(330, 1.6, 'sine', 0.2); },
    select() { tone(660, 0.07, 'square', 0.2, 990); },
    cheer() { noise(1.4, 1400, 0.4, 0.35); },
    bellToll() {
      [0, 0.32, 0.64].forEach((delay) => setTimeout(() => {
        tone(1320, 0.6, 'triangle', 0.4); tone(1980, 0.4, 'sine', 0.15);
      }, delay * 1000));
    },
    isMuted: () => muted,
    toggleMute() {
      muted = !muted;
      try { localStorage.setItem('limiar-muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    }
  };

  global.LIM = global.LIM || {};
  global.LIM.SFX = SFX;
})(window);
