import { CommanderError } from 'commander';

export type FlagPresence = {
  sawNoScriptsFlag: boolean;
  sawScriptsFlag: boolean;
  sawExceptFlag: boolean;
};

/** Hard guard: -S cannot be combined with -s/-x. Throws CommanderError on conflict. */
export const assertNoScriptsConflict = (p: FlagPresence): void => {
  const { sawNoScriptsFlag, sawScriptsFlag, sawExceptFlag } = p;
  if (sawNoScriptsFlag && (sawScriptsFlag || sawExceptFlag)) {
    throw new CommanderError(
      1,
      'commander.conflictingOption',
      "error: option '-S, --no-scripts' cannot be used with option '-s, --scripts' or '-x, --except-scripts'",
    );
  }
};
