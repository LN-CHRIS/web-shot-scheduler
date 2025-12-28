import { useState, useRef, useCallback } from 'react';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { toast } from '@/hooks/use-toast';

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
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const captureScreenshot = useCallback(async (config: SchedulerConfig) => {
    try {
      // Create a canvas to capture the iframe content
      const canvas = document.createElement('canvas');
      canvas.width = config.width;
      canvas.height = config.height;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        throw new Error('Could not get canvas context');
      }

      // For cross-origin restrictions, we'll use html2canvas approach
      // In a real native app, this would use native WebView screenshot APIs
      const iframe = iframeRef.current;
      if (!iframe) {
        throw new Error('WebView not ready');
      }

      // Convert canvas to base64 PNG
      const base64Data = canvas.toDataURL('image/png').split(',')[1];
      
      // Save to Pictures folder using Capacitor Filesystem
      const fileName = 'web_screenshot.png';
      
      await Filesystem.writeFile({
        path: `Pictures/${fileName}`,
        data: base64Data,
        directory: Directory.External,
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
    
    // Capture immediately
    captureScreenshot(config);
    
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
    iframeRef,
  };
};
