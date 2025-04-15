import { baseRouter } from "~/server/api/routers/base";
import { tableRouter } from "~/server/api/routers/table";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

export const appRouter = createTRPCRouter({
  base: baseRouter,
  table: tableRouter,
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
