"use client";

import { useState, useRef, useEffect, memo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from "@tanstack/react-table";
import { api } from "~/trpc/react";

// Memoized TableCell component to prevent unnecessary re-renders
const TableCell = memo(
  ({
    row,
    column,
    cellValue,
    cellData,
    columnInfo,
    isEditing,
    editingCell,
    setEditingCell,
    updateCell,
  }: {
    row: any;
    column: any;
    cellValue: any;
    cellData: any;
    columnInfo: any;
    isEditing: boolean;
    editingCell: any;
    setEditingCell: (cell: any) => void;
    updateCell: any;
  }) => {
    let displayValue = cellValue;
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
            if (e.key === "Enter") {
              e.preventDefault();
              updateCell.mutate({
                id: editingCell.cellId,
                value: editingCell.value,
              });
              setEditingCell(null);
            } else if (e.key === "Tab") {
              e.preventDefault();
              updateCell.mutate({
                id: editingCell.cellId,
                value: editingCell.value,
              });
              setEditingCell(null);
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
);

// Add display name for React DevTools
TableCell.displayName = "TableCell";

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

        const columnInfo = tableData?.columns.find(
          (col) => col.id === column.id,
        );

        return (
          <TableCell
            row={row}
            column={column}
            cellValue={cellValue}
            cellData={cellData}
            columnInfo={columnInfo}
            isEditing={isEditing}
            editingCell={editingCell}
            setEditingCell={setEditingCell}
            updateCell={updateCell}
          />
        );
      },
    })) || [];

  // Setup table instance
  const table = useReactTable({
    data: tableData?.rows || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingCell) return; // Don't navigate while editing

      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();

        const tableElement = tableRef.current;
        if (!tableElement) return;

        // Find the active cell
        const cells = tableElement.querySelectorAll(
          "[data-row-id][data-column-id]",
        );
        if (!cells.length) return;

        // Try to find focused element or last clicked cell
        const activeElement = document.activeElement;
        let currentCell: Element | null = null;

        if (activeElement && activeElement.hasAttribute("data-row-id")) {
          currentCell = activeElement;
        } else if (cells.length > 0) {
          currentCell = cells[0] as Element | null;
        }

        if (!currentCell) return;

        const currentRowId = currentCell.getAttribute("data-row-id");
        const currentColId = currentCell.getAttribute("data-column-id");

        if (!currentRowId || !currentColId) return;

        // Find all row IDs and col IDs
        const rowIds = Array.from(
          new Set(
            Array.from(cells).map((cell) => cell.getAttribute("data-row-id")),
          ),
        ).filter(Boolean) as string[];

        const colIds = Array.from(
          new Set(
            Array.from(cells).map((cell) =>
              cell.getAttribute("data-column-id"),
            ),
          ),
        ).filter(Boolean) as string[];

        // Current positions
        const rowIndex = rowIds.indexOf(currentRowId);
        const colIndex = colIds.indexOf(currentColId);

        let targetCell: Element | null = null;

        // Calculate new position
        switch (e.key) {
          case "ArrowUp":
            if (rowIndex > 0) {
              targetCell =
                Array.from(cells).find(
                  (cell) =>
                    cell.getAttribute("data-row-id") === rowIds[rowIndex - 1] &&
                    cell.getAttribute("data-column-id") === currentColId,
                ) || null;
            }
            break;
          case "ArrowDown":
            if (rowIndex < rowIds.length - 1) {
              targetCell =
                Array.from(cells).find(
                  (cell) =>
                    cell.getAttribute("data-row-id") === rowIds[rowIndex + 1] &&
                    cell.getAttribute("data-column-id") === currentColId,
                ) || null;
            }
            break;
          case "ArrowLeft":
            if (colIndex > 0) {
              targetCell =
                Array.from(cells).find(
                  (cell) =>
                    cell.getAttribute("data-row-id") === currentRowId &&
                    cell.getAttribute("data-column-id") ===
                      colIds[colIndex - 1],
                ) || null;
            }
            break;
          case "ArrowRight":
            if (colIndex < colIds.length - 1) {
              targetCell =
                Array.from(cells).find(
                  (cell) =>
                    cell.getAttribute("data-row-id") === currentRowId &&
                    cell.getAttribute("data-column-id") ===
                      colIds[colIndex + 1],
                ) || null;
            }
            break;
        }

        if (targetCell) {
          (targetCell as HTMLElement).click();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editingCell, tableData]);

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
