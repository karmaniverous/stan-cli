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
const nextLine = `${CSI}1E`; // move cursor to next line, column 1

export const createAnchoredWriter = (): AnchoredWriter => {
  const out = process.stdout as NodeJS.WriteStream;
  let lastLines = 0;

  const writeLines = (lines: string[]): void => {
    let buf = '';
    // Move to the top of previous frame (beginning of line)
    if (lastLines > 0) buf += moveUpToBOL(lastLines);
    // Rewrite each line with CR + erase-to-EOL + content + newline
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? '';
      // Special-case the very first blank line of the very first frame so the buffer
      // begins with a literal newline (no preceding CR/erase). This yields a true
      // leading blank line after ANSI stripping.
      if (lastLines === 0 && i === 0 && line === '') {
        buf += `\n`;
      } else {
        buf += `\r${eraseToEOL}${line}\n`;
      }
    }
    // If the new frame is shorter, blank out remaining old lines
    const extra = lastLines - lines.length;
    // Clear without introducing visible blank lines by using cursor-next-line instead of '\n'
    for (let i = 0; i < extra; i += 1) {
      buf += `\r${eraseToEOL}`;
      if (i < extra - 1) buf += nextLine;
    }
    // Always terminate the write with a newline so the final frame ends with \n.
    // This does not create an extra visible blank line; the CLI should not add
    // any additional newline after ui.stop() in live mode.
    buf += '\n';
    out.write(buf);
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
        let buf = '';
        if (lastLines > 0) buf += moveUpToBOL(lastLines);
        for (let i = 0; i < lastLines; i += 1) {
          buf += `\r${eraseToEOL}\n`;
        }
        out.write(buf);
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
