import { useState, useRef, useCallback } from 'react';
import { Media } from '@capacitor-community/media';
import { toast } from '@/hooks/use-toast';
import html2canvas from 'html2canvas';

interface SchedulerConfig {
  url: string;
  intervalMinutes: number;
  width: number;
  height: number;
}

const ALBUM_NAME = 'Web Screenshots';

// Get or create the album for storing screenshots
const getOrCreateAlbum = async (): Promise<string> => {
  const { albums } = await Media.getAlbums();
  const existing = albums.find(a => a.name === ALBUM_NAME);
  
  if (existing) {
    return existing.identifier;
  }
  
  // Create new album
  await Media.createAlbum({ name: ALBUM_NAME });
  const { albums: updatedAlbums } = await Media.getAlbums();
  const created = updatedAlbums.find(a => a.name === ALBUM_NAME);
  
  if (!created) {
    throw new Error('Failed to create album');
  }
  
  return created.identifier;
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
      });

      // Convert canvas to base64 PNG with data URI prefix
      const base64DataUri = canvas.toDataURL('image/png');
      
      if (!base64DataUri || base64DataUri.length < 100) {
        throw new Error('Screenshot capture produced empty image');
      }
      
      // Get or create album, then save photo
      const albumId = await getOrCreateAlbum();
      await Media.savePhoto({
        path: base64DataUri,
        albumIdentifier: albumId,
      });

      const now = new Date().toLocaleTimeString();
      setLastCapture(now);
      setCaptureCount(prev => prev + 1);
      
      toast({
        title: "Screenshot captured",
        description: `Saved to "${ALBUM_NAME}" at ${now}`,
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
