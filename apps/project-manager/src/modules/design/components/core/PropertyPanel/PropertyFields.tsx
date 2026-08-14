import React from 'react';
import { safeString } from '@TOOL/utils/featureUtils';

interface ReadOnlyFieldProps {
  label: string;
  value: string;
}

export const ReadOnlyField = React.memo<ReadOnlyFieldProps>(({ label, value }) => (
  <div className="space-y-1">
    <label className="text-[8px] font-bold text-cad-text-muted uppercase tracking-tighter ml-1">{label}</label>
    <div className="bg-cad-bg rounded px-2 py-1 text-[10px] font-mono text-cad-accent font-semibold border border-cad-border">
      {value}
    </div>
  </div>
));

ReadOnlyField.displayName = 'ReadOnlyField';

interface DesignFieldProps {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
}

export const DesignField = React.memo<DesignFieldProps>(({ label, icon, value, onChange }) => (
  <div className="space-y-1">
    <label className="text-[9px] font-bold text-cad-text-muted uppercase tracking-tighter ml-1 flex items-center gap-1.5">
      {icon} {label}
    </label>
    <input
      className="w-full bg-cad-bg border border-cad-border rounded px-3 py-1.5 text-xs text-cad-text-primary focus:border-cad-accent outline-none transition-all"
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      placeholder={`Enter ${safeString(label).toLowerCase()}...`}
    />
  </div>
));

DesignField.displayName = 'DesignField';
