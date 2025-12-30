import { registerPlugin } from '@capacitor/core';

export interface CaptureOptions {
  url: string;
  width: number;
  height: number;
  delayMs?: number; // Wait time after page load (default 3000)
}

export interface CaptureResult {
  base64: string;
  width: number;
  height: number;
}

export interface WebViewScreenshotPlugin {
  capture(options: CaptureOptions): Promise<CaptureResult>;
}

const WebViewScreenshot = registerPlugin<WebViewScreenshotPlugin>('WebViewScreenshot');

export default WebViewScreenshot;
