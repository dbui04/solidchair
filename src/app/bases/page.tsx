"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "~/trpc/react";

export default function BasesPage() {
  const [newBaseName, setNewBaseName] = useState("");

  // Fetch all bases
  const { data: bases, isLoading } = api.base.getAll.useQuery();

  // Create a new base
  const utils = api.useUtils();
  const createBase = api.base.create.useMutation({
    onSuccess: async () => {
      setNewBaseName("");
      await utils.base.getAll.invalidate();
    },
  });

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newBaseName.trim()) {
      createBase.mutate({ name: newBaseName });
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8">Your Bases</h1>

      {/* Create base form */}
      <form
        onSubmit={handleSubmit}
        className="mb-8 bg-white p-4 rounded-md shadow-sm"
      >
        <h2 className="text-xl font-semibold mb-4">Create New Base</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={newBaseName}
            onChange={(e) => setNewBaseName(e.target.value)}
            placeholder="Base name"
            className="flex-1 border border-gray-300 rounded-md px-3 py-2"
            required
          />
          <button
            type="submit"
            disabled={createBase.isPending}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md"
          >
            {createBase.isPending ? "Creating..." : "Create"}
          </button>
        </div>
      </form>

      {/* Bases list */}
      <div className="bg-white rounded-md shadow-sm p-4">
        <h2 className="text-xl font-semibold mb-4">Your Bases</h2>

        {isLoading ? (
          <p>Loading bases...</p>
        ) : bases?.length === 0 ? (
          <p className="text-gray-500">
            No bases yet. Create your first one above!
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bases?.map((base) => (
              <Link
                key={base.id}
                href={`/bases/${base.id}`}
                className="block border border-gray-200 rounded-md p-4 hover:border-blue-300 hover:bg-blue-50 transition-colors"
              >
                <h3 className="font-medium text-lg">{base.name}</h3>
                <p className="text-gray-500 text-sm">
                  Created: {new Date(base.createdAt).toLocaleDateString()}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
