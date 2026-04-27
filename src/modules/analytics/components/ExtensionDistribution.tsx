import React from 'react';

export interface ExtensionStat {
    extension: string;
    count: number;
}

interface ExtensionDistributionProps {
    data: ExtensionStat[];
}

const COLORS = [
    '#60A5FA', // Blue
    '#C084FC', // Purple
    '#4ADE80', // Green
    '#FB923C', // Orange
    '#F87171', // Red
    '#2DD4BF', // Teal
];

const ExtensionDistribution: React.FC<ExtensionDistributionProps> = ({ data }) => {
    const total = (data || []).reduce((acc, curr) => acc + curr.count, 0);

    // Calculate segments for SVG Doughnut
    let currentAngle = -90;
    const segments = data.map((item, index) => {
        const percentage = (item.count / total) * 100;
        const angle = (item.count / total) * 360;
        const pathData = describeArc(50, 50, 40, currentAngle, currentAngle + angle);
        currentAngle += angle;
        return {
            ...item,
            percentage,
            pathData,
            color: COLORS[index % COLORS.length]
        };
    });

    return (
        <div className="p-6 rounded-2xl border border-white/10 backdrop-blur-xl bg-white/5">
            <h3 className="text-sm font-semibold text-white/60 mb-6 uppercase tracking-wider">File Extension Distribution</h3>
            <div className="flex flex-col md:flex-row items-center justify-between gap-8">
                <div className="relative w-48 h-48">
                    <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                        {segments.map((seg, i) => (
                            <path
                                key={i}
                                d={seg.pathData}
                                fill="none"
                                stroke={seg.color}
                                strokeWidth="12"
                                className="transition-all duration-700 hover:opacity-80 cursor-pointer"
                            />
                        ))}
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-2xl font-bold text-white">{total}</span>
                        <span className="text-[10px] text-white/40 uppercase">Total Files</span>
                    </div>
                </div>

                <div className="flex flex-col gap-3 w-full md:w-auto">
                    {segments.map((seg, i) => (
                        <div key={i} className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: seg.color }} />
                            <span className="text-sm text-white/70 min-w-16">{seg.extension || 'none'}</span>
                            <span className="text-sm font-semibold text-white">{seg.count}</span>
                            <span className="text-xs text-white/30 ml-auto">{seg.percentage.toFixed(1)}%</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// Helper functions for SVG Arc
function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
        x: centerX + radius * Math.cos(angleInRadians),
        y: centerY + radius * Math.sin(angleInRadians),
    };
}

function describeArc(x: number, y: number, radius: number, startAngle: number, endAngle: number) {
    const start = polarToCartesian(x, y, radius, endAngle);
    const end = polarToCartesian(x, y, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
    return [
        'M', start.x, start.y,
        'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y
    ].join(' ');
}

export default ExtensionDistribution;
