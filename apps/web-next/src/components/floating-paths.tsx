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
	}));

	return (
		<div aria-hidden="true" className="pointer-events-none absolute inset-0">
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
						strokeOpacity={0.025 + path.id * 0.003}
						strokeWidth={path.width}
					/>
				))}
			</svg>
		</div>
	);
}
