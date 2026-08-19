# Auth Configuration Update

## Issue
When a new user signs up, the email verification redirect (`emailRedirectTo`) points to `discipline://` which only works on native (iOS/Android). On web (GitHub Pages), users get a dead link after confirming their email.

## Required Supabase Dashboard Changes

These must be done manually in the Supabase Dashboard since the Management API is not accessible from this environment:

1. Go to: https://supabase.com/dashboard/project/xpwgqneyzxyaafumuqdz/auth/settings
2. Under **URL Configuration**:
   - Set **Site URL** to: `https://1mrazorT1.github.io/discipline`
   - Set **Additional Redirect URLs** to (one per line):
     ```
     discipline://
     https://1mrazorT1.github.io/discipline/
     https://1mrazorT1.github.io/discipline
     http://localhost:19006
     http://localhost:3000
     exp://*
     ```
3. Enable **Confirm email** / **Secure email change** as needed.

## App Code Changes (Already Implemented)

- `lib/env.ts`: Added `appUrl` config and `getAuthRedirectUrl()` — returns the web URL on web, deep link scheme on native
- `app/(auth)/register.tsx`: Uses `getAuthRedirectUrl()` instead of hardcoded `"discipline://"`
- `app/verified.tsx`: New "You are now verified" page shown after email confirmation
- `app/_layout.tsx`: Updated to redirect to `/verified` after confirming email via the auth URL handler
- `supabase/config.toml`: Auth config synced to the remote project

## Testing

Once the redirect URLs are configured above:
1. Sign up for a new account
2. Click the verification link in the confirmation email
3. The app should open and show "You are now verified"
4. Tapping "Log in" navigates to the login screen
