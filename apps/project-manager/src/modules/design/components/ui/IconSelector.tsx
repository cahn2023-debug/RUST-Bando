import type { IconType } from '@CONTRACT/types';
import { SYMBOL_ICON_OPTIONS } from '@TOOL/utils/featureUtils';

interface IconSelectorProps {
  value: IconType | null;
  onChange: (icon: IconType) => void;
  className?: string;
  mixed?: boolean;
}

export const IconSelector: React.FC<IconSelectorProps> = ({ value, onChange, className, mixed = false }) => {
  return (
    <div className={`space-y-2 ${className || ''}`}>
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-black text-cad-text-secondary uppercase tracking-widest block">
          Biểu tượng & Loại thiết bị
        </label>
        <span className="text-[9px] font-mono text-cad-accent uppercase tracking-wider">
          {mixed ? 'KHÁC NHAU' : (value || 'default')}
        </span>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
        {SYMBOL_ICON_OPTIONS.map((item) => {
          const isSelected = value === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              aria-pressed={isSelected}
              className={`
                flex flex-col items-center justify-center p-2 rounded-lg border transition-all duration-200 gap-1 cursor-pointer select-none
                ${isSelected
                  ? 'border-cad-accent bg-cad-accent/15 text-cad-accent ring-1 ring-cad-accent/30 shadow-sm'
                  : 'border-cad-border/60 bg-cad-surface/80 text-cad-text-muted hover:border-cad-accent/50 hover:bg-cad-surface-hover hover:text-cad-text-primary'}
              `}
              title={`${item.label} · ${item.objectType}`}
              aria-label={`${item.label} · ${item.objectType}`}
            >
              <item.component className={`w-5 h-5 ${isSelected ? 'stroke-[2.2]' : 'stroke-[1.5]'}`} />
              <span className="text-[8px] font-semibold text-center leading-tight truncate max-w-full px-0.5">{item.label}</span>
              <span className="text-[7px] font-mono text-cad-text-muted truncate max-w-full px-0.5">{item.objectType}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
