#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "Running TypeScript check..."
npm run typecheck

echo "Running production dependency audit..."
npm audit --omit=dev

echo "Checking common local-only paths are ignored..."
git check-ignore -q .env
git check-ignore -q .expo/devices.json
git check-ignore -q node_modules/.package-lock.json
git check-ignore -q supabase/.temp/project-ref
git check-ignore -q expo-env.d.ts

echo "Security check completed."
