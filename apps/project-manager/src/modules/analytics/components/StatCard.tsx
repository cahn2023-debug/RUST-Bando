import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
    title: string;
    value: string | number;
    icon: LucideIcon;
    description?: string;
    color?: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon: Icon, description }) => {
    return (
        <div className="cad-card p-6 transition-all hover:border-cad-accent/50 hover:bg-cad-elevated">
            <div className="mb-4 flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-md border border-cad-border bg-cad-bg text-cad-accent">
                    <Icon size={24} />
                </div>
            </div>
            <div>
                <h3 className="mb-1 text-sm font-medium uppercase tracking-wider text-cad-text-muted">{title}</h3>
                <p className="text-3xl font-bold tracking-tight text-cad-text-primary">{value}</p>
                {description && (
                    <p className="mt-2 text-xs text-cad-text-muted">{description}</p>
                )}
            </div>
        </div>
    );
};

export default StatCard;
