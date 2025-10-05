/** Options to control archive creation. */
type CreateArchiveOptions = {
    /** When true, include the `stanPath/output` directory inside the archive. */
    includeOutputDir?: boolean;
    /**
     * Archive file name. If provided without `.tar`, the suffix is added.
     * Written to `stanPath/output/<fileName>`.
     */
    fileName?: string;
    /** Allow‑list globs; when provided, overrides excludes. */
    includes?: string[];
    /**
     * Deny‑list globs. Defaults include `.git`, `node_modules`, and STAN
     * workspace rules. These are applied only when `includes` is empty.
     */
    excludes?: string[];
    /** Optional callback for archive classifier warnings (engine remains silent by default). */
    onArchiveWarnings?: (text: string) => void;
};
/** Create `stanPath/output/archive.tar` (or custom file name) from the repo root. */
declare const createArchive: (cwd: string, stanPath: string, options?: CreateArchiveOptions) => Promise<string>;

/** Public default STAN path for consumers and internal use. */
declare const DEFAULT_STAN_PATH = ".stan";
/** Default command to open modified files after patch apply. */
declare const DEFAULT_OPEN_COMMAND = "code -g {file}";

/**
 * Resolve the absolute path to the nearest `stan.config.*` starting from `cwd`.
 *
 * @param cwd - Directory to start searching from.
 * @returns Absolute path to the config file, or `null` if none found.
 */
declare const findConfigPathSync: (cwd: string) => string | null;

/** A script entry may be a raw command string or an object with an optional warnPattern. */
type ScriptEntry = string | {
    script: string;
    warnPattern?: string;
};
type ScriptMap = Record<string, ScriptEntry>;
type CliDefaultsRun = {
    archive?: boolean;
    combine?: boolean;
    keep?: boolean;
    sequential?: boolean;
    live?: boolean;
    plan?: boolean;
    hangWarn?: number;
    hangKill?: number;
    hangKillGrace?: number;
    scripts?: boolean | string[];
};
type CliDefaultsPatch = {
    file?: string | null | undefined;
};
type CliDefaultsSnap = {
    stash?: boolean;
};
type CliDefaults = {
    debug?: boolean;
    boring?: boolean;
    patch?: CliDefaultsPatch;
    run?: CliDefaultsRun;
    snap?: CliDefaultsSnap;
};
/**
 * Resolved STAN configuration. * - Paths like stanPath/output and stanPath/diff are referred to without angle *   brackets to avoid confusion with HTML-like tags in TSDoc.
 */
type ContextConfig = {
    stanPath: string;
    scripts: ScriptMap;
    /**
     * Additive allow‑list globs for archiving/snapshot logic.
     * - Augments the base selection (which applies .gitignore and default denials).
     * - Explicit `excludes` take precedence over `includes` (i.e., excludes always win).
     * - `includes` can bring back files ignored by `.gitignore` or default denials.
     * - Reserved exclusions still apply: `<stanPath>/diff` is always excluded;
     *   `<stanPath>/output` is excluded unless explicitly included by combine mode at archive time.
     */
    includes?: string[];
    /** Paths to exclude in archiving logic (globs supported). */
    excludes?: string[];
    /** Maximum retained snapshot "undos" (history depth for snap undo/redo). */
    maxUndos?: number /** Optional developer-mode switch to treat the current repo as the STAN dev module. */;
    devMode?: boolean;
    /**
     * Staged imports (archiving only): label -\> glob(s) to copy under <stanPath>/imports/<label>/...
     */
    imports?: Record<string, string | string[]>;
    /**
     * Phase-scoped CLI defaults used by adapters when flags are omitted.
     * Top-level (no 'opts' wrapper).   */
    cliDefaults?: CliDefaults;
    /** Command template to open modified files after a successful patch. */
    patchOpenCommand?: string;
};

/**
 * Load and validate STAN configuration synchronously.
 *
 * @param cwd - Repo root or any descendant; the nearest `stan.config.*` is used.
 * @returns Parsed, validated {@link ContextConfig}.
 */
declare const loadConfigSync: (cwd: string) => ContextConfig;
/**
 * Load and validate STAN configuration (async).
 *
 * @param cwd - Repo root or any descendant; the nearest `stan.config.*` is used.
 * @returns Parsed, validated {@link ContextConfig}.
 */
declare const loadConfig: (cwd: string) => Promise<ContextConfig>;
/** Resolve stanPath from config or fall back to default (sync). */
declare const resolveStanPathSync: (cwd: string) => string;
/** Resolve stanPath from config or fall back to default (async). */
declare const resolveStanPath: (cwd: string) => Promise<string>;

