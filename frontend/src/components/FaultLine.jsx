/**
 * components/FaultLine.jsx
 *
 * The signature visual element — a seismic waveform SVG that sits full-width
 * between the version labels and the change list. Flat where nothing changed,
 * spiking in height and color at each point of drift:
 *   - Breaking → tall red spike
 *   - Warning  → medium amber spike
 *   - Safe     → small green tick
 *
 * Animates left-to-right on mount (like a needle tracing), with breaking
 * spikes drawing in with sharper acceleration so the eye is pulled to severity.
 */
import { useEffect, useRef } from 'react';

const HEIGHT  = 72;
const PADDING = 16;
const SPIKE_H = { BREAKING: 48, WARNING: 28, NON_BREAKING: 10 };
const COLOR   = { BREAKING: '#FF5C5C', WARNING: '#F5A623', NON_BREAKING: '#3DD9A0' };

function buildPath(changes, width) {
  const n = changes.length;
  const midY = HEIGHT / 2;

  if (n === 0) {
    return { path: `M ${PADDING} ${midY} L ${width - PADDING} ${midY}`, dots: [] };
  }

  const step = (width - PADDING * 2) / Math.max(n + 1, 2);
  const dots = changes.map((c, i) => {
    const x = PADDING + step * (i + 1);
    const h = SPIKE_H[c.classification.severity] || 10;
    return { x, y: midY, spike: h, color: COLOR[c.classification.severity] || COLOR.NON_BREAKING, change: c };
  });

  // Build the SVG path: flat baseline with triangular spikes at each change
  let d = `M ${PADDING} ${midY}`;
  for (const dot of dots) {
    const half = Math.max(step * 0.25, 6);
    d += ` L ${dot.x - half} ${midY}`;
    d += ` L ${dot.x} ${midY - dot.spike}`;
    d += ` L ${dot.x + half} ${midY}`;
  }
  d += ` L ${width - PADDING} ${midY}`;

  return { path: d, dots };
}

export default function FaultLine({ changes = [] }) {
  const containerRef = useRef(null);
  const svgRef       = useRef(null);
  const pathRef      = useRef(null);
  const animFrameRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const width = el.clientWidth || 800;
    const { path, dots } = buildPath(changes, width);

    const svg = svgRef.current;
    svg.setAttribute('width', width);
    svg.setAttribute('height', HEIGHT);
    svg.setAttribute('viewBox', `0 0 ${width} ${HEIGHT}`);

    // Clear previous content
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // Base line (always full-width, dim)
    const baseline = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    baseline.setAttribute('x1', PADDING);
    baseline.setAttribute('y1', HEIGHT / 2);
    baseline.setAttribute('x2', width - PADDING);
    baseline.setAttribute('y2', HEIGHT / 2);
    baseline.setAttribute('stroke', '#2A2D38');
    baseline.setAttribute('stroke-width', '1');
    svg.appendChild(baseline);

    // Animated waveform path
    const wavePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    wavePath.setAttribute('d', path);
    wavePath.setAttribute('fill', 'none');
    wavePath.setAttribute('stroke', '#6E6BFF');
    wavePath.setAttribute('stroke-width', '1.5');
    wavePath.setAttribute('stroke-linecap', 'round');
    wavePath.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(wavePath);
    pathRef.current = wavePath;

    // Animate path drawing left-to-right
    const totalLen = wavePath.getTotalLength();
    wavePath.style.strokeDasharray  = totalLen;
    wavePath.style.strokeDashoffset = totalLen;
    wavePath.style.transition = 'stroke-dashoffset 700ms cubic-bezier(0.16, 1, 0.3, 1)';
    // Trigger reflow then animate
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        wavePath.style.strokeDashoffset = '0';
      });
    });

    // Colored dots at each change — stagger in after line draws
    dots.forEach((dot, i) => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', dot.x);
      circle.setAttribute('cy', dot.y - dot.spike);
      circle.setAttribute('r', dot.spike > 20 ? 4 : 3);
      circle.setAttribute('fill', dot.color);
      circle.style.opacity = '0';
      circle.style.transition = `opacity 200ms ease ${700 + i * 40}ms`;
      svg.appendChild(circle);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => { circle.style.opacity = '1'; });
      });

      // Glow for breaking changes
      if (dot.spike === SPIKE_H.BREAKING) {
        circle.setAttribute('filter', 'url(#breaking-glow)');
      }
    });

    // SVG filter for breaking glow
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filter.setAttribute('id', 'breaking-glow');
    const feGaussianBlur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
    feGaussianBlur.setAttribute('stdDeviation', '2');
    feGaussianBlur.setAttribute('result', 'blur');
    const feMerge = document.createElementNS('http://www.w3.org/2000/svg', 'feMerge');
    const feMergeNode1 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
    feMergeNode1.setAttribute('in', 'blur');
    const feMergeNode2 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
    feMergeNode2.setAttribute('in', 'SourceGraphic');
    feMerge.appendChild(feMergeNode1);
    feMerge.appendChild(feMergeNode2);
    filter.appendChild(feGaussianBlur);
    filter.appendChild(feMerge);
    defs.appendChild(filter);
    svg.prepend(defs);

  }, [changes]);

  return (
    <div ref={containerRef} className="fault-line-container" style={{ width: '100%' }}>
      <svg ref={svgRef} style={{ display: 'block' }} />
    </div>
  );
}
