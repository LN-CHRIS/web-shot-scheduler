#!/bin/bash

# Android Rebuild Script for WebScreenshot Scheduler
# Run this from the project root directory

set -e  # Exit on any error

echo "🔄 Starting Android rebuild process..."

# Step 1: Remove existing Android folder
echo "📁 Removing existing android/ folder..."
rm -rf android/

# Step 2: Clean Gradle cache (optional but recommended)
read -p "Clean Gradle cache? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🧹 Cleaning Gradle cache..."
    rm -rf ~/.gradle/caches/
fi

# Step 3: Pull latest from GitHub
echo "📥 Pulling latest changes from GitHub..."
git pull

# Step 4: Install dependencies
echo "📦 Installing npm dependencies..."
npm install

# Step 5: Build the web app
echo "🔨 Building web app..."
npm run build

# Step 6: Add Android platform
echo "📱 Adding Android platform..."
npx cap add android

# Step 7: Sync Capacitor
echo "🔄 Syncing Capacitor..."
npx cap sync android

# Step 8: Copy plugin files
echo "📋 Copying custom plugin files..."

PLUGIN_DIR="android/app/src/main/java/app/lovable/webscreenshotscheduler"

if [ -d "$PLUGIN_DIR" ]; then
    cp android-plugin/WebViewScreenshotPlugin.kt "$PLUGIN_DIR/"
    cp android-plugin/MainActivity.kt "$PLUGIN_DIR/"
    echo "✅ Plugin files copied successfully!"
else
    echo "❌ Error: Plugin directory not found: $PLUGIN_DIR"
    exit 1
fi

echo ""
echo "✅ Android rebuild complete!"
echo ""

# Step 9: Optionally run the app
read -p "Run the app now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🚀 Launching app..."
    npx cap run android
fi
