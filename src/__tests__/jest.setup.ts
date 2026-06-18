import { jest as jestGlobals } from '@jest/globals';

Object.assign(globalThis, {
  jest: jestGlobals,
});
