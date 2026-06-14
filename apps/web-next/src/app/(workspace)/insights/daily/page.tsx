import {
  redirectToAnalyticsRoute,
  type RouteSearchParams,
} from "../redirect";

export default async function InsightsDailyRoute({
  searchParams,
}: {
  searchParams: Promise<RouteSearchParams>;
}) {
  redirectToAnalyticsRoute("/analytics/daily", await searchParams);
}
