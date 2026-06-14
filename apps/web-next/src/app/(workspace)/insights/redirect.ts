import { redirect } from "next/navigation";

export type RouteSearchParams = Record<string, string | string[] | undefined>;

export function redirectToAnalyticsRoute(target: string, searchParams?: RouteSearchParams) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined) params.append(key, item);
      }
      continue;
    }

    if (value !== undefined) params.set(key, value);
  }

  const query = params.toString();

  redirect(query ? `${target}?${query}` : target);
}
