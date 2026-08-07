import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export interface TableFooterProps {
  totalItems: number;
  selectedItems?: number;
  pageSize: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export default function TableFooter({
  totalItems,
  selectedItems = 0,
  pageSize,
  currentPage,
  onPageChange,
  onPageSizeChange,
}: TableFooterProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between p-3 border-t border-slate-200 bg-white text-xs text-slate-500">
      <div className="flex flex-col gap-0.5 min-w-[120px]">
        <span>Total Items: {totalItems}</span>
        <span>Selected Items: {selectedItems}</span>
      </div>

      <div className="flex items-center gap-2 mt-3 sm:mt-0">
        <span>Page Size:</span>
        <select
          value={pageSize}
          onChange={(e) => {
            onPageSizeChange(Number(e.target.value));
            onPageChange(1); // Reset to page 1 on page size change
          }}
          className="border border-slate-300 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-blue-500 bg-white"
        >
          <option value="10">10</option>
          <option value="13">13</option>
          <option value="25">25</option>
          <option value="50">50</option>
          <option value="100">100</option>
        </select>
      </div>

      <div className="flex items-center gap-2 mt-3 sm:mt-0">
        <button
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          className="p-1 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronsLeft className="w-4 h-4 text-slate-500" />
        </button>
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-1 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-slate-500" />
        </button>
        <span className="min-w-[40px] text-center font-medium">
          {currentPage} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="p-1 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-4 h-4 text-slate-500" />
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          className="p-1 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronsRight className="w-4 h-4 text-slate-500" />
        </button>
      </div>
    </div>
  );
}
