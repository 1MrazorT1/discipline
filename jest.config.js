/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  transformIgnorePatterns: [
    "/node_modules/(?!((.pnpm|)?(react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|react-native-svg|@supabase|react-native-reanimated|react-native-gesture-handler|react-native-safe-area-context|react-native-keyboard-aware-scroll-view)))",
    "/node_modules/react-native-reanimated/plugin/",
    "/node_modules/@react-native/babel-preset/",
  ],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    // Map Deno-style npm: imports (with optional version) to their npm equivalents.
    // Handles scoped packages like npm:@supabase/supabase-js@2 → @supabase/supabase-js
    "^npm:(.+)@v?\\d+$": "$1",
    "^npm:(.+)$": "$1",
  },
  setupFilesAfterEnv: ["@testing-library/jest-native/extend-expect"],
  testEnvironment: "node",
  testMatch: ["**/*.test.{ts,tsx}"],
  testPathIgnorePatterns: ["/node_modules/"],
};
