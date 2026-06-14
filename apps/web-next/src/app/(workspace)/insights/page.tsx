import {
  redirectToAnalyticsRoute,
  type RouteSearchParams,
} from "./redirect";

export default async function InsightsRoute({
  searchParams,
}: {
  searchParams: Promise<RouteSearchParams>;
}) {
  redirectToAnalyticsRoute("/analytics", await searchParams);
}
