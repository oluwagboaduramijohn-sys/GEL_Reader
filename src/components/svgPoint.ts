/** Convert a pointer event to the SVG's own (image pixel) coordinates. */
export function svgPoint(svg: SVGSVGElement, e: { clientX: number; clientY: number }) {
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x: 0, y: 0 }
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
  return { x: p.x, y: p.y }
}
