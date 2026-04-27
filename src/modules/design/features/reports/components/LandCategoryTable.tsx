import React from 'react';
import { GisCategoryStat } from '../hooks/useGisReport';

interface LandCategoryTableProps {
    categories: GisCategoryStat[];
}

export const LandCategoryTable: React.FC<LandCategoryTableProps> = ({ categories }) => {
    return (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm text-left text-zinc-500 dark:text-zinc-400">
                <thead className="text-xs text-zinc-700 uppercase bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300">
                    <tr>
                        <th scope="col" className="px-6 py-3">Loại Đất (Category)</th>
                        <th scope="col" className="px-6 py-3 text-right">Số lượng (Count)</th>
                        <th scope="col" className="px-6 py-3 text-right">Diện tích (m²)</th>
                        <th scope="col" className="px-6 py-3 text-right">Chu vi (m)</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {categories.map((cat, index) => (
                        <tr key={index} className="bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                            <td className="px-6 py-4 font-medium text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
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
                            <td colSpan={4} className="px-6 py-10 text-center text-zinc-400 italic">
                                Không có dữ liệu phân loại.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};
