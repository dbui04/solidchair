"use client";

import { useState, useRef, useEffect } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from "@tanstack/react-table";
import { api } from "~/trpc/react";

export function DataTable({ tableId }: { tableId: string }) {
  const [editingCell, setEditingCell] = useState<{
    rowId: string;
    columnId: string;
    cellId: string;
    value: string;
  } | null>(null);

  // Reference for keyboard navigation
  const tableRef = useRef<HTMLTableElement>(null);

  // Fetch table data
  const { data: tableData, isLoading } = api.table.getById.useQuery({
    id: tableId,
  });

  // Update cell mutation
  const utils = api.useUtils();
  const updateCell = api.table.updateCell.useMutation({
    onSuccess: async () => {
      await utils.table.getById.invalidate({ id: tableId });
    },
  });

  // Create a new row
  const createRow = api.table.createRow.useMutation({
    onSuccess: async () => {
      await utils.table.getById.invalidate({ id: tableId });
    },
  });

  // Setup table columns
  const columns =
    tableData?.columns.map((column) => ({
      id: column.id,
      header: column.name,
      accessorFn: (row: any) => {
        const cell = row.cells.find((c: any) => c.columnId === column.id);
        return cell?.value || "";
      },
      cell: ({ row, column, getValue }: any) => {
        const cellValue = getValue();
        const cellData = row.original.cells.find(
          (c: any) => c.columnId === column.id,
        );

        const isEditing =
          editingCell?.rowId === row.original.id &&
          editingCell?.columnId === column.id;

        // Format the display value based on column type
        let displayValue = cellValue;
        const columnInfo = tableData?.columns.find(
          (col) => col.id === column.id,
        );
        if (columnInfo?.type === "number" && cellValue) {
          const numValue = parseFloat(cellValue);
          if (!isNaN(numValue)) {
            displayValue = numValue.toLocaleString();
          }
        }

        if (isEditing && editingCell) {
          return (
            <input
              autoFocus
              className="w-full h-full px-3 py-2 border-none focus:outline-none bg-blue-50"
              value={editingCell.value}
              type={columnInfo?.type === "number" ? "number" : "text"}
              onChange={(e) =>
                setEditingCell({ ...editingCell, value: e.target.value })
              }
              onBlur={() => {
                updateCell.mutate({
                  id: editingCell.cellId,
                  value: editingCell.value,
                });
                setEditingCell(null);
              }}
              onKeyDown={(e) => {
                // Handle special key presses
                if (e.key === "Enter") {
                  e.preventDefault();
                  updateCell.mutate({
                    id: editingCell.cellId,
                    value: editingCell.value,
                  });
                  setEditingCell(null);

                  // Rest of your Enter key code...
                } else if (e.key === "Tab") {
                  e.preventDefault();
                  updateCell.mutate({
                    id: editingCell.cellId,
                    value: editingCell.value,
                  });
                  setEditingCell(null);

                  // Rest of your Tab key code...
                } else if (e.key === "Escape") {
                  setEditingCell(null);
                }
              }}
            />
          );
        }

        return (
          <div
            data-row-id={row.original.id}
            data-column-id={column.id}
            className={`w-full h-full px-3 py-2 cursor-pointer min-h-[36px] hover:bg-gray-50 ${
              columnInfo?.type === "number" ? "text-right" : ""
            }`}
            onClick={() => {
              if (cellData) {
                setEditingCell({
                  rowId: row.original.id,
                  columnId: column.id,
                  cellId: cellData.id,
                  value: cellData.value || "",
                });
              }
            }}
          >
            {displayValue}
          </div>
        );
      },
    })) || [];

  // Setup table instance
  const table = useReactTable({
    data: tableData?.rows || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const handleAddRow = () => {
    createRow.mutate({ tableId });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!tableData) {
    return <div className="p-4 text-center text-red-500">Table not found</div>;
  }

  const hasNoData = table.getRowModel().rows.length === 0;

  return (
    <div className="relative overflow-hidden">
      <div className="overflow-x-auto border-b border-gray-200">
        <table
          ref={tableRef}
          className="min-w-full divide-y divide-gray-200 border-collapse table-fixed"
          style={{
            width: `${Math.max(tableData.columns.length * 150, 800)}px`,
          }}
        >
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              {table.getHeaderGroups()[0]?.headers.map((header) => (
                <th
                  key={header.id}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 last:border-r-0"
                  style={{ width: "150px" }}
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {hasNoData ? (
              <tr>
                <td
                  colSpan={tableData.columns.length}
                  className="px-4 py-8 text-center text-gray-500"
                >
                  No records. Click "Add record" to add data.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="p-0 border-r border-gray-200 last:border-r-0"
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add row button */}
      <div className="bg-gray-50 py-3 px-4 border-b border-gray-200">
        <button
          onClick={handleAddRow}
          className="text-gray-500 hover:text-gray-700 text-sm hover:bg-gray-100 py-1 px-2 rounded"
        >
          + Add record
        </button>
      </div>
    </div>
  );
}
