/** Tiny WebAudio synth: every sound is generated (no audio files), plus a soft night-time lullaby loop. */
export type Sfx =
  | 'step' | 'run' | 'dig' | 'jump' | 'pipe' | 'bone' | 'key' | 'gate' | 'suspicious' | 'alert' | 'caught' | 'win'
  | 'click' | 'coin' | 'wake' | 'locked' | 'switch' | 'squeak'
  | 'unscrew' | 'land' | 'tray' | 'close' | 'plank' | 'thud' | 'rescue' | 'pop' | 'fail';

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  sound = true;
  music = true;
  private suspended = false;
  private externalMute = false;

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.12;
      this.musicGain.connect(this.master);
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  /** Call from a user gesture (browsers start audio suspended). */
  unlock(): void {
    const c = this.ensure();
    if (c && c.state === 'suspended' && !this.suspended) void c.resume();
    this.updateMusic();
  }

  setExternalMute(m: boolean): void {
    this.externalMute = m;
    this.apply();
  }

  /** Ads: everything silent. */
  suspend(on: boolean): void {
    this.suspended = on;
    this.apply();
  }

  private apply(): void {
    if (!this.ctx) return;
    const silent = this.suspended || this.externalMute;
    if (silent) void this.ctx.suspend();
    else void this.ctx.resume();
    this.updateMusic();
  }

  setSound(on: boolean): void {
    this.sound = on;
  }

  setMusic(on: boolean): void {
    this.music = on;
    this.updateMusic();
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, at = 0, slide = 0, dest?: AudioNode): void {
    const c = this.ctx!;
    const t0 = c.currentTime + at;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(dest ?? this.master!);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, vol: number, freq: number, at = 0): void {
    const c = this.ctx!;
    const t0 = c.currentTime + at;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master!);
    src.start(t0);
  }

  play(s: Sfx): void {
    if (!this.sound || this.suspended || this.externalMute) return;
    const c = this.ensure();
    if (!c || c.state !== 'running') return;
    switch (s) {
      case 'step': this.noise(0.05, 0.08, 900); break;
      case 'run': this.noise(0.06, 0.18, 1400); break;
      case 'squeak': this.tone(700, 0.18, 'sawtooth', 0.06, 0, 300); this.tone(900, 0.12, 'triangle', 0.05, 0.05, -200); break;
      case 'dig': this.noise(0.25, 0.25, 500); this.noise(0.2, 0.2, 350, 0.18); break;
      case 'jump': this.tone(380, 0.16, 'triangle', 0.18, 0, 380); break;
      case 'pipe': this.tone(600, 0.35, 'sine', 0.14, 0, -380); this.tone(300, 0.3, 'sine', 0.1, 0.3, 500); break;
      case 'bone': [784, 988, 1319].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.16, i * 0.07)); break;
      case 'key': [880, 1175, 1568, 2093].forEach((f, i) => this.tone(f, 0.25, 'sine', 0.14, i * 0.06)); break;
      case 'gate': this.tone(160, 0.25, 'square', 0.06, 0, 60); break;
      case 'suspicious': this.tone(520, 0.2, 'sine', 0.12, 0, 220); break;
      case 'alert': this.tone(660, 0.12, 'square', 0.12); this.tone(990, 0.2, 'square', 0.12, 0.1); break;
      case 'caught': [523, 392, 330, 262].forEach((f, i) => this.tone(f, 0.28, 'triangle', 0.16, i * 0.12)); break;
      case 'win': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.32, 'triangle', 0.15, i * 0.09)); break;
      case 'click': this.tone(1200, 0.05, 'sine', 0.08); break;
      case 'coin': this.tone(1568, 0.08, 'square', 0.06); this.tone(2093, 0.16, 'square', 0.06, 0.06); break;
      case 'wake': this.tone(220, 0.3, 'sawtooth', 0.06, 0, 120); break;
      case 'locked': this.tone(200, 0.12, 'square', 0.08); this.tone(160, 0.16, 'square', 0.08, 0.1); break;
      case 'unscrew':
        // quick ratchet clicks rising in pitch
        for (let i = 0; i < 5; i++) this.tone(900 + i * 140, 0.035, 'square', 0.05, i * 0.045);
        this.tone(520, 0.18, 'triangle', 0.1, 0.22, 700);
        break;
      case 'land': this.tone(1320, 0.07, 'triangle', 0.12); this.tone(1980, 0.09, 'sine', 0.08, 0.04); break;
      case 'tray': this.tone(420, 0.1, 'triangle', 0.12); break;
      case 'close': this.noise(0.08, 0.25, 700); this.tone(180, 0.15, 'sine', 0.18); [784, 1047].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.1, 0.08 + i * 0.07)); break;
      case 'plank': this.tone(300, 0.2, 'triangle', 0.1, 0, -120); break;
      case 'thud': this.noise(0.18, 0.35, 260); this.tone(110, 0.2, 'sine', 0.2); break;
      case 'rescue': [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.14, i * 0.08)); break;
      case 'pop': this.tone(700, 0.12, 'sine', 0.15, 0, 500); break;
      case 'fail': [392, 330, 262].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.14, i * 0.13)); break;
      case 'switch': this.tone(880, 0.08, 'sine', 0.1); this.tone(1320, 0.1, 'sine', 0.08, 0.05); break;
    }
  }

  private updateMusic(): void {
    const want = this.music && !this.suspended && !this.externalMute && !!this.ctx && this.ctx.state !== 'closed';
    if (want && !this.musicTimer) {
      // slow pentatonic music-box arpeggio over a soft bass, 2 bars per chord
      const chords = [[262, 330, 392, 523], [220, 262, 330, 440], [175, 220, 262, 349], [196, 247, 294, 392]];
      let step = 0;
      this.musicTimer = setInterval(() => {
        if (!this.ctx || this.ctx.state !== 'running') return;
        const ch = chords[Math.floor(step / 8) % chords.length];
        const n = ch[[0, 2, 1, 3, 2, 1, 3, 2][step % 8]];
        this.tone(n * 2, 0.9, 'sine', 0.22, 0, 0, this.musicGain!);
        if (step % 8 === 0) this.tone(ch[0] / 2, 3.2, 'triangle', 0.25, 0, 0, this.musicGain!);
        step++;
      }, 420);
    } else if (!want && this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}
