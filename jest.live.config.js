/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/jest.setup.ts'],
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  moduleNameMapper: {
    '^axios$': '<rootDir>/__mocks__/axios.ts',
    '^gdc-common-utils-ts/(.*)$': '<rootDir>/node_modules/gdc-common-utils-ts/dist/$1.js',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
      useESM: true,
    }],
  },
};
