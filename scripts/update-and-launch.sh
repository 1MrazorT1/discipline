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

echo "Pushing Supabase migrations..."
supabase db push

echo "Deploying Supabase Edge Functions..."
for function_name in \
  analyze-meal \
  get-upload-url \
  get-photo-url \
  get-photo-urls \
  create-household-invite \
  join-household
do
  echo "Deploying ${function_name}..."
  supabase functions deploy "$function_name"
done

echo "Starting Expo with a clean cache..."
npm start -- --clear
