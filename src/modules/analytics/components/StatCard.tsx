import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
    title: string;
    value: string | number;
    icon: LucideIcon;
    description?: string;
    color?: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon: Icon, description, color = 'blue' }) => {
    const colorMap: Record<string, string> = {
        blue: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
        purple: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
        green: 'text-green-400 bg-green-400/10 border-green-400/20',
        orange: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
    };

    const colorClass = colorMap[color] || colorMap.blue;

    return (
        <div className={`p-6 rounded-2xl border backdrop-blur-xl bg-white/5 transition-all hover:bg-white/10 ${colorClass}`}>
            <div className="flex items-center justify-between mb-4">
                <div className="p-3 rounded-xl bg-white/5">
                    <Icon size={24} />
                </div>
            </div>
            <div>
                <h3 className="text-sm font-medium text-white/60 mb-1 tracking-wider uppercase">{title}</h3>
                <p className="text-3xl font-bold text-white tracking-tight">{value}</p>
                {description && (
                    <p className="text-xs text-white/40 mt-2">{description}</p>
                )}
            </div>
        </div>
    );
};

export default StatCard;
