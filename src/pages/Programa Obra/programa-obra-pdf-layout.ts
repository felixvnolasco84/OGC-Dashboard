export const ROW_CSS_PX = 44;
export const MIN_ROW_HEIGHT_MM = 5.2;

export type ExpandableNode = {
  id: string;
  children: ExpandableNode[];
};

/** IDs of items that have children and should be expanded to show the full breakdown. */
export function collectExpandableIds(items: ExpandableNode[]): Set<string> {
  const ids = new Set<string>();
  const walk = (item: ExpandableNode) => {
    if (item.children.length > 0) {
      ids.add(item.id);
      for (const child of item.children) walk(child);
    }
  };
  for (const item of items) walk(item);
  return ids;
}

/** Split a captured Gantt into vertical pages without shrinking rows unreadably. */
export function computeGanttPagination(params: {
  canvasHeight: number;
  elementHeight: number;
  headerCssH: number;
  usableHMm: number;
}) {
  const pxPerCss = params.canvasHeight / Math.max(params.elementHeight, 1);
  const headerCanvasH = Math.max(1, Math.round(params.headerCssH * pxPerCss));
  const bodyCanvasH = Math.max(0, params.canvasHeight - headerCanvasH);
  const rowCanvasH = Math.max(1, ROW_CSS_PX * pxPerCss);
  const fitAllScale = params.usableHMm / Math.max(params.canvasHeight, 1);
  const minScale = MIN_ROW_HEIGHT_MM / rowCanvasH;

  if (fitAllScale >= minScale) {
    return {
      scaleToFitH: fitAllScale,
      headerCanvasH,
      bodyCanvasH,
      bodyCanvasPerPage: Math.max(bodyCanvasH, 1),
      vPages: 1,
      headerMmH: headerCanvasH * fitAllScale,
    };
  }

  const scaleToFitH = minScale;
  const bodyAvailMmH = Math.max(params.usableHMm - headerCanvasH * scaleToFitH, MIN_ROW_HEIGHT_MM);
  const maxBodyCanvasPerPage = bodyAvailMmH / scaleToFitH;
  const rowsPerPage = Math.max(1, Math.floor(maxBodyCanvasPerPage / rowCanvasH));
  const bodyCanvasPerPage = rowsPerPage * rowCanvasH;
  const vPages = Math.max(1, Math.ceil(bodyCanvasH / bodyCanvasPerPage) || 1);
  return { scaleToFitH, headerCanvasH, bodyCanvasH, bodyCanvasPerPage, vPages, headerMmH: headerCanvasH * scaleToFitH };
}
