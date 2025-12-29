import { useState, useRef, useCallback } from 'react';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { toast } from '@/hooks/use-toast';
import html2canvas from 'html2canvas';

interface SchedulerConfig {
  url: string;
  intervalMinutes: number;
  width: number;
  height: number;
}

const FOLDER_NAME = 'WebScreenshots';
const FILE_NAME = 'screenshot.png';

// Ensure the folder exists in Pictures directory
const ensureFolder = async (): Promise<void> => {
  try {
    await Filesystem.mkdir({
      path: FOLDER_NAME,
      directory: Directory.ExternalStorage,
      recursive: true,
    });
  } catch (error: any) {
    // Folder already exists - that's fine
    if (!error.message?.includes('exists')) {
      throw error;
    }
  }
};

export const useScreenshotScheduler = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [lastCapture, setLastCapture] = useState<string | null>(null);
  const [captureCount, setCaptureCount] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const captureScreenshot = useCallback(async (config: SchedulerConfig) => {
    try {
      const container = containerRef.current;
      if (!container) {
        throw new Error('WebView container not ready');
      }

      // Wait a moment for content to render
      await new Promise(resolve => setTimeout(resolve, 500));

      // Capture the container using html2canvas
      const canvas = await html2canvas(container, {
        width: config.width,
        height: config.height,
        useCORS: true,
        allowTaint: true,
        logging: false,
        scale: 1,
        backgroundColor: '#ffffff',
      });

      // Get raw base64 PNG data (without data URI prefix)
      const base64Data = canvas.toDataURL('image/png').split(',')[1];
      
      if (!base64Data || base64Data.length < 100) {
        throw new Error('Screenshot capture produced empty image');
      }
      
      // Ensure folder exists and save file
      await ensureFolder();
      
      await Filesystem.writeFile({
        path: `${FOLDER_NAME}/${FILE_NAME}`,
        data: base64Data,
        directory: Directory.ExternalStorage,
      });

      const now = new Date().toLocaleTimeString();
      setLastCapture(now);
      setCaptureCount(prev => prev + 1);
      
      toast({
        title: "Screenshot captured",
        description: `Saved to Pictures/${FOLDER_NAME}/${FILE_NAME} at ${now}`,
      });
      
      return true;
    } catch (error) {
      console.error('Screenshot capture failed:', error);
      toast({
        title: "Capture failed",
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: "destructive",
      });
      return false;
    }
  }, []);

  const startSchedule = useCallback(async (config: SchedulerConfig) => {
    if (isRunning) return;

    setIsRunning(true);
    setCaptureCount(0);
    
    // Wait for iframe to load before first capture
    setTimeout(() => {
      captureScreenshot(config);
    }, 2000);
    
    // Set up interval
    const intervalMs = config.intervalMinutes * 60 * 1000;
    intervalRef.current = setInterval(() => {
      captureScreenshot(config);
    }, intervalMs);

    toast({
      title: "Schedule started",
      description: `Capturing every ${config.intervalMinutes} minute(s)`,
    });
  }, [isRunning, captureScreenshot]);

  const stopSchedule = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRunning(false);
    
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
    containerRef,
  };
};
