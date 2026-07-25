import React from 'react';
import { mapRotationToHeading } from '@TOOL/utils/cameraMath';

export interface CameraHudFallbackProps {
    hfov: number;
    targetDistance: number;
    installHeight: number;
    targetHeight: number;
    rotation?: number;
    ppm: number;
    statusLabel: string;
    statusColor: string;
}

export const CameraHudFallback: React.FC<CameraHudFallbackProps> = ({
    hfov: rawHfov,
    targetDistance: rawTargetDistance,
    installHeight: rawInstallHeight,
    targetHeight: rawTargetHeight,
    rotation: rawRotation = 0,
    ppm: rawPpm,
    statusLabel,
    statusColor
}) => {
    const hfov = isNaN(rawHfov) || rawHfov <= 0 ? 60 : rawHfov;
    const targetDistance = isNaN(rawTargetDistance) || rawTargetDistance <= 0 ? 20 : rawTargetDistance;
    const installHeight = isNaN(rawInstallHeight) ? 3 : rawInstallHeight;
    const targetHeight = isNaN(rawTargetHeight) ? 1.7 : rawTargetHeight;
    const rotation = isNaN(rawRotation) ? 0 : rawRotation;
    const ppm = isNaN(rawPpm) ? 0 : rawPpm;

    const heading = mapRotationToHeading(rotation);

    const horizonY = 60;
    const getPerspectiveY = (d: number) => {
        return horizonY + 110 * Math.exp(-d / 40);
    };

    const targetY = getPerspectiveY(targetDistance);
    const targetHeightPixels = Math.max(5, Math.min(30, 25 * (targetHeight / 1.7) * Math.exp(-targetDistance / 40)));
    const halfFovRad = (hfov * Math.PI) / 360;
    const coneWidthAtHorizon = Math.max(10, Math.min(155, 110 * Math.tan(halfFovRad)));
    const gridDistances = [10, 20, 50, 100, 200];

    return (
        <div className="relative w-full h-full bg-[#070b12] border border-cad-border overflow-hidden rounded-lg">
            <svg viewBox="0 0 320 180" className="w-full h-full overflow-visible">
                <defs>
                    <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#080d1a" />
                        <stop offset="100%" stopColor="#111827" />
                    </linearGradient>
                    <linearGradient id="groundGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0d1424" />
                        <stop offset="100%" stopColor="#030712" />
                    </linearGradient>
                    <linearGradient id="coneGrad" x1="0" y1="1" x2="0" y2="0">
                        <stop offset="0%" stopColor={statusColor} stopOpacity="0.3" />
                        <stop offset="100%" stopColor={statusColor} stopOpacity="0.02" />
                    </linearGradient>
                </defs>

                {/* Background Sky & Ground */}
                <rect x="0" y="0" width="320" height={horizonY} fill="url(#skyGrad)" />
                <rect x="0" y={horizonY} width="320" height="120" fill="url(#groundGrad)" />
                <line x1="0" y1={horizonY} x2="320" y2={horizonY} stroke="#1e293b" strokeWidth="1" opacity="0.6" />

                {/* Perspective lanes */}
                {[-1.5, -0.75, 0, 0.75, 1.5].map((multiplier, i) => {
                    const xBottom = 160 + multiplier * 110;
                    return (
                        <line
                            key={i}
                            x1="160"
                            y1={horizonY}
                            x2={xBottom}
                            y2="180"
                            stroke="#334155"
                            strokeWidth="0.5"
                            opacity="0.25"
                        />
                    );
                })}

                {/* Distance grid lines */}
                {gridDistances.map((d) => {
                    const gridY = getPerspectiveY(d);
                    return (
                        <g key={d}>
                            <line
                                x1="0"
                                y1={gridY}
                                x2="320"
                                y2={gridY}
                                stroke="#334155"
                                strokeWidth="0.5"
                                strokeDasharray="2, 2"
                                opacity="0.3"
                            />
                            <text
                                x="8"
                                y={gridY - 2}
                                fill="#64748b"
                                fontSize="6"
                                fontFamily="monospace"
                                fontWeight="bold"
                                opacity="0.7"
                            >
                                {d}m
                            </text>
                        </g>
                    );
                })}

                {/* Field of View Cone */}
                <polygon
                    points={`160,170 ${160 - coneWidthAtHorizon},${horizonY} ${160 + coneWidthAtHorizon},${horizonY}`}
                    fill="url(#coneGrad)"
                    stroke={statusColor}
                    strokeWidth="1"
                    strokeOpacity="0.35"
                />

                {/* Scanning Sweep line */}
                <line x1="160" y1="170" x2="160" y2={horizonY} stroke={statusColor} strokeWidth="0.75" strokeOpacity="0.2">
                    <animateTransform
                        attributeName="transform"
                        type="rotate"
                        from={`-5 160 170`}
                        to={`5 160 170`}
                        dur="3s"
                        repeatCount="indefinite"
                        additive="sum"
                    />
                </line>

                {/* Target Indicator */}
                <g opacity={targetDistance > 300 ? 0.2 : 1}>
                    <rect
                        x={160 - targetHeightPixels * 0.25}
                        y={targetY - targetHeightPixels}
                        width={targetHeightPixels * 0.5}
                        height={targetHeightPixels}
                        fill="none"
                        stroke="#f472b6"
                        strokeWidth="1"
                        strokeDasharray="1, 1"
                        opacity="0.8"
                    />
                    <line
                        x1="160"
                        y1={targetY}
                        x2="160"
                        y2={targetY - targetHeightPixels}
                        stroke="#f472b6"
                        strokeWidth="1"
                        strokeDasharray="2, 2"
                        opacity="0.5"
                    />
                    <circle cx="160" cy={targetY - targetHeightPixels * 0.82} r={Math.max(1, targetHeightPixels * 0.12)} fill="#f472b6" />
                    <line x1="160" y1={targetY - targetHeightPixels * 0.7} x2="160" y2={targetY - targetHeightPixels * 0.25} stroke="#f472b6" strokeWidth="1.2" />
                    <line x1={160 - targetHeightPixels * 0.18} y1={targetY - targetHeightPixels * 0.55} x2={160 + targetHeightPixels * 0.18} y2={targetY - targetHeightPixels * 0.55} stroke="#f472b6" strokeWidth="1" />

                    <circle
                        cx="160"
                        cy={targetY - targetHeightPixels * 0.5}
                        r={targetHeightPixels * 0.75}
                        fill="none"
                        stroke="#f472b6"
                        strokeWidth="0.75"
                        opacity="0.8"
                    >
                        <animate attributeName="r" values={`${targetHeightPixels * 0.35};${targetHeightPixels * 1.1}`} dur="2.5s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.8;0" dur="2.5s" repeatCount="indefinite" />
                    </circle>
                </g>

                {/* Camera lens representation */}
                <circle cx="160" cy="170" r="5" fill="#1f2937" stroke="#4b5563" strokeWidth="1.5" />
                <circle cx="160" cy="170" r="2.5" fill={statusColor} />

                {/* HUD Compass Dial */}
                <g transform="translate(26, 26)">
                    <circle cx="0" cy="0" r="15" fill="#030712" stroke="#1f2937" strokeWidth="1" opacity="0.8" />
                    <text x="0" y="-9" fontSize="5" fontFamily="monospace" fill="#94a3b8" textAnchor="middle" fontWeight="black">N</text>
                    <text x="0" y="13" fontSize="5" fontFamily="monospace" fill="#4b5563" textAnchor="middle">S</text>
                    <text x="10" y="2" fontSize="5" fontFamily="monospace" fill="#4b5563" textAnchor="middle">E</text>
                    <text x="-10" y="2" fontSize="5" fontFamily="monospace" fill="#4b5563" textAnchor="middle">W</text>
                    <g transform={`rotate(${heading})`}>
                        <line x1="0" y1="8" x2="0" y2="-9" stroke="#f97316" strokeWidth="1.2" strokeLinecap="round" />
                        <polygon points="0,-11 -2.5,-5 2.5,-5" fill="#f97316" />
                    </g>
                    <circle cx="0" cy="0" r="1.5" fill="#030712" stroke="#f97316" strokeWidth="1" />
                </g>

                {/* Crosshairs */}
                <path d="M 12 90 L 22 90 M 17 85 L 17 95" stroke="#334155" strokeWidth="0.5" opacity="0.4" />
                <path d="M 298 90 L 308 90 M 303 85 L 303 95" stroke="#334155" strokeWidth="0.5" opacity="0.4" />
            </svg>

            {/* Compass Heading Label */}
            <div className="absolute top-2.5 left-11 text-[9px] font-mono text-gray-400 font-bold bg-[#030712]/60 px-1 rounded border border-white/5 backdrop-blur-sm">
                HDG: {Math.round(heading)}°
            </div>

            {/* Simulated Label */}
            <div className="absolute bottom-2.5 right-2.5 text-[8px] font-bold text-gray-500 uppercase tracking-widest bg-[#030712]/50 px-1.5 py-0.5 rounded border border-white/5 backdrop-blur-sm">
                Mô Phỏng Fallback HUD
            </div>

            {/* HUD Status Badge */}
            <div 
                className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 px-2 py-0.75 rounded-md border text-[9px] font-bold font-mono bg-[#030712]/90 shadow-lg backdrop-blur-sm transition-all"
                style={{ borderColor: `${statusColor}50` }}
            >
                <span className="relative flex h-2 w-2">
                    <span 
                        className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                        style={{ backgroundColor: statusColor }}
                    />
                    <span 
                        className="relative inline-flex rounded-full h-2 w-2"
                        style={{ backgroundColor: statusColor }}
                    />
                </span>
                <span className="text-gray-200">{statusLabel}</span>
            </div>

            {/* Stats Overlay HUD Card */}
            <div className="absolute top-2.5 right-2.5 bg-[#030712]/80 border border-white/10 rounded-md p-2 font-mono text-[9px] text-gray-300 w-32 shadow-xl backdrop-blur-md">
                <div className="flex justify-between border-b border-white/5 pb-1 mb-1 font-bold text-gray-400">
                    <span>HUD READOUT</span>
                    <span className="text-cad-warn animate-pulse">● FBCK</span>
                </div>
                <div className="space-y-1">
                    <div className="flex justify-between">
                        <span className="text-gray-500">HFOV:</span>
                        <span className="text-white font-bold">{hfov.toFixed(1)}°</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-500">PPM:</span>
                        <span className="text-white font-bold">{Math.round(ppm)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-500">DIST:</span>
                        <span className="text-white font-bold">{targetDistance}m</span>
                    </div>
                    <div className="flex justify-between border-t border-white/5 pt-1 mt-1">
                        <span className="text-gray-500">HEIGHT:</span>
                        <span className="text-white font-bold">{installHeight.toFixed(1)}m</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
