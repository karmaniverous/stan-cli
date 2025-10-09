// src/stan/run/live/writer/index.ts
export type Writer = {
  start(): void;
  write(body: string): void;
  clear(): void;
  done(): void;
};

type FullClearOpts = {
  altScreen?: boolean;
};

const CSI = '\x1b['; // Control Sequence Introducer
const hideCursor = `${CSI}?25l`;
const showCursor = `${CSI}?25h`;
const altScreenOn = `${CSI}?1049h`;
const altScreenOff = `${CSI}?1049l`;
const cursorHome = `${CSI}H`;
const eraseDown = `${CSI}J`;
const eraseAll = `${CSI}2J`;

class FullClearWriter implements Writer {
  private readonly out: NodeJS.WriteStream;
  private readonly alt: boolean;
  constructor(opts?: FullClearOpts) {
    this.out = process.stdout as NodeJS.WriteStream;
    this.alt = opts?.altScreen ?? true;
  }
  start(): void {
    try {
      const seq = `${this.alt ? altScreenOn : ''}${hideCursor}`;
      this.out.write(seq);
    } catch {
      /* best-effort */
    }
  }
  write(body: string): void {
    try {
      // Always render by homing + erase-down to repaint the live area atomically.
      // Ensure trailing newline (renderer composes the content).
      const endsNl = body.endsWith('\n') ? body : `${body}\n`;
      this.out.write(`${cursorHome}${eraseDown}${endsNl}`);
    } catch {
      /* best-effort */
    }
  }
  clear(): void {
    try {
      this.out.write(`${eraseAll}${cursorHome}`);
    } catch {
      /* best-effort */
    }
  }
  done(): void {
    try {
      const seq = `${showCursor}${this.alt ? altScreenOff : ''}`;
      this.out.write(seq);
    } catch {
      /* best-effort */
    }
  }
}

export const createWriter = (): Writer => {
  const altEnv = String(process.env.STAN_LIVE_ALT_SCREEN ?? '').trim();
  const alt = altEnv === '0' ? false : true;
  return new FullClearWriter({ altScreen: alt });
};
