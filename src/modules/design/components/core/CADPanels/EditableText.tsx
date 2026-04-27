import { useState, KeyboardEvent, useEffect } from "react";
import { cn } from "@TOOL/utils/cn";

interface EditableTextProps {
  value: string;
  onSave: (val: string) => void;
  className?: string;
  placeholder?: string;
}

export function EditableText({ value: initialValue, onSave, className, placeholder }: EditableTextProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(initialValue);

  // Sync with external value changes
  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const handleSave = () => {
    if (value !== initialValue) {
      onSave(value);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setValue(initialValue);
    }
  };

  if (isEditing) {
    return (
      <input
        type="text"
        autoFocus
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={cn("bg-cad-primary border border-cad-accent outline-none text-white px-1 h-3.5 w-full text-[9px] font-mono", className)}
        onClick={e => e.stopPropagation()}
        onDoubleClick={e => e.stopPropagation()}
      />
    );
  }

  return (
    <span
      className={cn("cursor-text block min-w-[4px] min-h-[1em]", className)}
      onDoubleClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
      title={initialValue || placeholder}
    >
      {initialValue || <span className="text-cad-text-muted/40 italic">{placeholder}</span>}
    </span>
  );
}
