// src/anchored-writer/index.ts
// A tiny, content-agnostic anchored writer:
// - Writes each frame in place by moving to the top of the previous frame area.
// - Per-line clears (erase-to-EOL) prevent stale tails without touching scrollback.
// - Hides cursor during updates; shows cursor on done().

export type AnchoredWriter = {
  start(): void;
  write(body: string): void;
  clear(): void;
  done(): void;
};

const CSI = '\x1b['; // Control Sequence Introducer
const hideCursor = `${CSI}?25l`;
const showCursor = `${CSI}?25h`;
const eraseToEOL = `${CSI}K`;
const moveUpToBOL = (n: number) => (n > 0 ? `${CSI}${n}F` : ''); // to previous line(s), column 1

export const createAnchoredWriter = (): AnchoredWriter => {
  const out = process.stdout as NodeJS.WriteStream;
  let lastLines = 0;

  const writeLines = (lines: string[]): void => {
    // Move to the top of previous frame (beginning of line)
    if (lastLines > 0) out.write(moveUpToBOL(lastLines));
    // Rewrite each line with CR + erase-to-EOL + content + newline
    for (const line of lines) {
      out.write(`\r${eraseToEOL}${line}\n`);
    }
    // If the new frame is shorter, blank out remaining old lines
    const extra = lastLines - lines.length;
    for (let i = 0; i < extra; i += 1) {
      out.write(`\r${eraseToEOL}\n`);
    }
    lastLines = lines.length;
  };

  return {
    start(): void {
      try {
        out.write(hideCursor);
      } catch {
        /* best-effort */
      }
    },
    write(body: string): void {
      try {
        // Normalize to lines; keep trailing blank/Pad lines intact.
        const endsNl = body.endsWith('\n') ? body : `${body}\n`;
        const lines = endsNl.split('\n'); // last split yields '' for trailing \n
        // We want to keep the final '' line in counts for stability.
        writeLines(lines);
      } catch {
        /* best-effort */
      }
    },
    clear(): void {
      try {
        // Blank the current frame area (without moving outside it)
        if (lastLines > 0) out.write(moveUpToBOL(lastLines));
        for (let i = 0; i < lastLines; i += 1) {
          out.write(`\r${eraseToEOL}\n`);
        }
        lastLines = 0;
      } catch {
        /* best-effort */
      }
    },
    done(): void {
      try {
        out.write(showCursor);
      } catch {
        /* best-effort */
      }
    },
  };
};
