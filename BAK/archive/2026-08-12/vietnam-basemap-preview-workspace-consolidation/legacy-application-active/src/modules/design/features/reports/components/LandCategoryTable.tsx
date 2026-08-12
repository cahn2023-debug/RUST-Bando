import React from 'react';
import { GisCategoryStat } from '../hooks/useGisReport';

interface LandCategoryTableProps {
    categories: GisCategoryStat[];
}

export const LandCategoryTable: React.FC<LandCategoryTableProps> = ({ categories }) => {
    return (
        <div className="overflow-x-auto rounded-lg border border-cad-border">
            <table className="w-full text-sm text-left text-cad-text-secondary">
                <thead className="text-xs text-cad-text-secondary uppercase bg-cad-elevated">
                    <tr>
                        <th scope="col" className="px-6 py-3">Loại Đất (Category)</th>
                        <th scope="col" className="px-6 py-3 text-right">Số lượng (Count)</th>
                        <th scope="col" className="px-6 py-3 text-right">Diện tích (m²)</th>
                        <th scope="col" className="px-6 py-3 text-right">Chu vi (m)</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-cad-border">
                    {categories.map((cat, index) => (
                        <tr key={index} className="bg-cad-surface hover:bg-cad-elevated transition-colors">
                            <td className="px-6 py-4 font-medium text-cad-text-primary whitespace-nowrap">
                                {cat.category || "Chưa phân loại"}
                            </td>
                            <td className="px-6 py-4 text-right">
                                {cat.count.toLocaleString()}
                            </td>
                            <td className="px-6 py-4 text-right font-mono">
                                {cat.total_area.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-6 py-4 text-right font-mono">
                                {cat.total_perimeter.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                        </tr>
                    ))}
                    {categories.length === 0 && (
                        <tr>
                            <td colSpan={4} className="px-6 py-10 text-center text-cad-text-muted italic">
                                Không có dữ liệu phân loại.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};
