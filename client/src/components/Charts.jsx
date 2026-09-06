export function DonutChart({ data, size = 150, thickness = 20 }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {total === 0 ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#e7ebf3"
            strokeWidth={thickness}
          />
        ) : (
          data
            .filter((d) => d.value > 0)
            .map((d, i) => {
              const fraction = d.value / total;
              const dash = fraction * circumference;
              const el = (
                <circle
                  key={i}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={d.color}
                  strokeWidth={thickness}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += dash;
              return el;
            })
        )}
      </g>
    </svg>
  );
}

export function TrendChart({ points, width = 280, height = 90, color = '#1656c9' }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const stepX = points.length > 1 ? width / (points.length - 1) : width;
  const coords = points.map((p, i) => ({
    x: points.length > 1 ? i * stepX : width / 2,
    y: height - (p.value / max) * (height - 8) - 4,
  }));
  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x} ${c.y}`).join(' ');
  const areaPath = `${linePath} L ${coords[coords.length - 1].x} ${height} L ${coords[0].x} ${height} Z`;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <path d={areaPath} fill={color} opacity="0.12" />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      {coords.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r="3" fill={color} />
      ))}
    </svg>
  );
}