/**
 * Ensure the STAN workspace exists and manage output/diff.
 *
 * Behavior:
 * - Always ensure `stanPath/output` and `stanPath/diff` exist.
 * - Also ensure `stanPath/patch` exists so archives can include it.
 * - When `keep === false`, copy `output/archive.tar` to `diff/archive.prev.tar`
 *   if present, then clear only the `output` directory.
 *
 * @param cwd - Repo root.
 * @param stanPath - Workspace folder (e.g., `.stan`).
 * @param keep - When `true`, do not clear the output directory.
 * @returns Absolute path to the workspace root (`stanPath`).
 */
declare const ensureOutputDir: (cwd: string, stanPath: string, keep?: boolean) => Promise<string>;

type SnapshotUpdateMode = 'never' | 'createIfMissing' | 'replace';
/**
 * Compute (and optionally update) the snapshot file in <stanPath>/diff/.
 * Returns the absolute snapshot path.
 *
 * @param args - Object with:
 *   - cwd: Repo root.
 *   - stanPath: STAN workspace folder.
 *   - includes: Allow‑list globs (overrides excludes).
 *   - excludes: Deny‑list globs.
 * @returns Absolute path to the `.archive.snapshot.json` file.
 */
declare const writeArchiveSnapshot: ({ cwd, stanPath, includes, excludes, }: {
    cwd: string;
    stanPath: string;
    includes?: string[];
    excludes?: string[];
}) => Promise<string>;
/**
 * Create a diff tar at <stanPath>/output/<baseName>.diff.tar.
 * - If snapshot exists: include only changed files.
 * - If no snapshot exists: include full file list (diff equals full archive).
 * - Snapshot update behavior is controlled by updateSnapshot.
 * - When includeOutputDirInDiff === true, also include the entire <stanPath>/output tree
 *   (excluding <stanPath>/diff and the two archive files) regardless of change list length.
 * - Always include <stanPath>/patch in the diff archive.
 *
 * @param args - Object with:
 *   - cwd: Repo root.
 *   - stanPath: STAN workspace folder.
 *   - baseName: Base archive name (e.g., `archive` -\> `archive.diff.tar`).
 *   - includes: Allow‑list globs (overrides excludes).
 *   - excludes: Deny‑list globs.
 *   - updateSnapshot: Controls when the snapshot file is replaced.
 *   - includeOutputDirInDiff: When true, include `stanPath/output` in the diff.
 * @returns `{ diffPath }` absolute path to the diff archive.
 */
declare const createArchiveDiff: ({ cwd, stanPath, baseName, includes, excludes, updateSnapshot, includeOutputDirInDiff, onArchiveWarnings, }: {
    cwd: string;
    stanPath: string;
    baseName: string;
    includes?: string[];
    excludes?: string[];
    updateSnapshot?: SnapshotUpdateMode;
    includeOutputDirInDiff?: boolean;
    onArchiveWarnings?: (text: string) => void;
}) => Promise<{
    diffPath: string;
}>;

/** src/stan/validate/response.ts
 * Response-format validator for assistant replies.
 *
 * Also validates optional "### File Ops" pre-ops block (verbs/arity/path rules).
 *
 * Checks (initial):
 * - One Patch per file.
 * - Each Patch block contains exactly one "diff --git a/<path> b/<path>" header.
 * - When both are present for a given file, "Patch" precedes "Full Listing".
 * - "## Commit Message" exists and is the final section.
 * - If any non‑docs Patch exists, there is also a Patch for ".stan/system/stan.todo.md".
 */
/**
 * Kind tag for validator blocks. Exported so it appears in generated
 * documentation and to eliminate TypeDoc’s “referenced but not documented” warning.
 */
type BlockKind = 'patch' | 'full' | 'commit';
type Block = {
    kind: BlockKind;
    /** Repo-relative target path for patch/listing blocks; undefined for commit. */ path?: string;
    /** Start index (character offset) in the source for ordering checks. */
    start: number;
    /** Block body (content between its heading and the next heading). */
    body: string;
};
type ValidationResult = {
    ok: boolean;
    errors: string[];
    warnings: string[];
};
/** Validate an assistant reply body against response-format rules. */
declare const validateResponseMessage: (text: string) => ValidationResult;
/** Throw on validation failure (convenience API). */
declare const validateOrThrow: (text: string) => void;
declare const __internal: {
    extractBlocks: (text: string) => Block[];
    parseDiffHeaders: (body: string) => Array<{
        a: string;
        b: string;
    }>;
    isCommitLast: (text: string) => boolean;
};

