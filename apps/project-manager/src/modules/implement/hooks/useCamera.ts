
import { useState, useRef } from 'react';

interface UseCameraProps {
  onCapture: (dataUrl: string) => void;
  watermarkData?: {
    location?: [number, number];
    label?: string;
  };
}

export const useCamera = ({ onCapture, watermarkData }: UseCameraProps) => {
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
      setStream(s);
      setIsCameraOpen(true);
      if (videoRef.current) videoRef.current.srcObject = s;
    } catch (error) {
      console.error("Camera access failed:", error);
      setIsCameraOpen(true); // Fallback for file picker if needed
    }
  };

  const stopCamera = () => {
    if (stream) stream.getTracks().forEach(track => track.stop());
    setStream(null);
    setIsCameraOpen(false);
    setIsCapturing(false);
  };

  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    setIsCapturing(true);
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Watermark Logic
      const timestamp = new Date().toLocaleString('vi-VN');
      const fontSize = Math.max(18, Math.floor(canvas.height / 35));
      ctx.font = `bold ${fontSize}px sans-serif`;
      const padding = fontSize;
      const lineHeight = fontSize * 1.5;
      
      const lines = [
        watermarkData?.location ? `📍 Tọa độ: ${watermarkData.location[0].toFixed(6)}, ${watermarkData.location[1].toFixed(6)}` : null,
        `⏰ Thời gian: ${timestamp}`,
        `🏢 Đối tượng: ${watermarkData?.label || 'N/A'}`
      ].filter(Boolean) as string[];

      const boxWidth = Math.min(canvas.width * 0.8, 600);
      const boxHeight = lines.length * lineHeight + padding;
      
      ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
      ctx.fillRect(0, canvas.height - boxHeight, boxWidth, boxHeight);
      
      ctx.fillStyle = "white";
      let currentY = canvas.height - padding;
      [...lines].reverse().forEach(line => {
        ctx.fillText(line, padding, currentY);
        currentY -= lineHeight;
      });

      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      onCapture(dataUrl);
      stopCamera();
    }
  };

  return {
    isCameraOpen,
    isCapturing,
    videoRef,
    canvasRef,
    startCamera,
    stopCamera,
    capture
  };
};
