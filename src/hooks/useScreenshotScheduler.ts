import { useState, useRef, useCallback, useEffect } from 'react';
import { Filesystem, Directory } from '@capacitor/filesystem';
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
    // Ignore "directory exists" errors
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
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const pendingCaptureRef = useRef<boolean>(false);

  // Save base64 screenshot to filesystem
  const saveScreenshot = useCallback(async (base64Data: string) => {
    try {
      // Remove data URI prefix if present
      const cleanBase64 = base64Data.includes(',') 
        ? base64Data.split(',')[1] 
        : base64Data;
      
      if (!cleanBase64 || cleanBase64.length < 100) {
        throw new Error('Screenshot data is empty or invalid');
      }
      
      await ensureFolder();
      
      await Filesystem.writeFile({
        path: `${FOLDER_PATH}/${FILE_NAME}`,
        data: cleanBase64,
        directory: Directory.ExternalStorage,
      });

      const now = new Date().toLocaleTimeString();
      setLastCapture(now);
      setCaptureCount(prev => prev + 1);
      
      toast({
        title: "Screenshot captured",
        description: `Saved to ${FOLDER_PATH}/${FILE_NAME} at ${now}`,
      });
      
      pendingCaptureRef.current = false;
      return true;
    } catch (error) {
      console.error('Screenshot save failed:', error);
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: "destructive",
      });
      pendingCaptureRef.current = false;
      return false;
    }
  }, []);

  // Listen for postMessage from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Check if it's a screenshot result
      if (event.data?.type === 'screenshot-result' && event.data?.data) {
        console.log('Received screenshot from iframe');
        saveScreenshot(event.data.data);
      } else if (event.data?.type === 'screenshot-error') {
        console.error('Screenshot error from iframe:', event.data.message);
        toast({
          title: "Capture failed",
          description: event.data.message || 'Unknown error from page',
          variant: "destructive",
        });
        pendingCaptureRef.current = false;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [saveScreenshot]);

  // Request screenshot from iframe via postMessage
  const captureScreenshot = useCallback(async () => {
    try {
      const iframe = iframeRef.current;
      if (!iframe?.contentWindow) {
        throw new Error('Iframe not ready');
      }

      if (pendingCaptureRef.current) {
        console.log('Capture already pending, skipping');
        return false;
      }

      pendingCaptureRef.current = true;
      
      // Send capture request to iframe
      iframe.contentWindow.postMessage({ type: 'capture-screenshot' }, '*');
      console.log('Sent capture request to iframe');
      
      return true;
    } catch (error) {
      console.error('Capture request failed:', error);
      toast({
        title: "Capture failed",
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: "destructive",
      });
      pendingCaptureRef.current = false;
      return false;
    }
  }, []);

  const [config, setConfig] = useState<SchedulerConfig | null>(null);
  const iframeLoadedRef = useRef<boolean>(false);

  // Called when iframe finishes loading
  const onIframeLoad = useCallback(() => {
    console.log('Iframe loaded');
    iframeLoadedRef.current = true;
    
    // Capture immediately after load
    setTimeout(() => {
      captureScreenshot();
    }, 1000);
  }, [captureScreenshot]);

  const startSchedule = useCallback(async (newConfig: SchedulerConfig) => {
    if (isRunning) return;

    setConfig(newConfig);
    setIsRunning(true);
    setCaptureCount(0);
    iframeLoadedRef.current = false;
    
    // Set up interval (first capture happens on iframe load)
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
  }, [isRunning, captureScreenshot]);

  const stopSchedule = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRunning(false);
    pendingCaptureRef.current = false;
    
    toast({
      title: "Schedule stopped",
      description: `Total captures: ${captureCount}`,
    });
  }, [captureCount]);

  return {
    isRunning,
    lastCapture,
    captureCount,
    startSchedule,
    stopSchedule,
    iframeRef,
    onIframeLoad,
    config,
  };
};
