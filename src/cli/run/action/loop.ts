import { printHeader } from '@/cli/header';
import { confirmLoopReversal } from '@/runner/loop/reversal';
import { isBackward, readLoopState, writeLoopState } from '@/runner/loop/state';

/** Guard: print header, check for loop reversal, update state (run action). */
export const runLoopHeaderAndGuard = async (
  cwd: string,
  stanPath: string,
): Promise<boolean> => {
  try {
    const st = await readLoopState(cwd, stanPath);
    printHeader('run', st?.last ?? null);
    if (st?.last && isBackward(st.last, 'run')) {
      const proceed = await confirmLoopReversal();
      if (!proceed) {
        console.log('');
        return false;
      }
    }
    await writeLoopState(cwd, stanPath, 'run', new Date().toISOString());
  } catch {
    /* ignore guard failures */
  }
  return true;
};

/** Guard: print header, check for loop reversal, update state (snap action). */
export const snapLoopHeaderAndGuard = async (
  cwd: string,
  stanPath: string,
): Promise<boolean> => {
  try {
    const st = await readLoopState(cwd, stanPath);
    printHeader('snap', st?.last ?? null);
    if (st?.last && isBackward(st.last, 'snap')) {
      const proceed = await confirmLoopReversal();
      if (!proceed) {
        console.log('');
        return false;
      }
    }
    await writeLoopState(cwd, stanPath, 'snap', new Date().toISOString());
  } catch {
    /* ignore guard failures */
  }
  return true;
};
