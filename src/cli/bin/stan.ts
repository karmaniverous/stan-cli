// src/cli/bin/stan.ts
// CLI bootstrap (executes the parser). Kept separate from src/cli/stan/
// to avoid file/folder name conflicts and follow the decomposition policy.
import { makeCli } from '../stan';

void makeCli().parseAsync();
