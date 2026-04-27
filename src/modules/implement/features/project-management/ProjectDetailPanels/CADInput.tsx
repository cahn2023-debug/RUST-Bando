export function CADInput({ label, value, onChange, type = "text", required = false }:
  { label: string, value: string | number, onChange: (v: string) => void, type?: string, required?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5 text-left">
      <label className="text-[9px] font-mono font-bold text-cad-text-muted uppercase tracking-widest">
        {label} {required && <span className="text-cad-accent">*</span>}
      </label>
      <input
        type={type}
        value={value}
        required={required}
        onChange={e => onChange(e.target.value)}
        className="bg-cad-bg border border-cad-border focus:border-cad-accent text-[11px] text-white p-2 outline-none transition-all rounded-sm uppercase font-mono"
      />
    </div>
  );
}
