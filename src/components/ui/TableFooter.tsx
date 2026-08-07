import React from 'react';
import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react';

interface TableFooterProps {
    totalItems: number;
    selectedItems?: number;
    pageSize: number;
    currentPage: number;
    totalPages: number;
    onPageSizeChange: (size: number) => void;
    onPageChange: (page: number) => void;
    pageSizeOptions?: number[];
}

const PAGE_SIZE_OPTIONS = [10, 13, 20, 25, 50, 100];

export default function TableFooter({
    totalItems,
    selectedItems = 0,
    pageSize,
    currentPage,
    totalPages,
    onPageSizeChange,
    onPageChange,
    pageSizeOptions = PAGE_SIZE_OPTIONS,
}: TableFooterProps) {
    return (
        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-t border-gray-100 text-xs text-gray-500 select-none">
            {/* Left: counts */}
            <div className="flex flex-col gap-0.5 min-w-[120px]">
                <span>Total Items: <span className="font-semibold text-gray-700">{totalItems}</span></span>
            </div>

            {/* Center: page size */}
            <div className="flex items-center gap-2">
                <span className="text-gray-400">Page Size:</span>
                <select
                    value={pageSize}
                    onChange={(e) => onPageSizeChange(Number(e.target.value))}
                    className="border border-gray-200 rounded px-1.5 py-0.5 text-xs text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                    {pageSizeOptions.map((s) => (
                        <option key={s} value={s}>{s}</option>
                    ))}
                </select>
            </div>

            {/* Right: navigation */}
            <div className="flex items-center gap-1">
                <NavBtn onClick={() => onPageChange(1)} disabled={currentPage === 1} title="First page">
                    <ChevronsLeft size={13} />
                </NavBtn>
                <NavBtn onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} title="Previous page">
                    <ChevronLeft size={13} />
                </NavBtn>

                <span className="px-2 font-medium text-gray-700">
                    {totalPages === 0 ? '0 / 0' : `${currentPage} / ${totalPages}`}
                </span>

                <NavBtn onClick={() => onPageChange(currentPage + 1)} disabled={currentPage >= totalPages} title="Next page">
                    <ChevronRight size={13} />
                </NavBtn>
                <NavBtn onClick={() => onPageChange(totalPages)} disabled={currentPage >= totalPages} title="Last page">
                    <ChevronsRight size={13} />
                </NavBtn>
            </div>
        </div>
    );
}

function NavBtn({
    children,
    onClick,
    disabled,
    title,
}: {
    children: React.ReactNode;
    onClick: () => void;
    disabled: boolean;
    title?: string;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={title}
            className="p-1 rounded border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
            {children}
        </button>
    );
}
