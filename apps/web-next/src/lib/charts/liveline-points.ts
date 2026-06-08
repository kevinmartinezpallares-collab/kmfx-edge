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

type VisualCurveOptions = {
  bucketSecs?: number;
  maxPoints?: number;
  minPoints?: number;
  minStepSecs?: number;
};

export function normalizeLivelinePoints(
  points: LivelinePoint[],
  minStepSecs = 1,
): LivelinePoint[] {
  const sorted = points
    .flatMap((point) =>
      Number.isFinite(point.time) && Number.isFinite(point.value)
        ? [{ time: Math.floor(point.time), value: point.value }]
        : [],
    )
    .toSorted((left, right) => left.time - right.time);

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

function interpolateLivelineValue(points: LivelinePoint[], time: number) {
  if (points.length === 0) return 0;

  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return 0;
  if (time <= first.time) return first.value;
  if (time >= last.time) return last.value;

  let low = 0;
  let high = points.length - 1;

  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);

    if ((points[middle]?.time ?? 0) <= time) {
      low = middle;
    } else {
      high = middle;
    }
  }

  const left = points[low];
  const right = points[high];
  if (!left || !right) return last.value;

  const span = right.time - left.time;
  if (span <= 0) return right.value;

  const ratio = (time - left.time) / span;

  return left.value + (right.value - left.value) * ratio;
}

export function prepareLivelineVisualCurve(
  points: LivelinePoint[],
  {
    maxPoints = 72,
    minPoints = 24,
    minStepSecs = 60,
  }: VisualCurveOptions = {},
): LivelinePoint[] {
  const normalized = normalizeLivelinePoints(points, minStepSecs);

  if (normalized.length < 2) return normalized;

  const first = normalized[0];
  const last = normalized.at(-1);
  if (!first || !last || last.time <= first.time) return normalized;

  const span = last.time - first.time;
  const targetCount = Math.min(
    maxPoints,
    Math.max(minPoints, Math.ceil(span / minStepSecs) + 1),
  );

  if (normalized.length <= targetCount) return normalized;

  const step = span / (targetCount - 1);

  return Array.from({ length: targetCount }, (_, index) => {
    if (index === 0) return first;
    if (index === targetCount - 1) return last;

    const time = Math.round(first.time + step * index);

    return {
      time,
      value: interpolateLivelineValue(normalized, time),
    };
  });
}

function inferHistoricalBucketSecs(spanSecs: number) {
  if (spanSecs >= 60 * 86_400) return 86_400;
  if (spanSecs >= 21 * 86_400) return 21_600;
  if (spanSecs >= 7 * 86_400) return 7_200;
  if (spanSecs >= 2 * 86_400) return 1_800;

  return 300;
}

export function bucketLivelinePoints(
  points: LivelinePoint[],
  bucketSecs: number,
): LivelinePoint[] {
  const normalized = normalizeLivelinePoints(points, 1);
  if (normalized.length < 2 || bucketSecs <= 1) return normalized;

  const buckets = new Map<number, LivelinePoint>();

  for (const point of normalized) {
    const bucketStart = Math.floor(point.time / bucketSecs) * bucketSecs;
    buckets.set(bucketStart, {
      time: bucketStart + Math.floor(bucketSecs / 2),
      value: point.value,
    });
  }

  const first = normalized[0];
  const last = normalized.at(-1);
  const bucketed = [...buckets.entries()]
    .toSorted(([left], [right]) => left - right)
    .map(([, point]) => point);

  if (first && bucketed[0]) {
    bucketed[0] = { time: first.time, value: first.value };
  }

  if (last && bucketed.at(-1)) {
    bucketed[bucketed.length - 1] = { time: last.time, value: last.value };
  }

  return normalizeLivelinePoints(bucketed, Math.min(bucketSecs, 60));
}

export function prepareHistoricalLivelineCurve(
  points: LivelinePoint[],
  options: VisualCurveOptions = {},
): LivelinePoint[] {
  const normalized = normalizeLivelinePoints(points, 1);
  const first = normalized[0];
  const last = normalized.at(-1);

  if (normalized.length < 2 || !first || !last || last.time <= first.time) {
    return normalized;
  }

  const spanSecs = last.time - first.time;
  const bucketSecs = options.bucketSecs ?? inferHistoricalBucketSecs(spanSecs);
  const bucketed = bucketLivelinePoints(normalized, bucketSecs);

  return prepareLivelineVisualCurve(bucketed, {
    maxPoints: options.maxPoints,
    minPoints: options.minPoints,
    minStepSecs: Math.max(options.minStepSecs ?? 60, Math.min(bucketSecs, 60)),
  });
}

export function fitLivelineToWindowStart(
  points: LivelinePoint[],
  windowSecs: number,
): LivelinePoint[] {
  const normalized = normalizeLivelinePoints(points, 1);
  const first = normalized[0];
  const last = normalized.at(-1);

  if (normalized.length < 2 || !first || !last || last.time <= first.time || windowSecs <= 0) {
    return normalized;
  }

  const windowStart = last.time - windowSecs;
  if (windowStart <= first.time) return normalized;

  const startValue = interpolateLivelineValue(normalized, windowStart);
  const visible = normalized.filter((point) => point.time > windowStart);

  return normalizeLivelinePoints(
    [
      { time: windowStart, value: startValue },
      ...visible,
    ],
    1,
  );
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
