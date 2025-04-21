"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "~/trpc/react";
import { VirtualizedDataTable } from "~/components/VirtualizedDataTable";

export default function BaseDetailPage() {
  const params = useParams<{ id: string }>();
  const [activeTableId, setActiveTableId] = useState<string | null>(null);
  const [isCreatingTable, setIsCreatingTable] = useState(false);
  const [newTableName, setNewTableName] = useState("");
  const [newColumnName, setNewColumnName] = useState("");
  const [selectedColumnType, setSelectedColumnType] = useState<
    "text" | "number"
  >("text");

  // Fetch base and its tables
  const { data: base, isLoading } = api.base.getById.useQuery({
    id: params.id,
  });

  // Set the active table to the first table if not already set
  if (base && base.tables.length > 0 && !activeTableId) {
    const firstTableId = base.tables[0]?.id;
    if (firstTableId) {
      setActiveTableId(firstTableId);
    }
  }

  // Create a new table
  const utils = api.useUtils();
  const createTable = api.table.create.useMutation({
    onSuccess: async (data) => {
      setNewTableName("");
      setIsCreatingTable(false);
      await utils.base.getById.invalidate({ id: params.id });
      setActiveTableId(data.id);
    },
  });

  // Create a new column
  const createColumn = api.table.createColumn.useMutation({
    onSuccess: async () => {
      setNewColumnName("");
      if (activeTableId) {
        await utils.table.getById.invalidate({ id: activeTableId });
        await utils.table.getTableData.invalidate();
      }
    },
  });

  // Handle form submissions
  const handleCreateTable = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTableName.trim()) {
      createTable.mutate({
        name: newTableName,
        baseId: params.id,
      });
    }
  };

  const handleAddColumn = (e: React.FormEvent) => {
    e.preventDefault();
    if (newColumnName.trim() && activeTableId) {
      createColumn.mutate({
        name: newColumnName,
        type: selectedColumnType,
        tableId: activeTableId,
      });
    }
  };

  if (isLoading) {
    return <div className="container mx-auto p-6">Loading base...</div>;
  }

  if (!base) {
    return (
      <div className="container mx-auto p-6">
        <div className="bg-red-50 text-red-600 p-4 rounded-md">
          Base not found
        </div>
        <Link href="/bases" className="text-blue-500 mt-4 inline-block">
          Back to Bases
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Top navigation bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Link
              href="/bases"
              className="text-gray-500 hover:text-gray-700 mr-4"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M9.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L7.414 9H15a1 1 0 110 2H7.414l2.293 2.293a1 1 0 010 1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </Link>
            <h1 className="text-xl font-bold">{base.name}</h1>
          </div>
        </div>

        {/* Table tabs navigation */}
        <div className="flex items-center mt-2 border-b border-gray-200">
          <div className="flex space-x-1 overflow-x-auto py-2 px-1">
            {base.tables.map((table) => (
              <button
                key={table.id}
                onClick={() => setActiveTableId(table.id)}
                className={`px-3 py-1 rounded-md text-sm whitespace-nowrap ${activeTableId === table.id
                    ? "bg-blue-100 text-blue-700"
                    : "text-gray-600 hover:bg-gray-100"
                  }`}
              >
                {table.name}
              </button>
            ))}

            {isCreatingTable ? (
              <form onSubmit={handleCreateTable} className="flex items-center">
                <input
                  type="text"
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value)}
                  placeholder="Table name"
                  className="border border-gray-300 rounded-md px-2 py-1 text-sm w-32"
                  autoFocus
                  onBlur={() => {
                    if (!newTableName.trim()) {
                      setIsCreatingTable(false);
                    }
                  }}
                />
                <button
                  type="submit"
                  className="ml-1 px-2 py-1 text-xs bg-blue-500 text-white rounded-md"
                >
                  Save
                </button>
              </form>
            ) : (
              <button
                onClick={() => {
                  setIsCreatingTable(true);
                  setNewTableName(`Table ${base.tables.length + 1}`);
                }}
                className="px-3 py-1 text-gray-600 hover:bg-gray-100 rounded-md text-sm whitespace-nowrap"
              >
                + New Table
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-hidden bg-gray-50">
        {activeTableId ? (
          <div className="h-full flex flex-col">
            {/* Add column form */}
            <div className="bg-white border-b border-gray-200 p-3">
              <form
                onSubmit={handleAddColumn}
                className="flex items-center space-x-2"
              >
                <input
                  type="text"
                  value={newColumnName}
                  onChange={(e) => setNewColumnName(e.target.value)}
                  placeholder="New field"
                  className="border border-gray-300 rounded-md px-3 py-1 text-sm"
                />
                <select
                  value={selectedColumnType}
                  onChange={(e) =>
                    setSelectedColumnType(e.target.value as "text" | "number")
                  }
                  className="border border-gray-300 rounded-md px-2 py-1 text-sm"
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                </select>
                <button
                  type="submit"
                  disabled={createColumn.isPending}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-md text-sm"
                >
                  {createColumn.isPending ? "Adding..." : "Add Field"}
                </button>
              </form>
            </div>

            {/* Virtual table */}
            <div className="flex-1 overflow-hidden h-full">
              <VirtualizedDataTable tableId={activeTableId} />
            </div>
          </div>
        ) : (
          <div className="text-center text-gray-500 mt-20">
            No tables available. Click "New Table" to create one.
          </div>
        )}
      </div>
    </div>
  );
}
