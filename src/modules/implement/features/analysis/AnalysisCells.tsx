import { useState, useEffect, memo } from 'react';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export const GEOM_TYPES_OPTIONS = [
    'Điểm', 'Nút giao', 'CCTV', 'PTZ', 'SPEED', 'LPR',
    'Tủ thiết bị', 'Cột/Trụ', 'Cầu/Hầm'
];

export const EditableCell = memo(({
    value: initialValue,
    row,
    column,
    onUpdate,
    className,
    onClick
}: {
    value: any,
    row: any,
    column: any,
    onUpdate: (id: string, key: string, value: any) => void,
    className?: string,
    onClick?: () => void
}) => {
    const [value, setValue] = useState(initialValue);
    const [isEditing, setIsEditing] = useState(false);

    useEffect(() => {
        setValue(initialValue);
    }, [initialValue]);

    const onBlur = () => {
        setIsEditing(false);
        if (value !== initialValue) {
            onUpdate(row.original.id, column.id, value);
        }
    };

    if (isEditing) {
        return (
            <input
                value={value as string || ''}
                onChange={e => setValue(e.target.value)}
                onBlur={onBlur}
                autoFocus
                className="w-full bg-cad-elevated border-cad-accent border rounded px-1 py-0.5 outline-none font-medium text-cad-text-primary"
            />
        );
    }

    return (
        <div
            className={cn(
                "cursor-text hover:bg-cad-accent/10 rounded px-1 -mx-1 min-h-[1.5rem] flex items-start transition-colors",
                className
            )}
            onClick={() => {
                if (onClick) {
                    onClick();
                } else {
                    setIsEditing(true);
                }
            }}
            onDoubleClick={() => setIsEditing(true)}
            title={onClick ? "Nhấp chuột để xem trên bản đồ, nhấp đúp để sửa" : undefined}
        >
            <span className="line-clamp-2 break-words whitespace-normal">{value || <span className="text-cad-text-muted italic opacity-30">N/A</span>}</span>
        </div>
    );
});

export const DropdownCell = memo(({
    value: initialValue,
    options,
    row,
    column,
    onUpdate
}: {
    value: string,
    options: string[],
    row: any,
    column: any,
    onUpdate: (id: string, key: string, value: string) => void
}) => {
    const [value, setValue] = useState(initialValue);

    useEffect(() => {
        setValue(initialValue);
    }, [initialValue]);

    return (
        <select
            value={value}
            onChange={e => {
                const newValue = e.target.value;
                setValue(newValue);
                onUpdate(row.original.id, column.id, newValue);
            }}
            className="w-full bg-transparent border-none outline-none cursor-pointer text-cad-text-primary font-medium focus:ring-1 focus:ring-cad-accent rounded"
        >
            {options.map(opt => (
                <option key={opt} value={opt} className="bg-cad-bg text-cad-text-primary">
                    {opt}
                </option>
            ))}
        </select>
    );
});

export const checklistFilter = (row: any, columnId: string, filterValue: any) => {
    if (filterValue === undefined || filterValue === null) return true;
    if (Array.isArray(filterValue) && filterValue.length === 0) return false;

    const value = row.getValue(columnId);
    const stringValue = String(value || '(Blanks)');

    if (Array.isArray(filterValue)) {
        return filterValue.includes(stringValue);
    }
    return stringValue.toLowerCase().includes(String(filterValue).toLowerCase());
};
