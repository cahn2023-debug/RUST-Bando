import React, { useState, useEffect } from 'react';
import { Scan, ShieldCheck, AlertTriangle } from 'lucide-react';
import recognitionImage from '@DESIGN/recognition-sim-license.png';

interface RecognitionSimulatorProps {
    ppm: number;
}

export const RecognitionSimulator: React.FC<RecognitionSimulatorProps> = ({ ppm }) => {
    const [scanPos, setScanPos] = useState(0);
    const isRecognized = ppm >= 125;
    const isId = ppm >= 250;

    // Scanning animation logic
    useEffect(() => {
        const interval = setInterval(() => {
            setScanPos(prev => (prev >= 100 ? 0 : prev + 1));
        }, 50);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="space-y-2 mt-4">
            <div className="flex justify-between items-center px-1">
                <label className="text-[10px] text-cad-text-secondary uppercase font-black tracking-wider flex items-center gap-1.5">
                    <Scan className="w-3 h-3 text-cad-active" /> Mô phỏng Nhận diện AI
                </label>
                <div className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase ${isRecognized ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30'}`}>
                    {isRecognized ? (isId ? 'Level: Identification' : 'Level: Recognition') : 'Level: Observation/Low'}
                </div>
            </div>

            <div className="relative aspect-video rounded-xl bg-black overflow-hidden border border-cad-border group shadow-2xl">
                {/* Background Image (User provided license plate) */}
                <div className="absolute inset-0 overflow-hidden">
                    <img
                        src={recognitionImage}
                        alt="Recognition Simulation"
                        style={{
                            filter: ppm < 50 ? `blur(${Math.max(0, (50 - ppm) / 5)}px) contrast(0.8)` : 'none',
                        }}
                        className={`w-full h-full object-cover transition-all duration-200 ${ppm < 125 ? 'image-pixelated grayscale' : 'grayscale-0'
                            }`}
                        onError={(e) => {
                            (e.target as any).src = 'https://placehold.co/600x400/1e1e1e/444?text=Save+image+to+assets/recognition-sim-license.webp';
                        }}
                    />

                    {/* Pixelation Overlay for Low PPM */}
                    {ppm < 80 && (
                        <div
                            className="absolute inset-0 pointer-events-none opacity-40 mix-blend-overlay"
                            style={{
                                backgroundImage: `radial-gradient(circle, #000 1px, transparent 1px)`,
                                backgroundSize: `${Math.max(2, 20 - ppm / 5)}px ${Math.max(2, 20 - ppm / 5)}px`
                            }}
                        />
                    )}
                </div>

                {/* AI Overlay Layer */}
                <div className="absolute inset-0 pointer-events-none">
                    {/* Pulsing Bounding Box - Targeted at center plate area */}
                    {isRecognized && (
                        <div className="absolute top-[40%] left-[30%] w-[40%] h-[25%] border-2 border-green-500 animate-[pulse_1.5s_infinite] shadow-[0_0_15px_rgba(34,197,94,0.5)]">
                            {/* Corner brackets */}
                            <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-white" />
                            <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-white" />
                            <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-white" />
                            <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-white" />

                            {/* Tag Label */}
                            <div className="absolute -top-5 left-0 bg-green-500 text-black text-[7px] font-black px-1.5 py-0.5 uppercase tracking-tighter rounded-sm">
                                LPR: 51F-123.45  (98.4%)
                            </div>
                        </div>
                    )}

                    {/* Scanning Vertical Line */}
                    <div
                        className="absolute top-0 bottom-0 w-[1px] bg-cyan-400/50 shadow-[0_0_10px_cyan]"
                        style={{ left: `${scanPos}%` }}
                    />

                    {/* HUD Elements */}
                    <div className="absolute top-2 left-2 p-1.5 bg-black/40 backdrop-blur-md rounded border border-white/10 space-y-1">
                        <div className="flex items-center gap-1.5">
                            <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isRecognized ? 'bg-green-500' : 'bg-red-500'}`} />
                            <span className="text-[8px] font-black text-white uppercase tracking-widest">
                                {isRecognized ? 'System: Active' : 'System: Seeking'}
                            </span>
                        </div>
                        <div className="font-mono text-[7px] text-cyan-400 opacity-70">
                            COORD_X: {ppm.toFixed(0)} | SCAN_V2.4
                        </div>
                    </div>

                    {/* Bottom Status Bar */}
                    <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-between px-3">
                        <div className="flex items-center gap-1.5">
                            {isRecognized ? <ShieldCheck className="w-3 h-3 text-green-400" /> : <AlertTriangle className="w-3 h-3 text-yellow-500" />}
                            <span className="text-[8px] font-bold text-gray-300 uppercase tracking-tighter">
                                {isRecognized ? 'Target Acquired & Vectorized' : 'Resolution Insufficient for OCR'}
                            </span>
                        </div>
                        <div className="text-[8px] font-mono text-cyan-500 font-black">
                            PPM {ppm.toFixed(0)}
                        </div>
                    </div>
                </div>

                {/* Retro CRT Scanline Effect Overlay */}
                <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.03),rgba(0,255,0,0.01),rgba(0,0,255,0.03))] bg-[length:100%_4px,3px_100%] pointer-events-none opacity-40" />
            </div>
        </div>
    );
};
