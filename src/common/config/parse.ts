// src/common/config/parse.ts
import YAML from 'yaml';

/**
 * Parse configuration text based on file extension.
 * - JSON when path ends with ".json"
 * - YAML otherwise
 */
export const parseText = (p: string, text: string): unknown =>
  p.endsWith('.json')
    ? (JSON.parse(text) as unknown)
    : (YAML.parse(text) as unknown);
