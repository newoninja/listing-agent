/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest',
testEnvironment: 'node',
  transform: {
    '^.+\.(ts|tsx)$': '<rootDir>/src/$1',
  },
};
