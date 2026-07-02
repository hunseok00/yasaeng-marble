// ── 효과음: Web Audio 합성 (외부 에셋 불필요) ──────────────
class AudioFX {
  constructor() {
    this.enabled = true;
    this.ctx = null;
  }

  _ctx() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  // 기본 톤 생성기
  beep(freq = 440, dur = 0.08, type = 'square', vol = 0.12, delay = 0) {
    if (!this.enabled) return;
    try {
      const ctx = this._ctx();
      const t = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch (_) { /* 오디오 미지원 환경 무시 */ }
  }

  tick()   { this.beep(750, 0.035, 'square', 0.07); }
  click()  { this.beep(500, 0.05, 'triangle', 0.1); }

  dice() {
    for (let i = 0; i < 9; i++) {
      this.beep(280 + Math.random() * 520, 0.03, 'square', 0.06, i * 0.06);
    }
  }

  // 당첨/벌칙 임팩트
  boom() {
    this.beep(130, 0.35, 'sawtooth', 0.22);
    this.beep(85, 0.5, 'sawtooth', 0.18, 0.06);
  }

  // 팡파레
  fanfare() {
    [523, 659, 784, 1046, 1318].forEach((f, i) => this.beep(f, 0.18, 'triangle', 0.18, i * 0.11));
    this.beep(1568, 0.4, 'triangle', 0.16, 0.6);
  }

  // 드럼롤 (지정 초 동안 빠른 저음 연타)
  drumroll(seconds = 3) {
    const n = Math.floor(seconds / 0.055);
    for (let i = 0; i < n; i++) {
      this.beep(i % 2 ? 170 : 210, 0.04, 'square', 0.05, i * 0.055);
    }
  }
}

export const audio = new AudioFX();
