import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

export const baseRouter = createTRPCRouter({
  getAll: publicProcedure.query(({ ctx }) => {
    return ctx.db.base.findMany({
      orderBy: { createdAt: "desc" },
    });
  }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => {
      return ctx.db.base.findUnique({
        where: { id: input.id },
        include: { tables: true },
      });
    }),

  create: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        const base = await ctx.db.base.create({
          data: {
            name: input.name,
          },
        });
        console.log("Base created successfully:", base.id);

        // Create a default table named "Table 1"
        const table = await ctx.db.table.create({
          data: {
            name: "Table 1",
            baseId: base.id,
          },
        });

        // Create default columns
        await ctx.db.column.createMany({
          data: [
            { name: "Name", type: "text", order: 0, tableId: table.id },
            { name: "Notes", type: "text", order: 1, tableId: table.id },
            { name: "Status", type: "text", order: 2, tableId: table.id },
          ],
        });

        return base;
      } catch (error) {
        console.error("Error creating base:", error);
        throw error;
      }
    }),
});
