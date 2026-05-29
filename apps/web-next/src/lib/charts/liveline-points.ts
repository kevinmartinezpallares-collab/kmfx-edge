import type { LivelinePoint } from "liveline";

type WindowOptions = {
  minSecs?: number;
  padRatio?: number;
  maxPadSecs?: number;
};

type SmoothOptions = {
  radius?: number;
  minPoints?: number;
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

export function smoothLivelinePoints(
  points: LivelinePoint[],
  { radius = 3, minPoints = 16 }: SmoothOptions = {},
): LivelinePoint[] {
  if (points.length < minPoints || radius <= 0) return points;

  return points.map((point, index) => {
    if (index === 0 || index === points.length - 1) return point;

    const from = Math.max(0, index - radius);
    const to = Math.min(points.length - 1, index + radius);
    let weightedSum = 0;
    let weightTotal = 0;

    for (let itemIndex = from; itemIndex <= to; itemIndex += 1) {
      const distance = Math.abs(itemIndex - index);
      const weight = radius + 1 - distance;
      weightedSum += points[itemIndex].value * weight;
      weightTotal += weight;
    }

    return {
      time: point.time,
      value: weightTotal > 0 ? weightedSum / weightTotal : point.value,
    };
  });
}
