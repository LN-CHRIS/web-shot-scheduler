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
      });

      // Convert canvas to base64 PNG (remove the data:image/png;base64, prefix)
      const base64Data = canvas.toDataURL('image/png').split(',')[1];
      
      if (!base64Data || base64Data.length < 100) {
        throw new Error('Screenshot capture produced empty image');
      }
      
      // Save to public Pictures folder using ExternalStorage
      const fileName = 'web_screenshot.png';
      
      await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.ExternalStorage,
        recursive: true,
      });

      const now = new Date().toLocaleTimeString();
      setLastCapture(now);
      setCaptureCount(prev => prev + 1);
      
      toast({
        title: "Screenshot captured",
        description: `Saved to Pictures/${fileName} at ${now}`,
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

  const startSchedule = useCallback((config: SchedulerConfig) => {
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
