import {
  redirectToAnalyticsRoute,
  type RouteSearchParams,
} from "../redirect";

export default async function InsightsHourlyRoute({
  searchParams,
}: {
  searchParams: Promise<RouteSearchParams>;
}) {
  redirectToAnalyticsRoute("/analytics/hourly", await searchParams);
}
