/**
 * Custom Babel plugin that inlines `process.env.EXPO_BASE_URL` from the shell
 * environment, overriding babel-preset-expo's empty default (which comes from
 * `customTransformOptions.baseUrl`, set by `getBaseUrlFromExpoConfig` reading
 * `app.json` `experiments.baseUrl` — a field we can't use because it would
 * affect native builds).
 *
 * This plugin runs BEFORE babel-preset-expo's `define-plugin` (config-file
 * plugins always run before preset plugins in Babel), so when the define-plugin
 * later looks for the `process.env.EXPO_BASE_URL` MemberExpression, it finds a
 * StringLiteral instead and skips it.
 *
 * The base URL value is read from process.env at config-evaluation time (in the
 * main process) and passed to the plugin as an option, avoiding issues with
 * worker-thread env var access.
 */
const inlineExpoBaseUrlPlugin = ({ types: t }, options) => {
  const baseUrl = options.baseUrl || "";
  return {
    name: "inline-expo-base-url",
    visitor: {
      MemberExpression(path) {
        // Prevent rewriting if the member expression is on the left-hand side
        // of an assignment (e.g. `process.env.EXPO_BASE_URL = "..."`)
        if (
          t.isAssignmentExpression(path.parent) &&
          path.parent.left === path.node
        ) {
          return;
        }
        // Match the full chain: process.env.EXPO_BASE_URL
        if (path.matchesPattern("process.env.EXPO_BASE_URL")) {
          path.replaceWith(t.stringLiteral(baseUrl));
        }
      },
    },
  };
};

module.exports = function (api) {
  // Cache invalidation: include EXPO_BASE_URL in the cache key so that
  // changing the env var (e.g. setting /discipline for web builds)
  // forces a rebuild. `api.cache.using()` enables caching with a custom
  // key function; it cannot be combined with `api.cache(true)`.
  api.cache.using(() => process.env.EXPO_BASE_URL || "no-base-url");

  // Read the env var at config-evaluation time (main process) and pass
  // it to the plugin as an option. This avoids worker-thread env var issues.
  const baseUrl = process.env.EXPO_BASE_URL || "";

  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }], "nativewind/babel"],
    plugins: [
      "react-native-reanimated/plugin",
      [inlineExpoBaseUrlPlugin, { baseUrl }],
    ],
  };
};
