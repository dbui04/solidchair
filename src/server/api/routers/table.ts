import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const tableRouter = createTRPCRouter({
  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        baseId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const table = await ctx.db.table.create({
        data: {
          name: input.name,
          baseId: input.baseId,
        },
      });

      await ctx.db.column.createMany({
        data: [
          { name: "Title", type: "text", order: 0, tableId: table.id },
          { name: "Number", type: "number", order: 1, tableId: table.id },
        ],
      });

      return table;
    }),

  getByBaseId: publicProcedure
    .input(z.object({ baseId: z.string() }))
    .query(({ ctx, input }) => {
      return ctx.db.table.findMany({
        where: { baseId: input.baseId },
        orderBy: { createdAt: "desc" },
      });
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      // Get the table with columns
      const table = await ctx.db.table.findUnique({
        where: { id: input.id },
        include: {
          columns: {
            orderBy: { order: "asc" },
          },
        },
      });

      if (!table) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Table not found",
        });
      }

      // Get the rows with cells
      const rows = await ctx.db.row.findMany({
        where: { tableId: input.id },
        include: {
          cells: {
            include: {
              column: true,
            },
          },
        },
        take: 100, // Limit to 100 rows initially
      });

      return {
        ...table,
        rows,
      };
    }),

  getTableData: publicProcedure
    .input(
      z.object({
        tableId: z.string(),
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(100).default(50),
        filters: z
          .object({
            columnId: z.string().optional(),
            query: z.string().optional(),
          })
          .optional(),
        sorting: z
          .object({
            columnId: z.string(),
            direction: z.enum(["asc", "desc"]),
          })
          .optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { tableId, cursor, limit, filters, sorting } = input;

      // Get columns for this table
      const columns = await ctx.db.column.findMany({
        where: { tableId },
        orderBy: { order: "asc" },
      });

      // Always calculate totalRowsCount to fix the row count display issue
      const totalRowsCount = await ctx.db.row.count({
        where: { tableId },
      });

      // Prepare standard query parameters
      const skip = cursor || 0;
      const take = limit + 1; // Take one extra to check if there are more

      // Handle sorting case differently for better performance
      if (sorting) {
        // Query using a join approach for better performance with sorting
        // Get the rows with the specific cells we need for sorting
        const rowsWithSortingCells = await ctx.db.$queryRaw<
          Array<{ id: string; rowId: string; value: string }>
        >`
  SELECT c.id, c."rowId", c.value
  FROM "Cell" c
  JOIN "Row" r ON c."rowId" = r.id
  WHERE c."columnId" = ${sorting.columnId}
    AND r."tableId" = ${tableId}
  ORDER BY c.value ${sorting.direction === "asc" ? "ASC" : "DESC"}
  LIMIT ${take} OFFSET ${skip}
`;

        if (rowsWithSortingCells.length === 0) {
          return {
            rows: [],
            columns,
            nextCursor: null,
            totalCount: totalRowsCount,
          };
        }

        // Extract row IDs in the correct sort order
        const rowIds = rowsWithSortingCells.map((row) => row.rowId);

        // Fetch the complete rows with all their cells
        const rows = await ctx.db.row.findMany({
          where: {
            id: { in: rowIds },
          },
          include: {
            cells: {
              include: {
                column: true,
              },
            },
          },
        });

        // Sort rows to match the order from the sorting query
        rows.sort((a, b) => {
          return rowIds.indexOf(a.id) - rowIds.indexOf(b.id);
        });

        // Check if there's a next page
        const hasMore = rows.length > limit;
        if (hasMore) rows.pop();

        return {
          rows,
          columns,
          nextCursor: hasMore ? (cursor || 0) + limit : null,
          totalCount: totalRowsCount,
        };
      }
      // Handle filtering separately
      else if (filters?.columnId && filters.query) {
        // Use more efficient direct query with filtering
        const filteredRows = await ctx.db.row.findMany({
          where: {
            tableId,
            cells: {
              some: {
                columnId: filters.columnId,
                value: { contains: filters.query, mode: "insensitive" },
              },
            },
          },
          take,
          skip,
          orderBy: { id: "asc" },
          include: {
            cells: {
              include: {
                column: true,
              },
            },
          },
        });

        // Check if there's a next page
        const hasMore = filteredRows.length > limit;
        if (hasMore) filteredRows.pop();

        return {
          rows: filteredRows,
          columns,
          nextCursor: hasMore ? (cursor || 0) + limit : null,
          totalCount: totalRowsCount,
        };
      }
      // Base case - no sorting or filtering
      else {
        // Simple query for rows
        const rows = await ctx.db.row.findMany({
          where: { tableId },
          take,
          skip,
          orderBy: { id: "asc" },
          include: {
            cells: {
              include: {
                column: true,
              },
            },
          },
        });

        // Check if there's a next page
        const hasMore = rows.length > limit;
        if (hasMore) rows.pop();

        return {
          rows,
          columns,
          nextCursor: hasMore ? (cursor || 0) + limit : null,
          totalCount: totalRowsCount,
        };
      }
    }),

  updateCell: publicProcedure
    .input(
      z.object({
        id: z.string(),
        value: z.string(),
      }),
    )
    .mutation(({ ctx, input }) => {
      return ctx.db.cell.update({
        where: { id: input.id },
        data: { value: input.value },
      });
    }),

  createRow: publicProcedure
    .input(
      z.object({
        tableId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Create the row
      const row = await ctx.db.row.create({
        data: {
          tableId: input.tableId,
        },
      });

      // Get all columns for this table
      const columns = await ctx.db.column.findMany({
        where: { tableId: input.tableId },
      });

      // Create empty cells for each column
      if (columns.length > 0) {
        await ctx.db.cell.createMany({
          data: columns.map((column) => ({
            value: "",
            rowId: row.id,
            columnId: column.id,
          })),
        });
      }

      return row;
    }),

  createBulkRows: publicProcedure
    .input(
      z.object({
        tableId: z.string(),
        count: z.number().min(1).max(100000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Get all columns for this table
      const columns = await ctx.db.column.findMany({
        where: { tableId: input.tableId },
      });

      // Import the faker utility
      const { generateCellValue } = await import("~/utils/faker");

      // Create rows in batches to avoid timeouts
      const batchSize = 1000;
      const batches = Math.ceil(input.count / batchSize);

      let createdCount = 0;

      for (let i = 0; i < batches; i++) {
        const currentBatchSize = Math.min(
          batchSize,
          input.count - createdCount,
        );

        // Create array of row objects
        const rowsToCreate = Array.from({ length: currentBatchSize }).map(
          () => ({
            tableId: input.tableId,
          }),
        );

        // Create rows in a batch
        const createdRows = await ctx.db.row.createMany({
          data: rowsToCreate,
          skipDuplicates: true,
        });

        // Get the created row IDs
        const newRows = await ctx.db.row.findMany({
          where: { tableId: input.tableId },
          orderBy: { id: "desc" },
          take: currentBatchSize,
        });

        // Create cells for each row
        for (const row of newRows) {
          const cellsToCreate = columns.map((column) => ({
            rowId: row.id,
            columnId: column.id,
            value: generateCellValue(column.type, column.name),
          }));

          await ctx.db.cell.createMany({
            data: cellsToCreate,
            skipDuplicates: true,
          });
        }

        createdCount += currentBatchSize;
      }

      return { count: createdCount };
    }),

  createColumn: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        type: z.enum(["text", "number"]),
        tableId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Count existing columns to determine order
      const columnCount = await ctx.db.column.count({
        where: { tableId: input.tableId },
      });

      // Create the column
      const column = await ctx.db.column.create({
        data: {
          name: input.name,
          type: input.type,
          order: columnCount,
          tableId: input.tableId,
        },
      });

      // Create cells for this column for all existing rows
      const rows = await ctx.db.row.findMany({
        where: { tableId: input.tableId },
      });

      if (rows.length > 0) {
        await ctx.db.cell.createMany({
          data: rows.map((row) => ({
            value: "",
            rowId: row.id,
            columnId: column.id,
          })),
        });
      }

      return column;
    }),
});
