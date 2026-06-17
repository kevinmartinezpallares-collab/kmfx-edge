"use client";

import * as React from "react";
import { motion } from "motion/react";

function buildPaths(position: number) {
	return Array.from({ length: 36 }, (_, i) => ({
		id: i,
		d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${
			380 - i * 5 * position
		} -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${
			152 - i * 5 * position
		} ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${
			684 - i * 5 * position
		} ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
		width: 0.5 + i * 0.03,
	}));
}

function FloatingPathsComponent({ position }: { position: number }) {
	const paths = React.useMemo(() => buildPaths(position), [position]);

	return (
		<div aria-hidden="true" className="pointer-events-none absolute inset-0">
			<svg
				className="h-full w-full text-primary"
				fill="none"
				focusable="false"
				viewBox="0 0 696 316"
			>
				{paths.map((path) => (
					<motion.path
						animate={{
							opacity: [0.3, 0.6, 0.3],
							pathLength: 1,
							pathOffset: [0, 1, 0],
						}}
						d={path.d}
						initial={{ opacity: 0.6, pathLength: 0.3 }}
						key={path.id}
						stroke="currentColor"
						strokeOpacity={0.1 + path.id * 0.03}
						strokeWidth={path.width}
						transition={{
							duration: 20 + (path.id % 11) * 0.9,
							ease: "linear",
							repeat: Number.POSITIVE_INFINITY,
						}}
						vectorEffect="non-scaling-stroke"
					/>
				))}
			</svg>
		</div>
	);
}

export const FloatingPaths = React.memo(FloatingPathsComponent);
