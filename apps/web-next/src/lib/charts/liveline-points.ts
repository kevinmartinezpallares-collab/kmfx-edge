import type { LivelinePoint } from "liveline";

type WindowOptions = {
  minSecs?: number;
  padRatio?: number;
  maxPadSecs?: number;
};

export function normalizeLivelinePoints(
  points: LivelinePoint[],
  minStepSecs = 1,
): LivelinePoint[] {
  const sorted = points
    .filter(
      (point) =>
        Number.isFinite(point.time) && Number.isFinite(point.value),
    )
    .map((point) => ({
      time: Math.floor(point.time),
      value: point.value,
    }))
    .sort((left, right) => left.time - right.time);

  const normalized: LivelinePoint[] = [];

  for (const point of sorted) {
    const previous = normalized.at(-1);

    if (!previous) {
      normalized.push(point);
      continue;
    }

    if (point.time === previous.time) {
      previous.value = point.value;
      continue;
    }

    if (point.time - previous.time < minStepSecs) {
      normalized.push({
        time: previous.time + minStepSecs,
        value: point.value,
      });
      continue;
    }

    normalized.push(point);
  }

  return normalized;
}

export function livelineWindowForData(
  points: LivelinePoint[],
  requestedWindowSecs: number,
  {
    minSecs = 3_600,
    padRatio = 0.1,
    maxPadSecs = 86_400,
  }: WindowOptions = {},
): number {
  if (points.length < 2) return requestedWindowSecs;

  const first = points[0]?.time;
  const last = points.at(-1)?.time;
  if (!first || !last || last <= first) return requestedWindowSecs;

  const span = last - first;
  const pad = Math.min(maxPadSecs, Math.max(60, Math.ceil(span * padRatio)));
  const fittedWindow = Math.max(minSecs, span + pad);

  return Math.min(requestedWindowSecs, fittedWindow);
}
