import type { CSSProperties } from "react";

export function FloatingPaths({ position }: { position: number }) {
	const paths = Array.from({ length: 36 }, (_, i) => ({
		id: i,
		d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${
			380 - i * 5 * position
		} -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${
			152 - i * 5 * position
		} ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${
			684 - i * 5 * position
		} ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
		width: 0.5 + i * 0.03,
		duration: 20 + (i % 10),
		delay: -i * 0.42,
		opacityLow: 0.025 + i * 0.003,
		opacityHigh: 0.05 + i * 0.004,
		offsetMid: position > 0 ? -0.5 : 0.5,
		offsetEnd: position > 0 ? -1 : 1,
	}));

	return (
		<div
			aria-hidden="true"
			className="kmfx-floating-paths pointer-events-none absolute inset-0"
		>
			<svg
				className="h-full w-full text-primary"
				fill="none"
				viewBox="0 0 696 316"
			>
				{paths.map((path) => (
					<path
						d={path.d}
						key={path.id}
						stroke="currentColor"
						strokeLinecap="round"
						strokeWidth={path.width}
						pathLength={1}
						className="kmfx-floating-path-line"
						style={
							{
								"--path-duration": `${path.duration}s`,
								"--path-delay": `${path.delay}s`,
								"--path-opacity-low": path.opacityLow,
								"--path-opacity-high": path.opacityHigh,
								"--path-offset-mid": path.offsetMid,
								"--path-offset-end": path.offsetEnd,
							} as CSSProperties
						}
					/>
				))}
			</svg>
		</div>
	);
}
