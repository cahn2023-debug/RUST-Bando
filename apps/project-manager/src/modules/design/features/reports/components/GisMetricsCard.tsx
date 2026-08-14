import React from 'react';
import { LucideIcon } from 'lucide-react';

interface GisMetricsCardProps {
    title: string;
    value: string | number;
    description?: string;
    icon: LucideIcon;
    colorClass?: string;
}

export const GisMetricsCard: React.FC<GisMetricsCardProps> = ({ title, value, description, icon: Icon, colorClass = "text-cad-accent" }) => {
    return (
        <div className="bg-cad-surface p-6 rounded-xl border border-cad-border shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm font-medium text-cad-text-secondary mb-1">{title}</p>
                    <h3 className="text-2xl font-bold text-cad-text-primary">{value}</h3>
                    {description && (
                        <p className="text-xs text-cad-text-muted mt-1">{description}</p>
                    )}
                </div>
                <div className={`p-3 rounded-lg bg-cad-elevated ${colorClass}`}>
                    <Icon size={24} />
                </div>
            </div>
        </div>
    );
};
