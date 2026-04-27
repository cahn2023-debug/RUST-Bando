import React from 'react';
import { LucideIcon } from 'lucide-react';

interface GisMetricsCardProps {
    title: string;
    value: string | number;
    description?: string;
    icon: LucideIcon;
    colorClass?: string;
}

export const GisMetricsCard: React.FC<GisMetricsCardProps> = ({ title, value, description, icon: Icon, colorClass = "text-blue-500" }) => {
    return (
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">{title}</p>
                    <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{value}</h3>
                    {description && (
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">{description}</p>
                    )}
                </div>
                <div className={`p-3 rounded-lg bg-zinc-100 dark:bg-zinc-800 ${colorClass}`}>
                    <Icon size={24} />
                </div>
            </div>
        </div>
    );
};
