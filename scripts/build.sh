#!/bin/bash

# Build script for MCP Context Server

set -e

echo "🔨 Building MCP Context Server..."

# Clean previous build
if [ -d "build" ]; then
    rm -rf build
fi

# Install dependencies
npm ci

# Run security audit
echo "🔒 Running security audit..."
npm audit --audit-level moderate

# Build TypeScript
echo "📦 Compiling TypeScript..."
npm run build

# Copy non-TS files
echo "📋 Copying configuration files..."
mkdir -p build/config
cp config/*.example.* build/config/ 2>/dev/null || true

echo "✅ Build complete! Output in ./build/"
echo "🚀 Run with: node build/index.js"