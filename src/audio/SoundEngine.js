// Procedural Web Audio Synthesizer inspired by Breath of the Wild & Tears of the Kingdom
export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.ambientTimer = 0;
    this.enabled = true;
    this.mode = 'field'; // 'field' | 'shrine' | 'combat'
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    this.ctx = new AudioCtx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.34;
    this.master.connect(this.ctx.destination);
  }

  playTone(freq, duration = 0.25, type = 'sine', vol = 0.25, delay = 0, slideTo = null) {
    if (!this.ctx || !this.enabled) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + duration);
    }
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  playNoise(duration = 0.16, vol = 0.18, filterFreq = 1100) {
    if (!this.ctx || !this.enabled) return;
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (length * 0.45));
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;

    const gain = this.ctx.createGain();
    gain.gain.value = vol;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();
  }

  // Sparse impressionist BotW piano clusters
  updateAmbient(dt, mode = 'field') {
    this.mode = mode;
    if (!this.ctx) return;
    this.ambientTimer -= dt;
    if (this.ambientTimer > 0) return;

    if (mode === 'combat') {
      this.ambientTimer = 0.9 + Math.random() * 0.7;
      const notes = [146.83, 164.81, 174.61, 220.0, 233.08];
      const n = notes[Math.floor(Math.random() * notes.length)];
      this.playTone(n, 0.32, 'triangle', 0.12, 0);
      this.playTone(n * 2, 0.18, 'sine', 0.07, 0.16);
    } else if (mode === 'shrine') {
      this.ambientTimer = 2.2 + Math.random() * 1.5;
      const shrineScale = [523.25, 587.33, 659.25, 783.99, 987.77, 1046.5];
      for (let i = 0; i < 3; i++) {
        const f = shrineScale[Math.floor(Math.random() * shrineScale.length)];
        this.playTone(f, 1.4, 'sine', 0.08, i * 0.22);
      }
    } else {
      // Delicate solo BotW high-register piano phrase
      this.ambientTimer = 4.2 + Math.random() * 3.8;
      const phrases = [
        [587.33, 880.0, 987.77, 1174.66],
        [659.25, 783.99, 1046.5, 987.77],
        [493.88, 739.99, 880.0, 1318.5],
        [523.25, 659.25, 987.77],
      ];
      const phrase = phrases[Math.floor(Math.random() * phrases.length)];
      phrase.forEach((f, idx) => {
        this.playTone(f, 1.5, 'sine', 0.085, idx * (0.16 + Math.random() * 0.12));
        this.playTone(f * 2, 0.6, 'sine', 0.02, idx * 0.18);
      });
    }
  }

  swordDraw() {
    this.playNoise(0.11, 0.12, 3400);
    this.playTone(980, 0.18, 'sine', 0.12, 0, 1960);
    this.playTone(1480, 0.22, 'triangle', 0.08, 0.03, 2480);
  }

  swordSheathe() {
    this.playNoise(0.07, 0.09, 1900);
    this.playTone(720, 0.11, 'triangle', 0.11, 0, 340);
    this.playTone(420, 0.08, 'sine', 0.10, 0.06, 260);
  }

  swordSwing(combo = 0, onGrass = false) {
    const isFinisher = combo >= 2;
    this.playNoise(isFinisher ? 0.22 : 0.15, isFinisher ? 0.28 : 0.21, 1180 + combo * 340);
    this.playTone(250 + combo * 55, isFinisher ? 0.19 : 0.13, 'triangle', 0.14, 0, 115);
    // Subtle Master Sword steel harmonic shimmer
    this.playTone(920 + combo * 160, isFinisher ? 0.24 : 0.12, 'sine', isFinisher ? 0.09 : 0.045, 0.02, 620);
    if (onGrass) {
      this.playNoise(0.13, 0.11, 2950);
    }
  }

  spinChargeReady() {
    this.playTone(587.33, 0.22, 'sine', 0.15, 0);
    this.playTone(880.0, 0.26, 'sine', 0.17, 0.05);
    this.playTone(1174.66, 0.36, 'triangle', 0.16, 0.10);
  }

  spinAttackRelease() {
    this.playNoise(0.36, 0.34, 1450);
    this.playTone(330, 0.32, 'sawtooth', 0.12, 0, 130);
    this.playTone(587.33, 0.38, 'triangle', 0.16, 0.02, 880);
    this.playTone(1174.66, 0.44, 'sine', 0.14, 0.06, 1567.98);
  }

  jumpSlashSlam() {
    this.playNoise(0.26, 0.32, 480);
    this.playTone(165, 0.28, 'triangle', 0.24, 0, 52);
    this.playTone(880, 0.22, 'sine', 0.11, 0.02, 440);
  }

  shieldRaise() {
    this.playNoise(0.08, 0.11, 1250);
    this.playTone(310, 0.09, 'triangle', 0.12, 0, 420);
    this.playTone(620, 0.08, 'sine', 0.07, 0.02, 540);
  }

  shieldParry() {
    // Iconic BotW Hylian Shield metallic parry ring & shockwave snap!
    this.playNoise(0.16, 0.26, 2100);
    this.playTone(440, 0.14, 'sawtooth', 0.15, 0, 220);
    this.playTone(1046.5, 0.38, 'sine', 0.22, 0.01, 1318.5);
    this.playTone(1567.98, 0.46, 'sine', 0.18, 0.035, 2093.0);
  }

  swordHit(crit = false) {
    this.playNoise(0.12, 0.28, 750);
    this.playTone(crit ? 920 : 190, crit ? 0.35 : 0.14, crit ? 'sine' : 'sawtooth', 0.22, 0, crit ? 1320 : 90);
    if (crit) {
      // Iconic BotW headshot / crit ping!
      this.playTone(1318.5, 0.45, 'sine', 0.26, 0.03);
      this.playTone(1760.0, 0.55, 'sine', 0.2, 0.08);
    }
  }

  bowRelease() {
    this.playNoise(0.1, 0.16, 2100);
    this.playTone(440, 0.12, 'triangle', 0.14, 0, 720);
  }

  paragliderOpen() {
    this.playNoise(0.26, 0.28, 680);
    this.playTone(320, 0.22, 'sine', 0.12, 0, 520);
  }

  flurryRush() {
    this.playTone(540, 0.48, 'sine', 0.26, 0, 140);
    this.playTone(880, 0.35, 'triangle', 0.16, 0.05, 1320);
  }

  ultrahandGrab() {
    this.playTone(293.66, 0.28, 'sine', 0.18, 0, 440);
    this.playTone(587.33, 0.34, 'triangle', 0.12, 0.06, 880);
  }

  ultrahandFuse() {
    [440, 554.37, 659.25, 880].forEach((f, i) => {
      this.playTone(f, 0.28, 'sine', 0.18, i * 0.045);
    });
  }

  recallTick(step = 0) {
    const f = step % 2 === 0 ? 784 : 659.25;
    this.playTone(f, 0.09, 'sine', 0.12, 0);
  }

  pickup() {
    this.playTone(659.25, 0.11, 'sine', 0.16, 0);
    this.playTone(987.77, 0.18, 'sine', 0.18, 0.07);
  }

  discoveryFanfare() {
    [440, 554.37, 659.25, 987.77].forEach((f, i) => {
      this.playTone(f, 1.4, 'sine', 0.14, i * 0.16);
    });
  }

  cookingJingle() {
    const melody = [523.25, 587.33, 659.25, 783.99, 1046.5];
    melody.forEach((f, i) => {
      this.playTone(f, i === 4 ? 0.75 : 0.16, 'triangle', 0.22, i * 0.13);
    });
    this.playTone(1318.5, 0.8, 'sine', 0.18, 0.65);
  }

  shrineSolved() {
    // Classic Zelda secret chime homage
    const notes = [783.99, 739.99, 622.25, 440.0, 415.3, 659.25, 830.61, 1046.5];
    notes.forEach((f, i) => {
      this.playTone(f, 0.24, 'triangle', 0.22, i * 0.13);
    });
  }

  explosion() {
    this.playNoise(0.55, 0.42, 260);
    this.playTone(110, 0.45, 'sawtooth', 0.28, 0, 36);
  }

  catPurr(breed = 'russian') {
    if (!this.ctx || !this.enabled) return;
    if (breed === 'maine') {
      // Iconic Maine Coon musical trill ("brrr-up~!") + deep warm rumble purr!
      [340, 415, 510, 620].forEach((f, i) => {
        this.playTone(f, 0.09, 'triangle', 0.14, i * 0.042, f * 1.12);
      });
      for (let p = 0; p < 6; p++) {
        this.playTone(68 + (p % 2) * 8, 0.085, 'sine', 0.11, 0.20 + p * 0.075);
      }
    } else {
      // Delicate sweet Russian Blue melodic meow + velvet purr
      this.playTone(660, 0.16, 'sine', 0.15, 0, 880);
      this.playTone(880, 0.22, 'triangle', 0.12, 0.11, 590);
      for (let p = 0; p < 5; p++) {
        this.playTone(84 + (p % 2) * 10, 0.075, 'sine', 0.09, 0.28 + p * 0.07);
      }
    }
  }

  talkGreeting() {
    this.playTone(523.25, 0.14, 'triangle', 0.14, 0);
    this.playTone(659.25, 0.18, 'sine', 0.15, 0.07);
    this.playTone(783.99, 0.24, 'sine', 0.14, 0.14);
  }

  crystalChime(freq = 523.25) {
    this.playTone(freq, 0.65, 'sine', 0.22, 0);
    this.playTone(freq * 2, 0.42, 'triangle', 0.09, 0.015);
  }

  fireworkPop() {
    this.playNoise(0.28, 0.14, 920);
    this.playTone(180, 0.22, 'sine', 0.11, 0, 68);
    const sparkle = [1046.5, 1318.5, 1567.98, 2093.0];
    const f = sparkle[Math.floor(Math.random() * sparkle.length)];
    this.playTone(f, 0.48, 'sine', 0.08, 0.05);
  }

  playLoveSerenade() {
    // Tender 16-note celestial music-box serenade composed for Dengdeng
    const notes = [
      [523.25, 0.0],
      [659.25, 0.26],
      [783.99, 0.52],
      [987.77, 0.78],
      [880.0, 1.18],
      [783.99, 1.48],
      [659.25, 1.78],
      [587.33, 2.12],
      [523.25, 2.55],
      [659.25, 2.82],
      [880.0, 3.08],
      [1046.5, 3.40],
      [987.77, 3.85],
      [783.99, 4.18],
      [1046.5, 4.55],
      [1318.5, 4.95],
    ];
    for (const [f, d] of notes) {
      this.playTone(f, 0.88, 'sine', 0.15, d);
      this.playTone(f * 2, 0.45, 'triangle', 0.045, d + 0.015);
    }
  }

  cameraShutter() {
    this.playNoise(0.055, 0.22, 2600);
    this.playNoise(0.045, 0.16, 1400);
    this.playTone(1174.66, 0.18, 'sine', 0.12, 0.04);
    this.playTone(1567.98, 0.28, 'triangle', 0.10, 0.10);
  }

  footstep(surface = 'grass') {
    if (!this.ctx || !this.enabled) return;
    if (surface === 'wood') {
      this.playTone(135 + Math.random() * 25, 0.065, 'triangle', 0.08, 0, 75);
      this.playNoise(0.045, 0.05, 820);
    } else if (surface === 'stone') {
      this.playNoise(0.04, 0.055, 1650 + Math.random() * 350);
    } else {
      // Soft meadow grass rustle
      this.playNoise(0.075, 0.045, 2200 + Math.random() * 400);
    }
  }
}
