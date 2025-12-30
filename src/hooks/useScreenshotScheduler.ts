import { useState, useRef, useCallback } from 'react';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Screenshot } from 'capacitor-screenshot';
import { toast } from '@/hooks/use-toast';

interface SchedulerConfig {
  url: string;
  intervalMinutes: number;
  width: number;
  height: number;
}

const FOLDER_PATH = 'Pictures/WebScreenshots';
const FILE_NAME = 'screenshot.png';

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

  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugLog(prev => [...prev.slice(-9), `[${timestamp}] ${message}`]);
    console.log(`[Screenshot] ${message}`);
  }, []);

  // Save base64 screenshot to filesystem
  const saveScreenshot = useCallback(async (base64Data: string) => {
    try {
      const cleanBase64 = base64Data.includes(',') 
        ? base64Data.split(',')[1] 
        : base64Data;
      
      if (!cleanBase64 || cleanBase64.length < 100) {
        throw new Error('Screenshot data is empty or invalid');
      }
      
      addLog(`Saving (${Math.round(cleanBase64.length / 1024)}KB)...`);
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
        description: `Saved to ${FOLDER_PATH}/${FILE_NAME}`,
      });
      
      pendingCaptureRef.current = false;
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      addLog(`Save FAILED: ${msg}`);
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

  // Capture using native screenshot plugin
  const captureScreenshot = useCallback(async () => {
    if (pendingCaptureRef.current) {
      addLog('Capture pending, skipping');
      return false;
    }

    if (!webViewReadyRef.current) {
      addLog('WebView not ready');
      return false;
    }

    pendingCaptureRef.current = true;
    addLog('Taking native screenshot...');
    
    try {
      const result = await Screenshot.take();
      
      if (result?.base64) {
        addLog('Screenshot captured');
        await saveScreenshot(result.base64);
        return true;
      } else {
        throw new Error('No screenshot data returned');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      addLog(`Capture FAILED: ${msg}`);
      console.error('Capture failed:', error);
      toast({
        title: "Capture failed",
        description: msg,
        variant: "destructive",
      });
      pendingCaptureRef.current = false;
      return false;
    }
  }, [addLog, saveScreenshot]);

  const onWebViewLoad = useCallback(() => {
    addLog('WebView loaded, waiting 3s...');
    webViewReadyRef.current = true;
    
    setTimeout(() => {
      addLog('First capture...');
      captureScreenshot();
    }, 3000);
  }, [captureScreenshot, addLog]);

  const startSchedule = useCallback(async (newConfig: SchedulerConfig) => {
    if (isRunning) return;

    setConfig(newConfig);
    setIsRunning(true);
    setShowWebView(true);
    setCaptureCount(0);
    setDebugLog([]);
    webViewReadyRef.current = false;
    addLog(`Starting: ${newConfig.url}`);
    
    const intervalMs = newConfig.intervalMinutes * 60 * 1000;
    intervalRef.current = setInterval(() => {
      if (webViewReadyRef.current) {
        captureScreenshot();
      }
    }, intervalMs);

    toast({
      title: "Schedule started",
      description: `Every ${newConfig.intervalMinutes} min`,
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
    webViewReadyRef.current = false;
    addLog('Stopped');
    
    toast({
      title: "Schedule stopped",
      description: `Total: ${captureCount}`,
    });
  }, [captureCount, addLog]);

  const manualCapture = useCallback(() => {
    if (webViewReadyRef.current) {
      addLog('Manual capture');
      captureScreenshot();
    } else {
      addLog('Not ready');
      toast({
        title: "Not ready",
        description: "WebView not loaded",
        variant: "destructive",
      });
    }
  }, [captureScreenshot, addLog]);

  return {
    isRunning,
    lastCapture,
    captureCount,
    startSchedule,
    stopSchedule,
    onWebViewLoad,
    config,
    debugLog,
    manualCapture,
    showWebView,
  };
};
