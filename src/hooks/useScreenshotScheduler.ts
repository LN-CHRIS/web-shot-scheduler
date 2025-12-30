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

  // Resize image to target dimensions
  const resizeImage = useCallback(async (base64Data: string, targetWidth: number, targetHeight: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }
        // Draw and scale image to target size
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        // Get base64 without data URL prefix
        const resizedBase64 = canvas.toDataURL('image/png').split(',')[1];
        resolve(resizedBase64);
      };
      img.onerror = () => reject(new Error('Failed to load image for resize'));
      const prefix = base64Data.includes(',') ? '' : 'data:image/png;base64,';
      img.src = prefix + base64Data;
    });
  }, []);

  // Save base64 screenshot to filesystem
  const saveScreenshot = useCallback(async (base64Data: string, width?: number, height?: number) => {
    try {
      let cleanBase64 = base64Data.includes(',') 
        ? base64Data.split(',')[1] 
        : base64Data;
      
      if (!cleanBase64 || cleanBase64.length < 100) {
        throw new Error('Screenshot data is empty or invalid');
      }

      // Resize if dimensions provided
      if (width && height) {
        addLog(`Resizing to ${width}x${height}...`);
        cleanBase64 = await resizeImage(base64Data, width, height);
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
        description: `Saved ${width}x${height} to ${FOLDER_PATH}/${FILE_NAME}`,
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
  }, [addLog, resizeImage]);

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
        // Pass config dimensions for resizing
        await saveScreenshot(result.base64, config?.width, config?.height);
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
  }, [addLog, saveScreenshot, config]);

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
