import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useScreenshotScheduler } from '@/hooks/useScreenshotScheduler';
import { Camera, Play, Square, Globe, Clock, Maximize2 } from 'lucide-react';

export const ScreenshotScheduler = () => {
  const [url, setUrl] = useState('https://example.com');
  const [intervalMinutes, setIntervalMinutes] = useState(5);
  const [width, setWidth] = useState(1280);
  const [height, setHeight] = useState(720);

  const { 
    isRunning, 
    lastCapture, 
    captureCount, 
    startSchedule, 
    stopSchedule,
    iframeRef 
  } = useScreenshotScheduler();

  const handleToggle = () => {
    if (isRunning) {
      stopSchedule();
    } else {
      startSchedule({ url, intervalMinutes, width, height });
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 pb-8">
      <div className="max-w-md mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3 py-4">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
            <Camera className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Web Screenshot</h1>
            <p className="text-sm text-muted-foreground">Scheduled capture tool</p>
          </div>
        </div>

        {/* Status Card */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${isRunning ? 'bg-success animate-pulse' : 'bg-muted-foreground'}`} />
                <span className="text-sm font-medium">
                  {isRunning ? 'Running' : 'Stopped'}
                </span>
              </div>
              {lastCapture && (
                <span className="text-xs text-muted-foreground">
                  Last: {lastCapture} ({captureCount} total)
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* URL Input */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary" />
              Website URL
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              type="url"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isRunning}
              className="bg-background"
            />
          </CardContent>
        </Card>

        {/* Interval Input */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Capture Interval
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={1440}
                value={intervalMinutes}
                onChange={(e) => setIntervalMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                disabled={isRunning}
                className="bg-background"
              />
              <span className="text-sm text-muted-foreground whitespace-nowrap">minutes</span>
            </div>
          </CardContent>
        </Card>

        {/* Size Inputs */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Maximize2 className="w-4 h-4 text-primary" />
              Screenshot Size
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Width (px)</Label>
                <Input
                  type="number"
                  min={100}
                  max={3840}
                  value={width}
                  onChange={(e) => setWidth(Math.max(100, parseInt(e.target.value) || 100))}
                  disabled={isRunning}
                  className="bg-background"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Height (px)</Label>
                <Input
                  type="number"
                  min={100}
                  max={2160}
                  value={height}
                  onChange={(e) => setHeight(Math.max(100, parseInt(e.target.value) || 100))}
                  disabled={isRunning}
                  className="bg-background"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Button */}
        <Button 
          onClick={handleToggle}
          className={`w-full h-14 text-lg font-medium ${
            isRunning 
              ? 'bg-destructive hover:bg-destructive/90' 
              : 'bg-primary hover:bg-primary/90'
          }`}
        >
          {isRunning ? (
            <>
              <Square className="w-5 h-5 mr-2" />
              Stop Schedule
            </>
          ) : (
            <>
              <Play className="w-5 h-5 mr-2" />
              Start Schedule
            </>
          )}
        </Button>

        {/* Hidden iframe for WebView capture */}
        {isRunning && (
          <div className="fixed -left-[9999px] -top-[9999px]" style={{ width, height }}>
            <iframe
              ref={iframeRef}
              src={url}
              width={width}
              height={height}
              title="Capture WebView"
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
        )}

        {/* Info */}
        <p className="text-xs text-center text-muted-foreground px-4">
          Screenshots are saved to your Pictures folder as "web_screenshot.png" and replaced on each capture.
        </p>
      </div>
    </div>
  );
};
