// ─── Graph layouts ───────────────────────────
// Every layout returns a { nodeId → {x, y} } map in graph coordinates.
//
// Two families live here. Below SCALE_SAFE_AT nodes the original layouts run
// unchanged, because their character (an orbit, a radial burst, a mindmap) is
// the point on a spec you can take in at a glance. Above it those shapes grow
// linearly with the node count — a 256-group spec put the orbital ring at a
// 28,000 px diameter and the tree at half a million pixels wide, which is past
// what any amount of zooming can rescue. The large variants pack the same
// hierarchy into an area that grows with the square root of the node count
// instead, while keeping each layout visually distinct.

import { CARD_DIM, getCardDim, measureNodes } from "./graphGeometry";

export { measureNodes };

// Past this many nodes the packed variants take over.
export const SCALE_SAFE_AT = 160;

// Zoom bounds — shared so auto-fit, the fit button and the zoom controls
// cannot disagree about how far out the canvas is allowed to go.
export const MIN_ZOOM = 0.04;
export const MAX_ZOOM = 3;

// Below this zoom a card is only a few pixels wide, so the canvas swaps to a
// single-element placeholder per node instead of the full card.
export const LOD_ZOOM = 0.35;

const PAD = 50;

// ─── Node indexing ───────────────────────────
const indexNodes = (nodes) => {
  const byId = new Map();
  const childrenOf = new Map();
  nodes.forEach((n) => byId.set(n.id, n));
  nodes.forEach((n) => {
    if (!n.parentId) return;
    if (!childrenOf.has(n.parentId)) childrenOf.set(n.parentId, []);
    childrenOf.get(n.parentId).push(n);
  });
  return { byId, kids: (id) => childrenOf.get(id) || [] };
};

// ─── Cluster: one folder plus its endpoints ──
// Children sit in a grid beside the folder. Columns are chosen to keep the
// cluster roughly square, which is what makes the packing tight.
const CLUSTER_GAP = 34;
const ROW_GAP = 26;
const CLUSTER_PAD = 90;

const gridColumns = (count, colW, rowH) =>
  Math.max(1, Math.min(count, Math.round(Math.sqrt((count * rowH) / colW)) || 1));

/**
 * `maxRows` lets a caller ask for a tall, narrow cluster. Ring packing is
 * limited by the arc each box eats, so a column of endpoints fits far more
 * groups per ring than a square block of the same area.
 */
const buildCluster = (folder, children, { mirror = false, maxRows = 0 } = {}) => {
  const fDim = getCardDim(folder.type);
  const count = children.length;

  if (!count) {
    return {
      w: fDim.w,
      h: fDim.h,
      place: (x, y, pos) => {
        pos[folder.id] = { x, y };
      },
    };
  }

  const colW = CARD_DIM.request.w + CLUSTER_GAP;
  const rowH = CARD_DIM.request.h + ROW_GAP;
  const cols = maxRows
    ? Math.max(1, Math.ceil(count / maxRows))
    : gridColumns(count, colW, rowH);
  const rows = Math.ceil(count / cols);

  const blockW = cols * colW - CLUSTER_GAP;
  const blockH = rows * rowH - ROW_GAP;
  const w = fDim.w + CLUSTER_GAP + blockW;
  const h = Math.max(fDim.h, blockH);

  return {
    w,
    h,
    place: (x, y, pos) => {
      const folderX = mirror ? x + w - fDim.w : x;
      const blockX = mirror ? x : x + fDim.w + CLUSTER_GAP;
      pos[folder.id] = { x: folderX, y: y + (h - fDim.h) / 2 };

      const blockY = y + (h - blockH) / 2;
      children.forEach((child, i) => {
        const col = Math.floor(i / rows);
        const row = i % rows;
        pos[child.id] = {
          x: blockX + (mirror ? blockW - (col + 1) * colW + CLUSTER_GAP : col * colW),
          y: blockY + row * rowH,
        };
      });
    },
  };
};

