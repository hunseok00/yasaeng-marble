// ── 범용 룰렛 컴포넌트 ──────────────────────────────
// 미션/강도/지목/음료 등 어떤 항목 배열이든 받아 스핀하는 공용 스피너.
// weights를 주면 조각 크기(=당첨 확률)가 가중치에 비례한다 — 진행자 히든 당첨 등에 사용.
// 사용: new Roulette(canvas, ['철수','영희'], colors, [1, 1]).spin() → Promise<선택된 index>
import { audio } from './audio.js';

const FALLBACK_COLORS = ['#f72585', '#4cc9f0', '#ffd166', '#b5e48c', '#c77dff', '#ff9e00', '#38e8c6', '#ff5d5d'];

export class Roulette {
  constructor(canvas, items, colors, weights) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.items = items;
    this.colors = colors || items.map((_, i) => FALLBACK_COLORS[i % FALLBACK_COLORS.length]);
    this.rotation = 0;

    // 가중치 → 조각별 시작 각도/크기 (라디안)
    const w = weights && weights.length === items.length ? weights : items.map(() => 1);
    const total = w.reduce((a, b) => a + b, 0);
    this.segs = [];
    let acc = 0;
    for (const wi of w) {
      const size = (wi / total) * Math.PI * 2;
      this.segs.push({ start: acc, size });
      acc += size;
    }

    this.draw();
  }

  draw() {
    const { ctx, canvas, items } = this;
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;
    const r = Math.min(W, H) / 2 - 14;

    ctx.clearRect(0, 0, W, H);

    // 조각
    for (let i = 0; i < items.length; i++) {
      const a0 = this.rotation + this.segs[i].start;
      const a1 = a0 + this.segs[i].size;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a0, a1);
      ctx.closePath();
      ctx.fillStyle = this.colors[i];
      ctx.fill();
      ctx.strokeStyle = '#0d0f1e';
      ctx.lineWidth = 3;
      ctx.stroke();

      // 라벨 (좁은 조각은 글씨 축소)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a0 + this.segs[i].size / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#0d0f1e';
      let fontSize = items.length > 8 ? 16 : 22;
      if (this.segs[i].size < 0.35) fontSize = Math.min(fontSize, 13);
      ctx.font = `900 ${fontSize}px "Apple SD Gothic Neo", sans-serif`;
      const label = String(items[i]).length > 9 ? String(items[i]).slice(0, 8) + '…' : String(items[i]);
      ctx.fillText(label, r - 16, fontSize / 3);
      ctx.restore();
    }

    // 외곽 링 + 중앙 원
    ctx.beginPath();
    ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 34, 0, Math.PI * 2);
    ctx.fillStyle = '#181b30';
    ctx.fill();
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.font = '26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🎯', cx, cy + 9);

    // 상단 포인터 (고정)
    ctx.beginPath();
    ctx.moveTo(cx - 16, 4);
    ctx.lineTo(cx + 16, 4);
    ctx.lineTo(cx, 40);
    ctx.closePath();
    ctx.fillStyle = '#fff';
    ctx.fill();
  }

  // 포인터(12시 방향, -90°) 아래에 있는 조각 index
  _selectedIndex() {
    const pointer = -Math.PI / 2;
    let a = (pointer - this.rotation) % (Math.PI * 2);
    if (a < 0) a += Math.PI * 2;
    for (let i = 0; i < this.segs.length; i++) {
      if (a >= this.segs[i].start && a < this.segs[i].start + this.segs[i].size) return i;
    }
    return this.segs.length - 1;
  }

  spin(duration = 3600) {
    return new Promise((resolve) => {
      const target = this.rotation + Math.PI * 2 * (4 + Math.random() * 3) + Math.random() * Math.PI * 2;
      const start = this.rotation;
      const t0 = performance.now();
      let lastIdx = this._selectedIndex();

      const frame = (now) => {
        const t = Math.min(1, (now - t0) / duration);
        const ease = 1 - Math.pow(1 - t, 3); // cubic ease-out
        this.rotation = start + (target - start) * ease;
        this.draw();

        const idx = this._selectedIndex();
        if (idx !== lastIdx) { audio.tick(); lastIdx = idx; }

        if (t < 1) {
          requestAnimationFrame(frame);
        } else {
          audio.fanfare();
          resolve(this._selectedIndex());
        }
      };
      requestAnimationFrame(frame);
    });
  }
}
