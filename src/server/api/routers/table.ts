import { z } from "zod";
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
});