// A folder with its endpoints laid out underneath — used by the tree variant.
const buildBlock = (folder, children) => {
  const fDim = getCardDim(folder.type);
  const count = children.length;
  const LEVEL_GAP = 50;

  if (!count) {
    return {
      w: fDim.w,
      h: fDim.h,
      place: (x, y, pos) => {
        pos[folder.id] = { x, y };
      },
    };
  }

  const colW = CARD_DIM.request.w + CLUSTER_GAP;
  const rowH = CARD_DIM.request.h + ROW_GAP;
  const cols = Math.max(
    1,
    Math.min(count, Math.round(Math.sqrt((count * rowH) / colW) * 1.6) || 1),
  );
  const rows = Math.ceil(count / cols);

  const blockW = cols * colW - CLUSTER_GAP;
  const blockH = rows * rowH - ROW_GAP;
  const w = Math.max(fDim.w, blockW);
  const h = fDim.h + LEVEL_GAP + blockH;

  return {
    w,
    h,
    place: (x, y, pos) => {
      pos[folder.id] = { x: x + (w - fDim.w) / 2, y };
      const blockX = x + (w - blockW) / 2;
      const blockY = y + fDim.h + LEVEL_GAP;
      children.forEach((child, i) => {
        pos[child.id] = {
          x: blockX + (i % cols) * colW,
          y: blockY + Math.floor(i / cols) * rowH,
        };
      });
    },
  };
};

// ─── Packers ─────────────────────────────────
/** Row-major shelf packing: fill left to right, wrap at targetW. */
const packShelves = (clusters, targetW, gap) => {
  const placements = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  let width = 0;

  clusters.forEach((cl) => {
    if (x > 0 && x + cl.w > targetW) {
      x = 0;
      y += rowH + gap;
      rowH = 0;
    }
    placements.push({ cl, x, y });
    x += cl.w + gap;
    rowH = Math.max(rowH, cl.h);
    width = Math.max(width, x - gap);
  });

  return { placements, width, height: y + rowH };
};

/** Column-major packing: fill top to bottom, wrap at targetH. */
const packColumns = (clusters, targetH, gap) => {
  const placements = [];
  let x = 0;
  let y = 0;
  let colW = 0;
  let height = 0;

  clusters.forEach((cl) => {
    if (y > 0 && y + cl.h > targetH) {
      y = 0;
      x += colW + gap;
      colW = 0;
    }
    placements.push({ cl, x, y });
    y += cl.h + gap;
    colW = Math.max(colW, cl.w);
    height = Math.max(height, y - gap);
  });

  return { placements, width: x + colW, height };
};

/**
 * Concentric rings of clusters around a centre. A ring holds as many boxes as
 * its chord allows, so the radius grows with √n rather than n.
 */
const packRings = (clusters, gap, clearance) => {
  const placements = [];
  let inner = clearance;
  let index = 0;
  let guard = 0;

  while (index < clusters.length && guard < 2000) {
    guard += 1;

    // The ring's radial thickness is only known once it is filled, so fill
    // against the first member's height and correct with the real maximum.
    // Cards are axis-aligned, so two boxes a chord apart can still overlap on
    // the diagonal — and the same is true radially between one ring and the
    // next. Spacing by the circumscribed radius is the rule that holds at
    // every angle, in both directions.
    const reach = (cl) => Math.sqrt(cl.w * cl.w + cl.h * cl.h) / 2;

    let ringH = 2 * reach(clusters[index]);
    let radius = inner + ringH / 2;
    const separation = (a, b, r) =>
      2 * Math.asin(Math.min(0.999, (reach(a) + reach(b) + gap) / (2 * r)));

    const fill = (r) => {
      const out = [];
      let angle = 0;
      let i = index;
      while (i < clusters.length) {
        const cl = clusters[i];
        if (out.length) {
          const next = angle + separation(out[out.length - 1].cl, cl, r);
          // Leave room to close the loop back to the first box.
          if (next + separation(cl, out[0].cl, r) > Math.PI * 2) break;
          angle = next;
        }
        out.push({ cl, angle });
        i += 1;
      }
      const close = out.length > 1 ? separation(out[out.length - 1].cl, out[0].cl, r) : 0;
      return { out, span: angle + close, next: i };
    };

    let filled = fill(radius);
    const actualH = filled.out.reduce((m, e) => Math.max(m, 2 * reach(e.cl)), 0);
    if (actualH > ringH) {
      ringH = actualH;
      radius = inner + ringH / 2;
      filled = fill(radius);
    }
    index = filled.next;

    // Spread whatever arc is left over evenly so rings look deliberate.
    const slack =
      Math.max(0, Math.PI * 2 - filled.span) / Math.max(1, filled.out.length);
    filled.out.forEach((entry, i) => {
      const a = entry.angle + slack * i - Math.PI / 2;
      placements.push({
        cl: entry.cl,
        x: Math.cos(a) * radius - entry.cl.w / 2,
        y: Math.sin(a) * radius - entry.cl.h / 2,
      });
    });

    inner += ringH + gap;
  }

  return { placements, radius: inner };
};

