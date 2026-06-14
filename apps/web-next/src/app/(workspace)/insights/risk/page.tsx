import {
  redirectToAnalyticsRoute,
  type RouteSearchParams,
} from "../redirect";

export default async function InsightsRiskRoute({
  searchParams,
}: {
  searchParams: Promise<RouteSearchParams>;
}) {
  redirectToAnalyticsRoute("/analytics/risk", await searchParams);
}
