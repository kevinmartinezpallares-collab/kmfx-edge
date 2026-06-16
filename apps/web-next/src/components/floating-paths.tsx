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
		duration: 20 + (i % 7) * 1.25,
		delay: i * -0.42,
	}));

	return (
		<div
			aria-hidden="true"
			className="pointer-events-none absolute inset-0"
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
						pathLength={1}
						stroke="currentColor"
						strokeDasharray="0.22 0.78"
						strokeLinecap="round"
						strokeOpacity={Math.min(0.86, 0.1 + path.id * 0.03)}
						strokeWidth={path.width}
						className="kmfx-floating-path"
						style={
							{
								"--path-duration": `${path.duration}s`,
								"--path-delay": `${path.delay}s`,
							} as CSSProperties
						}
					/>
				))}
			</svg>
		</div>
	);
}