/** Width that makes a shelf-packed block roughly `aspect` times as wide as tall. */
const targetWidthFor = (clusters, gap, aspect) => {
  const area = clusters.reduce((sum, cl) => sum + (cl.w + gap) * (cl.h + gap), 0);
  const widest = clusters.reduce((m, cl) => Math.max(m, cl.w), 0);
  return Math.max(widest, Math.sqrt(area * aspect));
};

// ─── Large-spec layouts ──────────────────────
const largeLayout = (graphStyle, root, index) => {
  const pos = {};
  const rootDim = getCardDim("root");
  const rootChildren = index.kids(root.id);
  const folders = rootChildren.filter((n) => n.type === "folder");
  const loose = rootChildren.filter((n) => n.type !== "folder");

  // Radial wants tall, narrow clusters; everything else wants square ones.
  const shape = {
    mirror: graphStyle === "mindmap",
    // A square cluster has the smallest diagonal for its area, which is what
    // ring packing pays for, so radial keeps the default shape too.
    maxRows: 0,
  };
  const build =
    graphStyle === "tree"
      ? (f, kids) => buildBlock(f, kids)
      : (f, kids) => buildCluster(f, kids, shape);

  const clusters = [
    ...folders.map((f) => build(f, index.kids(f.id))),
    ...loose.map((n) => build(n, [])),
  ];

  if (!clusters.length) {
    pos[root.id] = { x: 0, y: 0 };
    return pos;
  }

  if (graphStyle === "radial") {
    const { placements } = packRings(clusters, CLUSTER_PAD, 300 + rootDim.w / 2);
    pos[root.id] = { x: -rootDim.w / 2, y: -rootDim.h / 2 };
    placements.forEach(({ cl, x, y }) => cl.place(x, y, pos));
    return pos;
  }

  if (graphStyle === "flowchart") {
    const area = clusters.reduce(
      (s, cl) => s + (cl.w + CLUSTER_PAD) * (cl.h + CLUSTER_PAD),
      0,
    );
    const tallest = clusters.reduce((m, cl) => Math.max(m, cl.h), 0);
    const targetH = Math.max(tallest, Math.sqrt(area / 1.5));
    const { placements, height } = packColumns(clusters, targetH, CLUSTER_PAD);
    pos[root.id] = { x: -(rootDim.w + 180), y: height / 2 - rootDim.h / 2 };
    placements.forEach(({ cl, x, y }) => cl.place(x, y, pos));
    return pos;
  }

  if (graphStyle === "mindmap") {
    // Keep the two-sided identity: half the groups mirror onto the left.
    const half = Math.ceil(clusters.length / 2);
    const left = clusters.slice(0, half);
    const right = clusters.slice(half);
    const targetW = Math.max(1, targetWidthFor(clusters, CLUSTER_PAD, 0.8) / 2);

    const packedLeft = packShelves(left, targetW, CLUSTER_PAD);
    const packedRight = packShelves(right, targetW, CLUSTER_PAD);
    const height = Math.max(packedLeft.height, packedRight.height);
    const gapToRoot = 220;

    packedLeft.placements.forEach(({ cl, x, y }) =>
      cl.place(
        x - packedLeft.width - gapToRoot - rootDim.w / 2,
        y + (height - packedLeft.height) / 2,
        pos,
      ),
    );
    packedRight.placements.forEach(({ cl, x, y }) =>
      cl.place(
        x + gapToRoot + rootDim.w / 2,
        y + (height - packedRight.height) / 2,
        pos,
      ),
    );
    pos[root.id] = { x: -rootDim.w / 2, y: height / 2 - rootDim.h / 2 };
    return pos;
  }

  // graph and tree: one packed block with the root centred above it
  const aspect = graphStyle === "tree" ? 1.9 : 1.6;
  const targetW = targetWidthFor(clusters, CLUSTER_PAD, aspect);
  const { placements, width } = packShelves(clusters, targetW, CLUSTER_PAD);
  const rootGap = graphStyle === "tree" ? 150 : 190;

  pos[root.id] = { x: width / 2 - rootDim.w / 2, y: -(rootDim.h + rootGap) };
  placements.forEach(({ cl, x, y }) => cl.place(x, y, pos));
  return pos;
};

