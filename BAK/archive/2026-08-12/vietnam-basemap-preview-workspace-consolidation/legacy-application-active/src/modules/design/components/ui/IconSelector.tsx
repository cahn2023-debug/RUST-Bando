import type { IconType } from '@CONTRACT/types';
import { SYMBOL_ICON_OPTIONS } from '@TOOL/utils/featureUtils';

interface IconSelectorProps {
  value: IconType;
  onChange: (icon: IconType) => void;
  className?: string;
}

export const IconSelector: React.FC<IconSelectorProps> = ({ value, onChange, className }) => {
  return (
    <div className={`space-y-2 ${className || ''}`}>
      <label className="text-[10px] font-black text-cad-text-secondary uppercase tracking-widest block">Biểu tượng</label>
      <div className="grid grid-cols-5 gap-2">
        {SYMBOL_ICON_OPTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            aria-pressed={value === item.id}
            className={`
              flex flex-col items-center justify-center p-2 rounded-md border transition-colors gap-1 cursor-pointer
              ${value === item.id
                ? 'border-cad-accent bg-cad-accent/10 text-cad-accent'
                : 'border-cad-border bg-cad-surface text-cad-text-muted hover:border-cad-accent/40 hover:text-cad-text-primary'}
            `}
            title={item.label}
          >
            <item.component className={`w-5 h-5 ${value === item.id ? 'stroke-2' : 'stroke-1'}`} />
            <span className="text-[8px] font-bold uppercase hidden md:block">{item.id}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
