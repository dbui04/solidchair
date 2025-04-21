import {
	QueryClient,
	defaultShouldDehydrateQuery,
} from "@tanstack/react-query";
import SuperJSON from "superjson";

export function getQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				// Don't refetch on window focus by default
				refetchOnWindowFocus: false,
				// Retry failed queries with exponential backoff
				retry: (failureCount, error: any) => {
					// Don't retry on 404 errors
					if (error.data?.httpStatus === 404) return false;

					// Retry up to 3 times for server errors
					return failureCount < 3;
				},
				retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
				// Stale time for data to reduce unnecessary refetches
				staleTime: 1000 * 60, // 1 minute
				// Cache time for all query data - longer helps with back navigation
				gcTime: 1000 * 60 * 10, // 10 minutes
			},
			mutations: {
				// Retry failed mutations once
				retry: 1,
				// Delay between retries
				retryDelay: 1000,
			},
			dehydrate: {
				serializeData: SuperJSON.serialize,
				shouldDehydrateQuery: (query) =>
					defaultShouldDehydrateQuery(query) ||
					query.state.status === "pending",
			},
			hydrate: {
				deserializeData: SuperJSON.deserialize,
			},
		},
	});
}
