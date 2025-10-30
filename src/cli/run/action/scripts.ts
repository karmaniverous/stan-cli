/** Resolve scripts map and default selection from CLI config with safe fallbacks. */
export const resolveScriptsForRun = async (args: {
  cwd: string;
  cliCfg: {
    scripts?: Record<string, unknown>;
    cliDefaults?: Record<string, unknown>;
  };
}): Promise<{
  scriptsMap: Record<string, string>;
  scriptsDefault: boolean | string[] | undefined;
}> => {
  const { cwd, cliCfg } = args;
  // 1) Scripts map — prefer loader result; fallback to direct parse
  let scriptsMap = (cliCfg.scripts as Record<string, string> | undefined) || {};
  if (Object.keys(scriptsMap).length === 0) {
    try {
      const { readCliScriptsFallback } = await import('../config-fallback');
      scriptsMap = readCliScriptsFallback(cwd);
    } catch {
      scriptsMap = {};
    }
  }

  // 2) Default selection — prefer loader result; fallback to direct parse
  let scriptsDefaultCfg: boolean | string[] | undefined = (() => {
    const run = (
      cliCfg.cliDefaults as
        | { run?: { scripts?: boolean | string[] } }
        | undefined
    )?.run;
    return run?.scripts;
  })();

  if (typeof scriptsDefaultCfg === 'undefined') {
    try {
      const { readRunScriptsDefaultFallback } = await import(
        '../config-fallback'
      );
      scriptsDefaultCfg = readRunScriptsDefaultFallback(cwd);
    } catch {
      /* ignore */
    }
  }
  return { scriptsMap, scriptsDefault: scriptsDefaultCfg };
};