// ─── Original layouts (small specs) ──────────
const smallLayout = (graphStyle, root, index) => {
  const pos = {};
  pos[root.id] = { x: 120, y: 300 };

  const rootChildren = index.kids(root.id);
  const rootFolders = rootChildren.filter((n) => n.type === "folder");
  const rootRequests = rootChildren.filter((n) => n.type === "request");
  const isFlatCollection = rootFolders.length === 0 && rootRequests.length > 0;

  if (graphStyle === "tree") {
    // ── Top-down vertical tree ──
    const CARD_H = { root: 110, folder: 80, request: 85 };
    const CARD_W = { root: 240, folder: 208, request: 256 };
    const SIBLING_GAP = 24;
    const LEVEL_GAP = 60;
    const TREE_PAD_Y = 50;

    const subtreeWidth = {};
    const calcSubtreeW = (nodeId) => {
      if (subtreeWidth[nodeId] !== undefined) return subtreeWidth[nodeId];
      const nd = index.byId.get(nodeId);
      const w = CARD_W[nd?.type || "request"];
      const children = index.kids(nodeId);
      if (children.length === 0) {
        subtreeWidth[nodeId] = w;
        return w;
      }
      const totalChildW =
        children.reduce((sum, ch) => sum + calcSubtreeW(ch.id), 0) +
        (children.length - 1) * SIBLING_GAP;
      subtreeWidth[nodeId] = Math.max(totalChildW, w);
      return subtreeWidth[nodeId];
    };
    calcSubtreeW(root.id);

    const placeNode = (nodeId, xCenter, y) => {
      const nd = index.byId.get(nodeId);
      const w = CARD_W[nd?.type || "request"];
      const h = CARD_H[nd?.type || "request"];
      const children = index.kids(nodeId);
      pos[nodeId] = { x: xCenter - w / 2, y };
      if (children.length === 0) return;

      const totalChildW =
        children.reduce((sum, ch) => sum + subtreeWidth[ch.id], 0) +
        (children.length - 1) * SIBLING_GAP;
      let cx = xCenter - totalChildW / 2;
      const childY = y + h + LEVEL_GAP;
      children.forEach((ch) => {
        const chSubW = subtreeWidth[ch.id];
        placeNode(ch.id, cx + chSubW / 2, childY);
        cx += chSubW + SIBLING_GAP;
      });
    };

    placeNode(root.id, subtreeWidth[root.id] / 2 + 60, TREE_PAD_Y);
  } else if (graphStyle === "flowchart") {
    let y = 60;
    if (isFlatCollection) {
      rootRequests.forEach((node) => {
        pos[node.id] = { x: 440, y };
        y += 110;
      });
      pos[root.id] = { x: 120, y: Math.max(0, (y - 110) / 2 - 30) };
    } else {
      rootFolders.forEach((node) => {
        const children = index.kids(node.id);
        pos[node.id] = { x: 420, y };
        let childY = y - 30;
        children.forEach((child) => {
          pos[child.id] = { x: 740, y: childY };
          childY += 110;
        });
        y += Math.max(180, children.length * 110 + 40);
      });
      rootRequests.forEach((node) => {
        pos[node.id] = { x: 420, y };
        y += 110;
      });
    }
  } else if (graphStyle === "radial") {
    // ── Concentric-ring radial ──
    const RW = { root: 240, folder: 208, request: 256 };
    const RH = { root: 110, folder: 80, request: 85 };
    const CX = 800;
    const CY = 550;

    pos[root.id] = { x: CX - RW.root / 2, y: CY - RH.root / 2 };

    if (isFlatCollection) {
      const r = Math.max(280, rootRequests.length * 50);
      rootRequests.forEach((node, i) => {
        const a = (i / rootRequests.length) * Math.PI * 2 - Math.PI / 2;
        pos[node.id] = {
          x: CX + Math.cos(a) * r - RW.request / 2,
          y: CY + Math.sin(a) * r - RH.request / 2,
        };
      });
    } else {
      const ringItems = [...rootFolders, ...rootRequests];
      const ringCount = ringItems.length || 1;
      const R1 = Math.max(300, ringCount * 55);

      const childCounts = ringItems.map((item) =>
        item.type === "folder" ? index.kids(item.id).length : 0,
      );
      const totalWeight = childCounts.reduce((s, c) => s + Math.max(1, c), 0);
      let currentAngle = -Math.PI / 2;

      ringItems.forEach((item, i) => {
        const weight = Math.max(1, childCounts[i]);
        const arcSize = (weight / totalWeight) * Math.PI * 2;
        const itemAngle = currentAngle + arcSize / 2;

        const ix = CX + Math.cos(itemAngle) * R1;
        const iy = CY + Math.sin(itemAngle) * R1;
        const w = RW[item.type] || RW.request;
        const h = RH[item.type] || RH.request;
        pos[item.id] = { x: ix - w / 2, y: iy - h / 2 };

        if (item.type === "folder") {
          const children = index.kids(item.id);
          if (children.length > 0) {
            const R2 = Math.max(200, children.length * 26);
            const fanArc = arcSize * 0.8;
            children.forEach((child, ci) => {
              const ca =
                children.length === 1
                  ? itemAngle
                  : itemAngle - fanArc / 2 + (ci / (children.length - 1)) * fanArc;
              pos[child.id] = {
                x: ix + Math.cos(ca) * R2 - RW.request / 2,
                y: iy + Math.sin(ca) * R2 - RH.request / 2,
              };
            });
          }
        }
        currentAngle += arcSize;
      });
    }
  } else if (graphStyle === "graph") {
    // ── Clustered orbital ──
    const CW = { root: 240, folder: 208, request: 256 };
    const CH = { root: 110, folder: 80, request: 85 };
    const CX = 750;
    const CY = 500;

    pos[root.id] = { x: CX - CW.root / 2, y: CY - CH.root / 2 };

    const ringItems = rootChildren;
    const ringCount = ringItems.length || 1;
    const R_RING = Math.max(300, ringCount * 55);

    ringItems.forEach((item, i) => {
      const angle = (i / ringCount) * Math.PI * 2 - Math.PI / 2;
      const ix = CX + Math.cos(angle) * R_RING;
      const iy = CY + Math.sin(angle) * R_RING;
      const w = CW[item.type] || CW.request;
      const h = CH[item.type] || CH.request;
      pos[item.id] = { x: ix - w / 2, y: iy - h / 2 };

      if (item.type === "folder") {
        const children = index.kids(item.id);
        if (children.length === 0) return;

        const CHILD_PITCH = 270;
        const R_CHILD = Math.max(320, children.length * 120);
        const fanSpread =
          children.length > 1
            ? Math.min(Math.PI * 0.8, (children.length * CHILD_PITCH) / R_CHILD)
            : 0;

        children.forEach((child, ci) => {
          const ca =
            children.length === 1
              ? angle
              : angle - fanSpread / 2 + (ci / (children.length - 1)) * fanSpread;
          const rx = ix + Math.cos(ca) * R_CHILD;
          const ry = iy + Math.sin(ca) * R_CHILD;
          pos[child.id] = { x: rx - CW.request / 2, y: ry - CH.request / 2 };
        });
      }
    });
  } else {
    // ── Mindmap ──
    const CHILD_STEP = 94;
    const GROUP_GAP = 68;
    const ROOT_X = 660;
    const FOLD_X_L = 360;
    const CHILD_X_L = 40;
    const FOLD_X_R = 956;
    const CHILD_X_R = 1228;

    if (isFlatCollection) {
      const lefts = rootRequests.filter((_, i) => i % 2 === 0);
      const rights = rootRequests.filter((_, i) => i % 2 !== 0);
      const totalH = Math.max(lefts.length, rights.length) * CHILD_STEP + GROUP_GAP;
      pos[root.id] = { x: ROOT_X, y: totalH / 2 - 44 };
      lefts.forEach((node, i) => {
        pos[node.id] = { x: CHILD_X_L, y: i * CHILD_STEP };
      });
      rights.forEach((node, i) => {
        pos[node.id] = { x: CHILD_X_R, y: i * CHILD_STEP };
      });
    } else {
      const lefts = [];
      const rights = [];
      rootFolders.forEach((n, fi) => (fi % 2 === 0 ? lefts : rights).push(n));
      const groupH = (f) => Math.max(1, index.kids(f.id).length) * CHILD_STEP + GROUP_GAP;
      const totalH = (arr) => arr.reduce((s, f) => s + groupH(f), 0);
      const maxH = Math.max(totalH(lefts), totalH(rights), 260);
      pos[root.id] = { x: ROOT_X, y: maxH / 2 - 44 };

      const placeGroup = (arr, folderX, childX) => {
        let y = 0;
        arr.forEach((folder) => {
          const children = index.kids(folder.id);
          const gh = groupH(folder);
          const usable = gh - GROUP_GAP;
          pos[folder.id] = { x: folderX, y: y + usable / 2 - 40 };
          const span = (children.length - 1) * CHILD_STEP;
          const start = y + usable / 2 - span / 2 - 44;
          children.forEach((child, ci) => {
            pos[child.id] = { x: childX, y: start + ci * CHILD_STEP };
          });
          y += gh;
        });
      };
      placeGroup(lefts, FOLD_X_L, CHILD_X_L);
      placeGroup(rights, FOLD_X_R, CHILD_X_R);
      rootRequests.forEach((node, i) => {
        pos[node.id] = { x: CHILD_X_R, y: totalH(rights) + i * CHILD_STEP };
      });
    }
  }

  return pos;
};

