export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
  appUrl: process.env.EXPO_PUBLIC_APP_URL ?? "",
};

export const assertClientEnv = () => {
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error(
      "Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
};

/** Returns the URL Supabase should redirect to after email confirmation.
 * - Web: uses EXPO_PUBLIC_APP_URL (e.g. the GitHub Pages URL)
 * - Native: uses the deep-link scheme (discipline://)
 */
export const getAuthRedirectUrl = (): string => {
  if (typeof document !== "undefined" && document.location?.origin) {
    return `${document.location.origin}${env.appUrl.replace(/^https?:\/\/[^/]+/, "")}/`;
  }
  return "discipline://";
};
