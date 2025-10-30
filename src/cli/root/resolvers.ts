// src/cli/root/resolvers.ts
import * as cliUtils from '@/cli/cli-utils';
// Registrars
import * as initMod from '@/cli/init';
import * as patchMod from '@/cli/patch';
import { resolveNamedOrDefaultFunction } from '@/common/interop/resolve';

type InitModule = typeof import('@/cli/init');
type PatchModule = typeof import('@/cli/patch');
type CliUtilsModule = typeof import('@/cli/cli-utils');

export type RegisterInitFn = InitModule['registerInit'];
export type RegisterPatchFn = PatchModule['registerPatch'];
export type ApplyCliSafetyFn = CliUtilsModule['applyCliSafety'];
export type RootDefaultsFn = CliUtilsModule['runDefaults'];
export type TagDefaultFn = CliUtilsModule['tagDefault'];

export const resolveRegisterInit = (): RegisterInitFn | undefined => {
  try {
    return resolveNamedOrDefaultFunction<RegisterInitFn>(
      initMod as unknown,
      (m) => (m as InitModule).registerInit,
      (m) => (m as { default?: Partial<InitModule> }).default?.registerInit,
      'registerInit',
    );
  } catch {
    try {
      const def = (initMod as unknown as { default?: unknown }).default;
      return typeof def === 'function'
        ? (def as unknown as RegisterInitFn)
        : undefined;
    } catch {
      return undefined;
    }
  }
};

export const resolveRegisterPatch = (): RegisterPatchFn | undefined => {
  try {
    return resolveNamedOrDefaultFunction<RegisterPatchFn>(
      patchMod as unknown,
      (m) => (m as PatchModule).registerPatch,
      (m) => (m as { default?: Partial<PatchModule> }).default?.registerPatch,
      'registerPatch',
    );
  } catch {
    try {
      const def = (patchMod as unknown as { default?: unknown }).default;
      return typeof def === 'function'
        ? (def as unknown as RegisterPatchFn)
        : undefined;
    } catch {
      return undefined;
    }
  }
};

export const resolveApplyCliSafety = (): ApplyCliSafetyFn | undefined => {
  try {
    return resolveNamedOrDefaultFunction<ApplyCliSafetyFn>(
      cliUtils as unknown,
      (m) => (m as CliUtilsModule).applyCliSafety,
      (m) =>
        (m as { default?: Partial<CliUtilsModule> }).default?.applyCliSafety,
      'applyCliSafety',
    );
  } catch {
    return undefined;
  }
};

export const resolveRootDefaults = ():
  | ((dir?: string) => {
      archive: boolean;
      combine: boolean;
      plan: boolean;
      keep: boolean;
      sequential: boolean;
      live: boolean;
      hangWarn: number;
      hangKill: number;
      hangKillGrace: number;
      prompt: string;
      facets: boolean;
      // we read debug/boring/yes via a local fallback
    })
  | undefined => {
  try {
    return resolveNamedOrDefaultFunction<RootDefaultsFn>(
      cliUtils as unknown,
      (m) => (m as CliUtilsModule).runDefaults,
      (m) => (m as { default?: Partial<CliUtilsModule> }).default?.runDefaults,
      'runDefaults',
    );
  } catch {
    return undefined;
  }
};

export const resolveTagDefault = (): TagDefaultFn | undefined => {
  try {
    return resolveNamedOrDefaultFunction<TagDefaultFn>(
      cliUtils as unknown,
      (m) => (m as CliUtilsModule).tagDefault,
      (m) => (m as { default?: Partial<CliUtilsModule> }).default?.tagDefault,
      'tagDefault',
    );
  } catch {
    return undefined;
  }
};
