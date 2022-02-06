module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  coverageThreshold: {
    global: {
      statements: 90,
    },
  },
  collectCoverageFrom: ["src/**/*.ts"],
  coverageReporters: ["json", "lcov", "text", "clover"],
};
