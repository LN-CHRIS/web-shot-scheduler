import { useState, useRef, useCallback } from 'react';
import { Filesystem, Directory } from '@capacitor/filesystem';
import WebViewScreenshot from '@/plugins/WebViewScreenshotPlugin';
import { toast } from '@/hooks/use-toast';

interface SchedulerConfig {
  url: string;
  intervalMinutes: number;
  width: number;
  height: number;
}

const FOLDER_PATH = 'Pictures/WebScreenshots';
const FILE_NAME = 'screenshot.png';
const ERROR_LOG_FILE = 'error_log.txt';

// Ensure the folder exists in Pictures directory
const ensureFolder = async (): Promise<void> => {
  try {
    await Filesystem.mkdir({
      path: FOLDER_PATH,
      directory: Directory.ExternalStorage,
      recursive: true,
    });
  } catch (error: any) {
    const msg = error?.message?.toLowerCase() || '';
    if (!msg.includes('exist') && !msg.includes('already')) {
      console.warn('mkdir warning:', error);
    }
  }
};

// Append error to log file in the same folder as screenshots
const appendErrorLog = async (message: string): Promise<void> => {
  try {
    await ensureFolder();
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;
    
    // Try to read existing log first
    let existingContent = '';
    try {
      const existing = await Filesystem.readFile({
        path: `${FOLDER_PATH}/${ERROR_LOG_FILE}`,
        directory: Directory.ExternalStorage,
      });
      existingContent = typeof existing.data === 'string' ? existing.data : '';
    } catch {
      // File doesn't exist yet, that's fine
    }
    
    // Append new error (keep last 100 entries max)
    const lines = existingContent.split('\n').filter(l => l.trim());
    const recentLines = lines.slice(-99);
    const newContent = [...recentLines, logEntry.trim()].join('\n') + '\n';
    
    await Filesystem.writeFile({
      path: `${FOLDER_PATH}/${ERROR_LOG_FILE}`,
      data: newContent,
      directory: Directory.ExternalStorage,
    });
  } catch (e) {
    console.error('Failed to write error log:', e);
  }
};

export const useScreenshotScheduler = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [lastCapture, setLastCapture] = useState<string | null>(null);
  const [captureCount, setCaptureCount] = useState(0);
  const [config, setConfig] = useState<SchedulerConfig | null>(null);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [showWebView, setShowWebView] = useState(false);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const pendingCaptureRef = useRef<boolean>(false);
  const webViewReadyRef = useRef<boolean>(false);

  const addLog = useCallback((message: string, isError: boolean = false) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugLog(prev => [...prev.slice(-9), `[${timestamp}] ${message}`]);
    console.log(`[Screenshot] ${message}`);
    
    // Write errors to file
    if (isError) {
      appendErrorLog(message);
    }
  }, []);

  // Save base64 screenshot to filesystem (no resizing needed - native captures at exact size)
  const saveScreenshot = useCallback(async (base64Data: string, width: number, height: number) => {
    try {
      const cleanBase64 = base64Data.includes(',') 
        ? base64Data.split(',')[1] 
        : base64Data;
      
      if (!cleanBase64 || cleanBase64.length < 100) {
        throw new Error('Screenshot data is empty or invalid');
      }
      
      addLog(`Saving ${width}x${height} (${Math.round(cleanBase64.length / 1024)}KB)...`);
      await ensureFolder();
      
      await Filesystem.writeFile({
        path: `${FOLDER_PATH}/${FILE_NAME}`,
        data: cleanBase64,
        directory: Directory.ExternalStorage,
      });

      const now = new Date().toLocaleTimeString();
      setLastCapture(now);
      setCaptureCount(prev => prev + 1);
      addLog(`Saved at ${now}`);
      
      toast({
        title: "Screenshot captured",
        description: `Saved ${width}x${height} to ${FOLDER_PATH}/${FILE_NAME}`,
      });
      
      pendingCaptureRef.current = false;
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      addLog(`Save FAILED: ${msg}`, true);
      console.error('Screenshot save failed:', error);
      toast({
        title: "Save failed",
        description: msg,
        variant: "destructive",
      });
      pendingCaptureRef.current = false;
      return false;
    }
  }, [addLog]);

  // Capture using custom off-screen WebView plugin
  const captureScreenshot = useCallback(async (captureConfig?: SchedulerConfig) => {
    const cfg = captureConfig || config;
    if (!cfg) {
      addLog('No config set');
      return false;
    }

    if (pendingCaptureRef.current) {
      addLog('Capture pending, skipping');
      return false;
    }

    pendingCaptureRef.current = true;
    addLog(`Capturing ${cfg.width}x${cfg.height}...`);
    
    try {
      // Use custom plugin that creates off-screen WebView at exact dimensions
      const result = await WebViewScreenshot.capture({
        url: cfg.url,
        width: cfg.width,
        height: cfg.height,
        delayMs: 3000, // Wait 3s for page to fully render
      });
      
      if (result?.base64) {
        addLog(`Captured ${result.width}x${result.height}`);
        await saveScreenshot(result.base64, result.width, result.height);
        return true;
      } else {
        throw new Error('No screenshot data returned');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      addLog(`Capture FAILED: ${msg}`, true);
      console.error('Capture failed:', error);
      toast({
        title: "Capture failed",
        description: msg,
        variant: "destructive",
      });
      pendingCaptureRef.current = false;
      return false;
    }
  }, [addLog, saveScreenshot, config]);

  const startSchedule = useCallback(async (newConfig: SchedulerConfig) => {
    if (isRunning) return;

    setConfig(newConfig);
    setIsRunning(true);
    setShowWebView(false); // No visible WebView needed - capture is off-screen
    setCaptureCount(0);
    setDebugLog([]);
    addLog(`Starting: ${newConfig.url} at ${newConfig.width}x${newConfig.height}`);
    
    // Trigger first capture immediately with the new config
    setTimeout(() => {
      captureScreenshot(newConfig);
    }, 500);
    
    // Set up interval for subsequent captures
    const intervalMs = newConfig.intervalMinutes * 60 * 1000;
    intervalRef.current = setInterval(() => {
      captureScreenshot(newConfig);
    }, intervalMs);

    toast({
      title: "Schedule started",
      description: `Capturing ${newConfig.width}x${newConfig.height} every ${newConfig.intervalMinutes} min`,
    });
  }, [isRunning, captureScreenshot, addLog]);

  const stopSchedule = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRunning(false);
    setShowWebView(false);
    pendingCaptureRef.current = false;
    addLog('Stopped');
    
    toast({
      title: "Schedule stopped",
      description: `Total: ${captureCount}`,
    });
  }, [captureCount, addLog]);

  const manualCapture = useCallback(() => {
    if (config) {
      addLog('Manual capture');
      captureScreenshot();
    } else {
      addLog('No config set');
      toast({
        title: "Not configured",
        description: "Start the scheduler first",
        variant: "destructive",
      });
    }
  }, [captureScreenshot, addLog, config]);

  return {
    isRunning,
    lastCapture,
    captureCount,
    startSchedule,
    stopSchedule,
    config,
    debugLog,
    manualCapture,
    showWebView,
  };
};
