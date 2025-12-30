import { useState, useRef, useCallback } from 'react';
import { Filesystem, Directory } from '@capacitor/filesystem';
import html2canvas from 'html2canvas';
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
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const pendingCaptureRef = useRef<boolean>(false);
  const iframeLoadedRef = useRef<boolean>(false);

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
      
      addLog(`Saving screenshot (${Math.round(cleanBase64.length / 1024)}KB)...`);
      await ensureFolder();
      
      await Filesystem.writeFile({
        path: `${FOLDER_PATH}/${FILE_NAME}`,
        data: cleanBase64,
        directory: Directory.ExternalStorage,
      });

      const now = new Date().toLocaleTimeString();
      setLastCapture(now);
      setCaptureCount(prev => prev + 1);
      addLog(`Saved successfully at ${now}`);
      
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

  // Capture the iframe using html2canvas on a container div
  const captureScreenshot = useCallback(async () => {
    const container = document.getElementById('screenshot-container');
    
    if (!container) {
      addLog('ERROR: Container not found');
      return false;
    }

    if (pendingCaptureRef.current) {
      addLog('Capture already pending, skipping');
      return false;
    }

    pendingCaptureRef.current = true;
    addLog('Starting capture with html2canvas...');
    
    try {
      const canvas = await html2canvas(container, {
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#000000',
      });
      
      const dataUrl = canvas.toDataURL('image/png');
      addLog(`Canvas captured (${canvas.width}x${canvas.height})`);
      
      await saveScreenshot(dataUrl);
      return true;
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

  const onIframeLoad = useCallback(() => {
    addLog('Iframe loaded, waiting 3s before capture...');
    iframeLoadedRef.current = true;
    
    setTimeout(() => {
      addLog('Triggering first capture');
      captureScreenshot();
    }, 3000);
  }, [captureScreenshot, addLog]);

  const startSchedule = useCallback(async (newConfig: SchedulerConfig) => {
    if (isRunning) return;

    setConfig(newConfig);
    setIsRunning(true);
    setCaptureCount(0);
    setDebugLog([]);
    iframeLoadedRef.current = false;
    addLog(`Starting schedule: ${newConfig.url}`);
    
    const intervalMs = newConfig.intervalMinutes * 60 * 1000;
    intervalRef.current = setInterval(() => {
      if (iframeLoadedRef.current) {
        captureScreenshot();
      }
    }, intervalMs);

    toast({
      title: "Schedule started",
      description: `Capturing every ${newConfig.intervalMinutes} minute(s)`,
    });
  }, [isRunning, captureScreenshot, addLog]);

  const stopSchedule = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRunning(false);
    pendingCaptureRef.current = false;
    addLog('Schedule stopped');
    
    toast({
      title: "Schedule stopped",
      description: `Total captures: ${captureCount}`,
    });
  }, [captureCount, addLog]);

  const manualCapture = useCallback(() => {
    if (iframeLoadedRef.current) {
      addLog('Manual capture triggered');
      captureScreenshot();
    } else {
      addLog('Cannot capture - iframe not loaded');
      toast({
        title: "Not ready",
        description: "Iframe not loaded yet",
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
    iframeRef,
    onIframeLoad,
    config,
    debugLog,
    manualCapture,
  };
};
