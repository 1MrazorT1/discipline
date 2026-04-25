#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_command npm
require_command supabase

echo "Installing npm dependencies..."
npm install --legacy-peer-deps

echo "Running TypeScript check..."
npm run typecheck

echo "Pushing Supabase migrations..."
supabase db push

echo "Deploying Supabase Edge Functions..."
for function_name in \
  analyze-meal \
  get-upload-url \
  get-photo-url \
  get-photo-urls
do
  echo "Deploying ${function_name}..."
  supabase functions deploy "$function_name"
done

echo "Deleting retired household Edge Functions if they still exist..."
for function_name in \
  create-household-invite \
  join-household
do
  echo "Deleting ${function_name}..."
  if supabase functions delete "$function_name" --yes >/dev/null 2>&1; then
    echo "Deleted ${function_name}."
  else
    echo "Skipped ${function_name}; it may already be deleted."
  fi
done

echo "Starting Expo with a clean cache..."
npm start -- --clear
