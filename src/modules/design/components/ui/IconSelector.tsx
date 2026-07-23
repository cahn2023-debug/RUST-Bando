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
      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Biểu tượng</label>
      <div className="grid grid-cols-5 gap-2">
        {SYMBOL_ICON_OPTIONS.map((item) => (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            className={`
              flex flex-col items-center justify-center p-2 rounded-xl border-2 transition-all gap-1
              ${value === item.id
                ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                : 'border-slate-100 bg-white text-slate-400 hover:border-slate-200'}
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
