import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

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