/**
 * Detect and clean a patch payload from clipboard/file/argument.
 * - Unwraps chat fences and BEGIN/END PATCH banners when they wrap the entire payload.
 * - Extracts the first unified diff (fenced or raw).
 * - Normalizes EOL to LF, strips zero-width, and ensures a trailing newline.
 */
declare const detectAndCleanPatch: (input: string) => string;

type FileOp = {
    verb: 'mv';
    src: string;
    dest: string;
} | {
    verb: 'rm';
    src: string;
} | {
    verb: 'rmdir';
    src: string;
} | {
    verb: 'mkdirp';
    src: string;
};
type FileOpsPlan = {
    ops: FileOp[];
    errors: string[];
};
type OpResult = {
    verb: FileOp['verb'];
    src?: string;
    dest?: string;
    status: 'ok' | 'failed';
    errno?: string;
    message?: string;
};
/** Parse the optional "### File Ops" fenced block from a reply body. */
declare const parseFileOpsBlock: (source: string) => FileOpsPlan;
/** Execute File Ops with safety checks. Returns per-op results and overall ok. */
declare const executeFileOps: (cwd: string, ops: FileOp[], dryRun?: boolean) => Promise<{
    ok: boolean;
    results: OpResult[];
}>;

type AttemptCapture = {
    label: string;
    code: number;
    stdout: string;
    stderr: string;
};
type ApplyResult = {
    ok: boolean;
    tried: string[];
    lastCode: number;
    captures: AttemptCapture[];
};

type JsDiffOutcome = {
    okFiles: string[];
    failed: Array<{
        path: string;
        reason: string;
    }>;
    sandboxRoot?: string;
};
/** Apply cleaned unified diff text using jsdiff as a fallback engine. */
declare const applyWithJsDiff: (args: {
    cwd: string;
    cleaned: string;
    check: boolean;
    sandboxRoot?: string;
}) => Promise<JsDiffOutcome>;

type PipelineOutcome = {
    ok: boolean;
    result: ApplyResult;
    js: JsDiffOutcome | null;
};
/** Apply a cleaned unified diff to the working tree (no staging). */
declare const applyPatchPipeline: (args: {
    cwd: string;
    patchAbs: string;
    cleaned: string;
    check: boolean;
    /** Attempt order; defaults to [1,0] (p1 then p0). */
    stripOrder?: number[];
}) => Promise<PipelineOutcome>;

type ImportsMap = Record<string, string[]>;
/**
 * Prepare imports under <stanPath>/imports/<label>/... for archiving.
 * - Cleans each label directory prior to staging.
 * - Copies only files (skips directories); unreadable files are skipped best‑effort.
 *
 * @param args - Object with cwd, stanPath, and map of label -\> patterns.
 *   Optionally includes `onStage`, a callback invoked per label with
 *   repo‑relative staged paths.
 */
declare const prepareImports: (args: {
    cwd: string;
    stanPath: string;
    map?: ImportsMap | null;
    onStage?: (label: string, files: string[]) => void;
}) => Promise<void>;

/** Resolve packaged dist/stan.system.md if present. */
declare const getPackagedSystemPromptPath: () => string | null;

type AssembleResult = {
    target: string;
    action: 'written';
} | {
    target: string;
    action: 'skipped-no-parts';
    partsDir: string;
} | {
    target: string;
    action: 'skipped-no-md';
    partsDir: string;
};
/**
 * Assemble parts into the monolith (no logs).
 * - Returns 'written' when created/updated,
 * - 'skipped-no-parts' when parts dir missing,
 * - 'skipped-no-md' when no .md files present.
 */
declare const assembleSystemMonolith: (cwd: string, stanPath: string) => Promise<AssembleResult>;

declare const CORE_VERSION: string;

export { CORE_VERSION, DEFAULT_OPEN_COMMAND, DEFAULT_STAN_PATH, __internal, applyPatchPipeline, applyWithJsDiff, assembleSystemMonolith, createArchive, createArchiveDiff, detectAndCleanPatch, ensureOutputDir, executeFileOps, findConfigPathSync, getPackagedSystemPromptPath, loadConfig, loadConfigSync, parseFileOpsBlock, prepareImports, resolveStanPath, resolveStanPathSync, validateOrThrow, validateResponseMessage, writeArchiveSnapshot };
export type { ApplyResult, AssembleResult, Block, BlockKind, CliDefaults, CliDefaultsPatch, CliDefaultsRun, CliDefaultsSnap, ContextConfig, CreateArchiveOptions, FileOp, FileOpsPlan, ImportsMap, JsDiffOutcome, OpResult, PipelineOutcome, ScriptEntry, ScriptMap, SnapshotUpdateMode, ValidationResult };
