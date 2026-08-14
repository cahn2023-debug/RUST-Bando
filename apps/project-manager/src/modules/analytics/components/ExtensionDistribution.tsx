import React from 'react';

export interface ExtensionStat {
    extension: string;
    count: number;
}

interface ExtensionDistributionProps {
    data: ExtensionStat[];
}

const COLORS = [
    '#10B981',
    '#34D399',
    '#60A5FA',
    '#C084FC',
    '#F59E0B',
    '#F87171',
];

const ExtensionDistribution: React.FC<ExtensionDistributionProps> = ({ data }) => {
    const total = (data || []).reduce((acc, curr) => acc + curr.count, 0);

    const segments = data.map((item, index) => {
        const percentage = total > 0 ? (item.count / total) * 100 : 0;
        const angle = total > 0 ? (item.count / total) * 360 : 0;
        
        const prevSum = data.slice(0, index).reduce((sum, d) => sum + d.count, 0);
        const startAngle = total > 0 ? (prevSum / total) * 360 - 90 : -90;
        const endAngle = startAngle + angle;
        
        const pathData = describeArc(50, 50, 40, startAngle, endAngle);
        return {
            ...item,
            percentage,
            pathData,
            color: COLORS[index % COLORS.length]
        };
    });

    return (
        <div className="cad-card p-6">
            <h3 className="mb-6 text-sm font-semibold uppercase tracking-wider text-cad-text-secondary">
                File Extension Distribution
            </h3>
            <div className="flex flex-col items-center justify-between gap-8 md:flex-row">
                <div className="relative h-48 w-48">
                    <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90 transform">
                        {segments.map((seg, i) => (
                            <path
                                key={i}
                                d={seg.pathData}
                                fill="none"
                                stroke={seg.color}
                                strokeWidth="12"
                                className="cursor-pointer transition-all duration-200 hover:opacity-80"
                            />
                        ))}
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-2xl font-bold text-cad-text-primary">{total}</span>
                        <span className="text-[10px] uppercase text-cad-text-muted">Total Files</span>
                    </div>
                </div>

                <div className="flex w-full flex-col gap-3 md:w-auto">
                    {segments.map((seg, i) => (
                        <div key={i} className="flex items-center gap-3">
                            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: seg.color }} />
                            <span className="min-w-16 text-sm text-cad-text-secondary">{seg.extension || 'none'}</span>
                            <span className="text-sm font-semibold text-cad-text-primary">{seg.count}</span>
                            <span className="ml-auto text-xs text-cad-text-muted">{seg.percentage.toFixed(1)}%</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

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