// ─── Entry point ─────────────────────────────
/**
 * `large` overrides the automatic choice of layout family. The canvas passes
 * it so that collapsing groups on a big spec keeps the packed layout instead
 * of snapping back to the orbital one once the visible count drops.
 */
export const computePositions = (nodes, graphStyle, { large } = {}) => {
  if (!Array.isArray(nodes) || nodes.length === 0) return {};
  const root = nodes.find((n) => n.type === "root");
  if (!root) return {};

  const index = indexNodes(nodes);
  const useLarge = large === undefined ? nodes.length > SCALE_SAFE_AT : large;
  const pos = useLarge
    ? largeLayout(graphStyle, root, index)
    : smallLayout(graphStyle, root, index);

  // Normalise so nothing sits at a negative coordinate.
  const values = Object.values(pos);
  if (values.length > 0) {
    let minX = Infinity;
    let minY = Infinity;
    values.forEach((p) => {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
    });
    const shiftX = PAD - minX;
    const shiftY = PAD - minY;
    if (shiftX !== 0 || shiftY !== 0) {
      Object.keys(pos).forEach((id) => {
        pos[id] = { x: pos[id].x + shiftX, y: pos[id].y + shiftY };
      });
    }
  }

  return pos;
};

/** Zoom that fits `bounds` inside a viewport, clamped to the shared limits. */
export const fitZoom = (bounds, viewportW, viewportH, max = 1.2) => {
  if (!bounds || !viewportW || !viewportH) return 1;
  const margin = 80;
  const z = Math.min(
    viewportW / (bounds.width + margin),
    viewportH / (bounds.height + margin),
    max,
  );
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
};
