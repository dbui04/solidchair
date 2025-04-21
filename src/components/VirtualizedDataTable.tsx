"use client";

import { useRef, useState, useEffect, memo, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { api } from "~/trpc/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useDebounce } from "~/hooks/useDebounce";

// Memoized table cell component with strict equality check
const TableCell = memo(
  ({
    rowId,
    columnId,
    value,
    columnType,
    onCellClick,
  }: {
    rowId: string;
    columnId: string;
    value: string;
    columnType: string;
    onCellClick: (
      rowId: string,
      columnId: string,
      cellId: string,
      value: string,
    ) => void;
  }) => {
    // Format display value based on column type
    let displayValue = value;
    if (columnType === "number" && value) {
      const numValue = parseFloat(value);
      if (!isNaN(numValue)) {
        displayValue = numValue.toLocaleString();
      }
    }

    // Memoize the click handler to prevent recreation on each render
    const handleClick = useCallback(() => {
      onCellClick(rowId, columnId, value, value);
    }, [rowId, columnId, value, onCellClick]);

    return (
      <div
        data-row-id={rowId}
        data-column-id={columnId}
        className={`h-full w-full px-3 py-2 cursor-pointer min-h-[36px] hover:bg-gray-50 truncate ${
          columnType === "number" ? "text-right" : ""
        }`}
        onClick={handleClick}
      >
        {displayValue}
      </div>
    );
  },
  // Custom comparison function to prevent unnecessary re-renders
  (prevProps, nextProps) => {
    return (
      prevProps.rowId === nextProps.rowId &&
      prevProps.columnId === nextProps.columnId &&
      prevProps.value === nextProps.value &&
      prevProps.columnType === nextProps.columnType
    );
  },
);

TableCell.displayName = "TableCell";

export function VirtualizedDataTable({ tableId }: { tableId: string }) {
  const COLUMN_WIDTH = 200;
  const [editingCell, setEditingCell] = useState<{
    rowId: string;
    columnId: string;
    cellId: string;
    value: string;
  } | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterColumn, setFilterColumn] = useState<string | null>(null);
  const [sorting, setSorting] = useState<{
    columnId: string;
    direction: "asc" | "desc";
  } | null>(null);
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Parent container refs for virtualization
  const parentRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Infinite query for table data
  const {
    data: infiniteData,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isLoading,
    refetch,
  } = api.table.getTableData.useInfiniteQuery(
    {
      tableId,
      limit: 50,
      filters:
        filterColumn && debouncedSearchTerm
          ? {
              columnId: filterColumn,
              query: debouncedSearchTerm,
            }
          : undefined,
      sorting: sorting || undefined,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      refetchOnWindowFocus: false,
      retry: 1,
      // Add stale time to prevent unnecessary refetches
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  );

  // Get flattened data from infinite query
  const flatData = infiniteData
    ? infiniteData.pages.flatMap((page) => page.rows)
    : [];

  const columns = infiniteData?.pages[0]?.columns || [];

  // Improve virtual list configuration
  const rowVirtualizer = useVirtualizer({
    count: hasNextPage ? flatData.length + 1 : flatData.length,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback(() => 36, []), // Memoized constant size for better performance
    overscan: 5, // Reduced overscan to improve memory usage
    scrollMargin: 0,
    // Add measured sizes for more accurate virtualization
    measureElement: useCallback((element: Element | null) => {
      return element?.getBoundingClientRect().height || 36;
    }, []),
    // Set initial offset to 0 to ensure we start at the top
    initialOffset: 0,
  });

  const createRow = api.table.createRow.useMutation({
    onSuccess: async () => {
      await utils.table.getTableData.invalidate();
    },
  });

  const handleAddRow = () => {
    createRow.mutate({ tableId });
  };

  // Update cell mutation with optimistic updates
  const utils = api.useUtils();
  const updateCell = api.table.updateCell.useMutation({
    // Optimistic update for better UX
    onMutate: async (newCell) => {
      // Cancel any outgoing refetches
      await utils.table.getTableData.cancel();

      // Get the previous data
      const previousData = utils.table.getTableData.getInfiniteData({
        tableId,
        limit: 50,
        filters:
          filterColumn && debouncedSearchTerm
            ? { columnId: filterColumn, query: debouncedSearchTerm }
            : undefined,
        sorting: sorting || undefined,
      });

      // Optimistically update the cell
      utils.table.getTableData.setInfiniteData(
        {
          tableId,
          limit: 50,
          filters:
            filterColumn && debouncedSearchTerm
              ? { columnId: filterColumn, query: debouncedSearchTerm }
              : undefined,
          sorting: sorting || undefined,
        },
        (old) => {
          if (!old) return { pages: [], pageParams: [] };

          // Deep clone the data to avoid mutating the cache
          const newPages = old.pages.map((page) => ({
            ...page,
            rows: page.rows.map((row) => ({
              ...row,
              cells: row.cells.map((cell) =>
                cell.id === newCell.id
                  ? { ...cell, value: newCell.value }
                  : cell,
              ),
            })),
          }));

          return {
            ...old,
            pages: newPages,
          };
        },
      );

      // Return previous data to use in case of rollback
      return { previousData };
    },
    onError: (err, newCell, context) => {
      // Rollback on error
      if (context?.previousData) {
        utils.table.getTableData.setInfiniteData(
          {
            tableId,
            limit: 50,
            filters:
              filterColumn && debouncedSearchTerm
                ? { columnId: filterColumn, query: debouncedSearchTerm }
                : undefined,
            sorting: sorting || undefined,
          },
          context.previousData,
        );
      }
      toast.error(`Failed to update: ${err.message}`);
    },
    // Only invalidate after the mutation completes if needed
    onSettled: async () => {
      // We can skip invalidation since we've already updated optimistically
      // This helps maintain scroll position and UI state
      // Only invalidate if we need fresh data
      // await utils.table.getTableData.invalidate();
    },
  });

  // Bulk row generation mutation
  const bulkRowsMutation = api.table.createBulkRows.useMutation({
    onSuccess: () => {
      void utils.table.getTableData.invalidate();
    },
  });

  const generateRows = (count: number) => {
    const loadingToast = toast.loading(`Generating ${count} rows...`);

    bulkRowsMutation.mutate(
      { tableId, count },
      {
        onSuccess: () => {
          toast.success(`Added ${count} rows successfully!`, {
            id: loadingToast,
          });
        },
        onError: (error) => {
          toast.error(`Error adding rows: ${error.message}`, {
            id: loadingToast,
          });
        },
      },
    );
  };

  // Handle column sorting
  const handleSortColumn = (columnId: string) => {
    if (sorting?.columnId === columnId) {
      // Toggle direction or clear sorting
      if (sorting.direction === "asc") {
        setSorting({ columnId, direction: "desc" });
      } else {
        setSorting(null);
      }
    } else {
      // New column sort, start with ascending
      setSorting({ columnId, direction: "asc" });
    }
  };

  // Handle cell click for editing
  const handleCellClick = (
    rowId: string,
    columnId: string,
    cellId: string,
    value: string,
  ) => {
    setEditingCell({
      rowId,
      columnId,
      cellId,
      value: value || "",
    });
  };

  // Handle keyboard navigation between cells
  const handleKeyNavigation = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    colIndex: number,
  ) => {
    if (
      ![
        "Tab",
        "Enter",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
      ].includes(e.key)
    ) {
      return;
    }

    e.preventDefault(); // Prevent default for these keys

    if (e.key === "Enter" || e.key === "Tab") {
      // Handle cell save first
      if (editingCell && editingCell.cellId) {
        const cell = flatData[rowIndex]?.cells.find(
          (c) => c.columnId === editingCell.columnId,
        );
        if (cell) {
          updateCell.mutate({
            id: cell.id,
            value: editingCell.value,
          });
        }
      }

      // Calculate next position
      let nextRow = rowIndex;
      let nextCol = colIndex;

      if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
        // Move down on Enter, or right on Tab
        if (e.key === "Tab") {
          nextCol = colIndex + 1;
          if (nextCol >= columns.length) {
            nextCol = 0;
            nextRow = rowIndex + 1;
          }
        } else {
          nextRow = rowIndex + 1;
        }
      } else if (e.key === "Tab" && e.shiftKey) {
        // Move left on Shift+Tab
        nextCol = colIndex - 1;
        if (nextCol < 0) {
          nextCol = columns.length - 1;
          nextRow = rowIndex - 1;
        }
      }

      // Ensure we have a valid row
      if (nextRow < 0) nextRow = 0;
      if (nextRow >= flatData.length) {
        // If at the end and we have more data, fetch it
        if (hasNextPage && !isFetching) {
          void fetchNextPage();
        }
        nextRow = flatData.length - 1;
      }

      const nextRowData = flatData[nextRow];
      if (!nextRowData) return;

      const nextColumn = columns[nextCol];
      if (!nextColumn) return;

      const nextCell = nextRowData.cells.find(
        (c) => c.columnId === nextColumn.id,
      );
      if (!nextCell) return;

      // Ensure the next cell is visible by scrolling to it
      if (parentRef.current) {
        const rowHeight = 36; // Match row height
        const visibleStart = parentRef.current.scrollTop;
        const visibleEnd = visibleStart + parentRef.current.clientHeight;
        const nextRowPosition = nextRow * rowHeight;

        if (nextRowPosition < visibleStart) {
          parentRef.current.scrollTop = nextRowPosition;
        } else if (nextRowPosition + rowHeight > visibleEnd) {
          parentRef.current.scrollTop =
            nextRowPosition - parentRef.current.clientHeight + rowHeight;
        }
      }

      // Set focus on the next cell
      setEditingCell({
        rowId: nextRowData.id,
        columnId: nextColumn.id,
        cellId: nextCell.id,
        value: nextCell.value || "",
      });
    } else if (e.key.startsWith("Arrow")) {
      // Handle arrow key navigation
      let nextRow = rowIndex;
      let nextCol = colIndex;

      switch (e.key) {
        case "ArrowUp":
          nextRow = Math.max(0, rowIndex - 1);
          break;
        case "ArrowDown":
          nextRow = Math.min(flatData.length - 1, rowIndex + 1);
          break;
        case "ArrowLeft":
          nextCol = Math.max(0, colIndex - 1);
          break;
        case "ArrowRight":
          nextCol = Math.min(columns.length - 1, colIndex + 1);
          break;
      }

      const nextRowData = flatData[nextRow];
      if (!nextRowData) return;

      const nextColumn = columns[nextCol];
      if (!nextColumn) return;

      const nextCell = nextRowData.cells.find(
        (c) => c.columnId === nextColumn.id,
      );
      if (!nextCell) return;

      // Set focus on the next cell
      setEditingCell({
        rowId: nextRowData.id,
        columnId: nextColumn.id,
        cellId: nextCell.id,
        value: nextCell.value || "",
      });
    }
  };

  // Handle infinite scrolling
  useEffect(() => {
    const scrollElement = parentRef.current;
    if (!scrollElement) return;

    const handleScroll = () => {
      if (!hasNextPage || isFetching) return;

      const { scrollHeight, scrollTop, clientHeight } = scrollElement;
      // Load more data when we're 300px from the bottom
      const bottomThreshold = 300;

      if (scrollHeight - scrollTop - clientHeight < bottomThreshold) {
        void fetchNextPage();
      }
    };

    scrollElement.addEventListener("scroll", handleScroll);
    return () => scrollElement.removeEventListener("scroll", handleScroll);
  }, [fetchNextPage, hasNextPage, isFetching]);

  // Reset cursor and refetch when search/filter/sort changes
  useEffect(() => {
    refetch();
  }, [sorting, debouncedSearchTerm, filterColumn, refetch]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!columns.length) {
    return (
      <div className="p-4 text-center text-red-500">
        No columns defined for this table
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search and filter controls */}
      <div className="flex items-center gap-2 p-2 bg-white border-b border-gray-200">
        <input
          type="text"
          placeholder="Search..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="px-3 py-1 border border-gray-300 rounded-md text-sm w-64"
        />
        <select
          value={filterColumn || ""}
          onChange={(e) => setFilterColumn(e.target.value || null)}
          className="px-3 py-1 border border-gray-300 rounded-md text-sm"
        >
          <option value="">All columns</option>
          {columns.map((column) => (
            <option key={column.id} value={column.id}>
              {column.name}
            </option>
          ))}
        </select>
        {isFetching && <div className="text-sm text-gray-500">Loading...</div>}
      </div>

      {/* Table with virtualization */}
      <div
        ref={parentRef}
        className="flex-1 overflow-auto w-full h-full"
        style={{
          height: "calc(100vh - 240px)",
          position: "relative",
        }}
      >
        <div
          ref={tableContainerRef}
          className="absolute top-0 left-0 w-full h-full"
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: `${Math.max(columns.length * COLUMN_WIDTH, 800)}px`,
          }}
        >
          {/* Header row (sticky) */}
          <div
            className="sticky top-0 z-10 flex bg-gray-50 border-b border-gray-200"
            style={{
              position: "sticky",
              top: 0,
              left: 0,
              height: "36px",
              width: "100%",
              overflow: "hidden",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            }}
          >
            {columns.map((column) => (
              <div
                key={column.id}
                className="flex-none border-r border-gray-200 last:border-r-0"
                style={{ width: `${COLUMN_WIDTH}px` }}
              >
                <div
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer truncate flex items-center justify-between"
                  onClick={() => handleSortColumn(column.id)}
                >
                  <span>{column.name}</span>
                  <span>
                    {sorting?.columnId === column.id && (
                      <span className="ml-1">
                        {sorting.direction === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Virtualized rows */}
          {rowVirtualizer.getVirtualItems().map((virtualRow, virtualIndex) => {
            const isLoaderRow = virtualRow.index >= flatData.length;

            if (isLoaderRow) {
              return (
                <div
                  key={`loader-${virtualIndex}`}
                  className="absolute top-0 left-0 flex items-center border-b border-gray-200 bg-gray-50"
                  style={{
                    transform: `translateY(${virtualRow.start}px)`,
                    width: "100%",
                    height: `${virtualRow.size}px`,
                  }}
                >
                  <div className="w-full text-center text-gray-500">
                    {isFetching ? "Loading more rows..." : ""}
                  </div>
                </div>
              );
            }

            const row = flatData[virtualRow.index];
            if (!row) return null;

            return (
              <div
                key={`row-${row.id}-${virtualIndex}`}
                className="absolute top-0 left-0 flex border-b border-gray-200 hover:bg-gray-50"
                style={{
                  transform: `translateY(${virtualRow.start + 36}px)`, // Add header height offset
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  display: "flex" /* Ensure flex display */,
                  flexDirection: "row",
                }}
                data-index={virtualRow.index}
              >
                {columns.map((column, colIndex) => {
                  const cell = row.cells.find((c) => c.columnId === column.id);
                  const cellId =
                    cell?.id || `${row.id}-${column.id}-${colIndex}`;

                  return (
                    <div
                      key={`cell-${cellId}-${colIndex}`}
                      className="flex-none border-r border-gray-200 last:border-r-0 overflow-hidden"
                      style={{
                        width: `${COLUMN_WIDTH}px`,
                        minWidth: `${COLUMN_WIDTH}px`,
                        maxWidth: `${COLUMN_WIDTH}px`,
                      }}
                    >
                      {editingCell?.rowId === row.id &&
                      editingCell?.columnId === column.id ? (
                        <input
                          autoFocus
                          className="w-full h-full px-3 py-2 border-none focus:outline-none bg-blue-50"
                          value={editingCell.value}
                          type={column.type === "number" ? "number" : "text"}
                          onChange={(e) =>
                            setEditingCell({
                              ...editingCell,
                              value: e.target.value,
                            })
                          }
                          onBlur={() => {
                            if (cell) {
                              updateCell.mutate({
                                id: cell.id,
                                value: editingCell.value,
                              });
                            }
                            setEditingCell(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              if (cell) {
                                updateCell.mutate({
                                  id: cell.id,
                                  value: editingCell.value,
                                });
                              }
                              setEditingCell(null);
                            } else if (e.key === "Escape") {
                              setEditingCell(null);
                            } else {
                              handleKeyNavigation(
                                e,
                                virtualRow.index,
                                colIndex,
                              );
                            }
                          }}
                        />
                      ) : (
                        <TableCell
                          rowId={row.id}
                          columnId={column.id}
                          value={cell?.value || ""}
                          columnType={column.type}
                          onCellClick={() => {
                            if (cell) {
                              handleCellClick(
                                row.id,
                                column.id,
                                cell.id,
                                cell.value || "",
                              );
                            }
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Data generation buttons */}
      <div className="bg-gray-50 py-3 px-4 border-t border-gray-200 flex items-center gap-2">
        <button
          onClick={handleAddRow}
          className="text-gray-500 hover:text-gray-700 text-sm hover:bg-gray-100 py-1 px-2 rounded"
        >
          + Add record
        </button>

        <button
          onClick={() => generateRows(100)}
          className="text-gray-500 hover:text-gray-700 text-sm hover:bg-gray-100 py-1 px-2 rounded"
        >
          + Add 100 rows
        </button>

        <button
          onClick={() => generateRows(1000)}
          className="text-gray-500 hover:text-gray-700 text-sm hover:bg-gray-100 py-1 px-2 rounded"
        >
          + Add 1,000 rows
        </button>

        <button
          onClick={() => generateRows(10000)}
          className="text-blue-500 hover:text-blue-700 text-sm hover:bg-blue-100 py-1 px-2 rounded ml-2"
        >
          + Add 10,000 rows
        </button>

        <button
          onClick={() => generateRows(100000)}
          className="bg-blue-500 hover:bg-blue-600 text-white text-sm py-1 px-2 rounded-md ml-2"
        >
          + Add 100k rows
        </button>

        {infiniteData && infiniteData.pages.length > 0 && (
          <div className="ml-auto text-sm text-gray-500">
            {flatData.length} of {infiniteData.pages[0]?.totalCount ?? "?"} rows
          </div>
        )}
      </div>
    </div>
  );
}
