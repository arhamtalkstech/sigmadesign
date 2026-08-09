import type { FigGuid, FigNodeChange } from "@alteron/fig-format";
import { guidToString } from "@alteron/fig-format";

export type ChildMap = Map<string, Array<{ id: string; position: string }>>;

function guidKey(g?: FigGuid | null): string | null {
  if (!g || g.sessionID == null || g.localID == null) return null;
  return `${g.sessionID}:${g.localID}`;
}

function cloneJson<T>(v: T): T {
  return structuredClone(v);
}

/**
 * Design archives store INSTANCE nodes without children in the flat node list.
 * Children live on the SYMBOL/COMPONENT master (symbolData.symbolID).
 *
 * expandAllInstances clones each master under every instance so the canvas can
 * draw real content (sidebars, buttons, Lucide icons, etc.).
 *
 * Synthetic clone ids use session 99 (e.g. 99:900000001). Component property
 * assignments (TEXT_DATA, VISIBLE, OVERRIDDEN_SYMBOL_ID) are applied so icon
 * slots swap to the correct masters instead of defaults.
 */
export function expandAllInstances(
  nodes: FigNodeChange[],
  childMap: ChildMap
): { nodes: FigNodeChange[]; childMap: ChildMap } {
  const byId = new Map<string, FigNodeChange>();
  for (const n of nodes) byId.set(guidToString(n.guid), n);

  // Work on mutable copies
  const outNodes = new Map<string, FigNodeChange>();
  for (const n of nodes) {
    outNodes.set(guidToString(n.guid), cloneJson(n));
  }
  const outChildren: ChildMap = new Map();
  for (const [k, list] of childMap) {
    outChildren.set(
      k,
      list.map((c) => ({ ...c }))
    );
  }

  let syntheticLocal = 900_000_000;
  const nextGuid = (): FigGuid => ({
    sessionID: 99,
    localID: ++syntheticLocal,
  });

  const MAX_DEPTH = 16;
  let expandedCount = 0;

  function getChildren(id: string): Array<{ id: string; position: string }> {
    return outChildren.get(id) ?? [];
  }

  function setChildren(
    id: string,
    kids: Array<{ id: string; position: string }>
  ) {
    outChildren.set(id, kids);
  }

  /**
   * Expand a single instance node in place (mutates outNodes/outChildren).
   * Returns true if expansion happened.
   */
  function expandInstance(
    instanceId: string,
    depth: number,
    symbolStack: Set<string>
  ): boolean {
    if (depth > MAX_DEPTH) return false;
    const inst = outNodes.get(instanceId);
    if (!inst || inst.type !== "INSTANCE") return false;

    // Already expanded?
    if ((getChildren(instanceId).length ?? 0) > 0) return false;

    const symbolId = guidKey(inst.symbolData?.symbolID as FigGuid);
    if (!symbolId) return false;
    if (symbolStack.has(symbolId)) return false; // cycle

    const master = outNodes.get(symbolId) ?? byId.get(symbolId);
    if (!master || (master.type !== "SYMBOL" && master.type !== "COMPONENT")) {
      // try original byId for masters that might only be in original set
      return false;
    }

    // Ensure master exists in outNodes
    if (!outNodes.has(symbolId)) {
      outNodes.set(symbolId, cloneJson(master));
    }

    const masterKids = childMap.get(symbolId) ?? outChildren.get(symbolId) ?? [];
    if (masterKids.length === 0) return false;

    symbolStack.add(symbolId);

    // Map original id → cloned id for this expansion
    const idMap = new Map<string, string>();
    // overrideKey string → cloned node id (for path matching)
    const overrideKeyToId = new Map<string, string>();

    // Collect all descendants of master (non-expanded instance leaves stay as instances for recursive expand)
    const toClone: string[] = [];
    const visitCollect = (id: string) => {
      toClone.push(id);
      const n = outNodes.get(id) ?? byId.get(id);
      if (!n) return;
      // Don't walk into nested instance masters yet — clone the instance node itself
      if (n.type === "INSTANCE") return;
      const kids = childMap.get(id) ?? outChildren.get(id) ?? [];
      for (const k of kids) visitCollect(k.id);
    };
    for (const k of masterKids) visitCollect(k.id);

    // Create cloned nodes
    for (const origId of toClone) {
      const src = outNodes.get(origId) ?? byId.get(origId);
      if (!src) continue;
      const newGuid = nextGuid();
      const newId = guidToString(newGuid);
      idMap.set(origId, newId);

      const cloned = cloneJson(src);
      cloned.guid = newGuid;
      // Keep overrideKey for matching instance overrides
      outNodes.set(newId, cloned);

      const ok = guidKey(src.overrideKey as FigGuid);
      if (ok) overrideKeyToId.set(ok, newId);
    }

    // Rebuild child links for cloned subtree
    for (const origId of toClone) {
      const newId = idMap.get(origId);
      if (!newId) continue;
      const src = byId.get(origId) ?? outNodes.get(origId);
      if (!src) continue;

      if (src.type === "INSTANCE") {
        // Nested instance: no master children yet; expand recursively after wiring
        setChildren(newId, []);
        continue;
      }

      const srcKids = childMap.get(origId) ?? outChildren.get(origId) ?? [];
      const mappedKids = srcKids
        .map((k) => {
          const cid = idMap.get(k.id);
          return cid ? { id: cid, position: k.position } : null;
        })
        .filter((x): x is { id: string; position: string } => Boolean(x));
      setChildren(newId, mappedKids);

      // Fix parentIndex on cloned children
      for (const k of mappedKids) {
        const child = outNodes.get(k.id);
        if (child) {
          child.parentIndex = {
            guid: outNodes.get(newId)!.guid,
            position: k.position,
          };
        }
      }
    }

    // Wire master's direct children under the instance
    const instanceKids = masterKids
      .map((k) => {
        const cid = idMap.get(k.id);
        return cid ? { id: cid, position: k.position } : null;
      })
      .filter((x): x is { id: string; position: string } => Boolean(x));
    setChildren(instanceId, instanceKids);
    for (const k of instanceKids) {
      const child = outNodes.get(k.id);
      if (child) {
        child.parentIndex = {
          guid: inst.guid,
          position: k.position,
        };
      }
    }

    // Scale cloned subtree when instance applies uniformScaleFactor
    const scale =
      (inst.symbolData as { uniformScaleFactor?: number } | undefined)
        ?.uniformScaleFactor ?? 1;
    if (scale && Math.abs(scale - 1) > 1e-4) {
      const scaleNode = (id: string) => {
        const n = outNodes.get(id);
        if (!n) return;
        if (n.transform) {
          n.transform = {
            ...n.transform,
            m02: (n.transform.m02 ?? 0) * scale,
            m12: (n.transform.m12 ?? 0) * scale,
          };
        }
        if (n.size) {
          n.size = {
            x: (n.size.x ?? 0) * scale,
            y: (n.size.y ?? 0) * scale,
          };
        }
        if (typeof n.strokeWeight === "number") {
          n.strokeWeight = n.strokeWeight * scale;
        }
        if (typeof n.fontSize === "number") {
          n.fontSize = n.fontSize * scale;
        }
        if (typeof n.cornerRadius === "number") {
          n.cornerRadius = n.cornerRadius * scale;
        }
        for (const c of getChildren(id)) scaleNode(c.id);
      };
      for (const k of instanceKids) scaleNode(k.id);
    }

    // Apply derivedSymbolData (baked overrides: size, transform, geometry refs)
    applyDerivedSymbolData(inst, overrideKeyToId, outNodes);

    // Apply symbol overrides on this instance
    applyOverrides(inst, overrideKeyToId, idMap, outNodes);

    // Apply component prop assignments from instance-level and nested overrides
    applyComponentProps(inst, overrideKeyToId, outNodes);

    // Recursively expand nested instances
    const expandNested = (id: string, d: number) => {
      const n = outNodes.get(id);
      if (!n) return;
      if (n.type === "INSTANCE") {
        expandInstance(id, d + 1, new Set(symbolStack));
        return;
      }
      for (const k of getChildren(id)) expandNested(k.id, d);
    };
    for (const k of instanceKids) expandNested(k.id, depth);

    symbolStack.delete(symbolId);
    expandedCount++;
    return true;
  }

  /**
   * guidPath is a chain of overrideKeys from the current instance root downward.
   * Only the first segment is resolved at this expansion level. Deeper segments
   * are re-attached onto nested INSTANCE nodes so they apply when those expand.
   * (Matching the last key incorrectly applied icon swaps to whole menu items.)
   */
  function applyOverrides(
    inst: FigNodeChange,
    overrideKeyToId: Map<string, string>,
    idMap: Map<string, string>,
    outNodes: Map<string, FigNodeChange>
  ) {
    const overs = (
      inst.symbolData as { symbolOverrides?: Array<Record<string, unknown>> }
    )?.symbolOverrides;
    if (!Array.isArray(overs)) return;

    for (const raw of overs) {
      const o = raw as {
        guidPath?: { guids?: FigGuid[] };
        overriddenSymbolID?: FigGuid;
        componentPropAssignments?: unknown[];
        textData?: { characters?: string };
        fillPaints?: unknown;
        strokePaints?: unknown;
        size?: { x: number; y: number };
        fontSize?: number;
        fontName?: unknown;
        visible?: boolean;
        opacity?: number;
        strokeWeight?: number;
        [key: string]: unknown;
      };
      const path = o.guidPath?.guids ?? [];
      if (!path.length) continue;

      const firstKey = guidKey(path[0]!);
      if (!firstKey) continue;
      const targetId = overrideKeyToId.get(firstKey);
      if (!targetId) continue;
      const target = outNodes.get(targetId);
      if (!target) continue;

      // Nested path → defer remaining override onto nested instance
      if (path.length > 1) {
        if (target.type === "INSTANCE") {
          if (!target.symbolData) {
            target.symbolData = {
              symbolID: (target.symbolData as { symbolID?: FigGuid } | undefined)
                ?.symbolID,
            };
          }
          const sd = target.symbolData as {
            symbolID?: FigGuid;
            symbolOverrides?: Array<Record<string, unknown>>;
          };
          const nested = {
            ...cloneJson(raw),
            guidPath: { guids: path.slice(1) },
          };
          sd.symbolOverrides = [...(sd.symbolOverrides ?? []), nested];
        }
        continue;
      }

      // Single-segment path → apply to this target
      if (o.overriddenSymbolID) {
        if (!target.symbolData) target.symbolData = {};
        (target.symbolData as { symbolID?: FigGuid }).symbolID =
          o.overriddenSymbolID;
        setChildren(targetId, []);
      }

      if (o.fillPaints !== undefined) target.fillPaints = o.fillPaints as never;
      if (o.strokePaints !== undefined)
        target.strokePaints = o.strokePaints as never;
      if (o.size) target.size = o.size;
      if (o.fontSize != null) target.fontSize = o.fontSize;
      if (o.fontName) target.fontName = o.fontName as never;
      if (o.textData) target.textData = o.textData as never;
      if (o.visible != null) target.visible = o.visible;
      if (o.opacity != null) target.opacity = o.opacity;
      if (o.strokeWeight != null) target.strokeWeight = o.strokeWeight;

      if (
        Array.isArray(o.componentPropAssignments) &&
        target.type === "INSTANCE"
      ) {
        // Merge with any existing assignments on the nested instance
        const existing =
          (target.componentPropAssignments as unknown[] | undefined) ?? [];
        target.componentPropAssignments = [
          ...existing,
          ...o.componentPropAssignments,
        ] as never;
      }
    }

    void idMap;
  }

  function applyComponentProps(
    inst: FigNodeChange,
    overrideKeyToId: Map<string, string>,
    outNodes: Map<string, FigNodeChange>
  ) {
    // Direct assignments on this instance → its expanded descendants
    applyPropAssignments(
      inst.componentPropAssignments as PropAssignment[] | undefined,
      collectDescendants(inst.guid ? guidToString(inst.guid) : "", outNodes),
      outNodes
    );

    // Single-segment overrides that only carry prop assignments (already merged
    // onto nested instances as componentPropAssignments above). Also apply any
    // still listed on the parent override list for descendants of that target.
    const overs = (
      inst.symbolData as { symbolOverrides?: Array<Record<string, unknown>> }
    )?.symbolOverrides;
    if (!Array.isArray(overs)) return;
    for (const raw of overs) {
      const o = raw as {
        guidPath?: { guids?: FigGuid[] };
        componentPropAssignments?: PropAssignment[];
      };
      if (!o.componentPropAssignments?.length) continue;
      const path = o.guidPath?.guids ?? [];
      if (path.length !== 1) continue; // nested handled via merge onto child instance
      const firstKey = guidKey(path[0]!);
      const targetId = firstKey ? overrideKeyToId.get(firstKey) : null;
      if (!targetId) continue;
      applyPropAssignments(
        o.componentPropAssignments,
        collectDescendants(targetId, outNodes),
        outNodes
      );
    }
  }

  function collectDescendants(
    rootId: string,
    outNodes: Map<string, FigNodeChange>
  ): string[] {
    const desc: string[] = [];
    const walk = (id: string) => {
      if (!outNodes.has(id) && id) return;
      desc.push(id);
      for (const k of getChildren(id)) walk(k.id);
    };
    if (rootId) walk(rootId);
    return desc;
  }

  type PropAssignment = {
    defID?: FigGuid;
    value?: {
      boolValue?: boolean;
      textValue?: { characters?: string };
      /** Instance-swap target (component property type INSTANCE_SWAP / SYMBOL_ID) */
      symbolIdValue?: { guid?: FigGuid };
    };
    varValue?: {
      value?: {
        boolValue?: boolean;
        textDataValue?: { characters?: string };
        textValue?: { characters?: string };
        symbolIdValue?: { guid?: FigGuid };
      };
      dataType?: string;
    };
  };

  /** Resolve SYMBOL_ID / instance-swap target from a prop assignment. */
  function symbolIdFromAssignment(a: PropAssignment): FigGuid | null {
    // Assignments are loosely typed from kiwi; guid may be FigGuid or "s:l" string
    const raw: unknown =
      (a.varValue?.value?.symbolIdValue as { guid?: unknown } | undefined)
        ?.guid ??
      (a.value?.symbolIdValue as { guid?: unknown } | undefined)?.guid ??
      null;
    if (!raw) return null;
    if (typeof raw === "string") {
      const m = /^(\d+):(\d+)$/.exec(raw);
      if (!m) return null;
      return { sessionID: Number(m[1]), localID: Number(m[2]) };
    }
    if (
      typeof raw === "object" &&
      raw !== null &&
      "sessionID" in raw &&
      "localID" in raw &&
      (raw as FigGuid).sessionID != null &&
      (raw as FigGuid).localID != null
    ) {
      return raw as FigGuid;
    }
    return null;
  }

  function applyDerivedSymbolData(
    inst: FigNodeChange,
    overrideKeyToId: Map<string, string>,
    outNodes: Map<string, FigNodeChange>
  ) {
    const derived = inst.derivedSymbolData as
      | Array<Record<string, unknown>>
      | undefined;
    if (!Array.isArray(derived)) return;

    /**
     * Critical: only apply when the FULL guidPath resolves inside this expansion.
     * Using the deepest *available* key incorrectly applied nested icon
     * size/transform (e.g. 18×18) onto the parent menu-item instance (232×40),
     * collapsing sidebars to scattered icons with missing labels.
     *
     * Multi-segment paths that cannot fully resolve are forwarded onto the
     * nested INSTANCE matched by the first segment (applied when that expands).
     */
    for (const d of derived) {
      const guids = (d.guidPath as { guids?: FigGuid[] } | undefined)?.guids;
      if (!guids?.length) continue;

      const keys = guids.map((g) => guidKey(g)).filter(Boolean) as string[];
      if (!keys.length) continue;

      // Fully resolvable path within this expansion's clones
      const allInMap = keys.every((k) => overrideKeyToId.has(k));
      if (allInMap) {
        // Apply to the deepest node (leaf of the path)
        const targetId = overrideKeyToId.get(keys[keys.length - 1]!)!;
        const target = outNodes.get(targetId);
        if (!target) continue;
        applyDerivedFields(target, d);
        continue;
      }

      // Single-segment missing → skip
      if (keys.length === 1) continue;

      // Nested: first segment must be a cloned INSTANCE; re-attach remaining path
      const firstId = overrideKeyToId.get(keys[0]!);
      if (!firstId) continue;
      const nested = outNodes.get(firstId);
      if (!nested || nested.type !== "INSTANCE") continue;

      const restGuids = guids.slice(1);
      const existing = (nested.derivedSymbolData as Array<Record<string, unknown>> | undefined) ?? [];
      nested.derivedSymbolData = [
        ...existing,
        {
          ...cloneJson(d),
          guidPath: { guids: restGuids },
        },
      ];
    }
  }

  function applyDerivedFields(
    target: FigNodeChange,
    d: Record<string, unknown>
  ) {
    if (d.size) target.size = d.size as { x: number; y: number };
    if (d.transform) target.transform = d.transform as never;
    if (d.strokeWeight != null) target.strokeWeight = d.strokeWeight as number;
    if (d.fillPaints) target.fillPaints = d.fillPaints as never;
    if (d.strokePaints) target.strokePaints = d.strokePaints as never;
    if (d.fillGeometry) target.fillGeometry = d.fillGeometry as never;
    if (d.strokeGeometry) target.strokeGeometry = d.strokeGeometry as never;
    if (d.fontSize != null) target.fontSize = d.fontSize as number;
    if (d.fontName) target.fontName = d.fontName as never;
    if (d.textData) target.textData = d.textData as never;
    if (d.visible != null) target.visible = d.visible as boolean;
    if (d.opacity != null) target.opacity = d.opacity as number;
    if (d.effects) target.effects = d.effects as never;
  }

  function applyPropAssignments(
    assignments: PropAssignment[] | undefined,
    nodeIds: string[],
    outNodes: Map<string, FigNodeChange>
  ) {
    if (!assignments?.length) return;

    const byDef = new Map<string, PropAssignment>();
    for (const a of assignments) {
      const id = guidKey(a.defID ?? null);
      if (id) byDef.set(id, a);
    }

    for (const nid of nodeIds) {
      const n = outNodes.get(nid);
      if (!n) continue;
      const refs = n.componentPropRefs as
        | Array<{
            defID?: FigGuid;
            componentPropNodeField?: string;
          }>
        | undefined;
      if (!refs?.length) continue;

      for (const ref of refs) {
        const defId = guidKey(ref.defID ?? null);
        if (!defId) continue;
        const assignment = byDef.get(defId);
        if (!assignment) continue;
        const field = ref.componentPropNodeField;

        const text =
          assignment.varValue?.value?.textDataValue?.characters ??
          assignment.varValue?.value?.textValue?.characters ??
          assignment.value?.textValue?.characters;
        const bool =
          assignment.varValue?.value?.boolValue ?? assignment.value?.boolValue;

        if (field === "TEXT_DATA" && text != null) {
          n.textData = {
            ...(n.textData ?? {}),
            characters: text,
          };
          if (!n.name || n.name === "Menu Item" || n.name === "Button" || n.name === "Text") {
            n.name = text.slice(0, 40);
          }
        }
        if (field === "VISIBLE" && bool != null) {
          n.visible = bool;
        }
        // Instance swap: Icon Leading/Trailing slots → real Lucide components
        // (without this, every slot keeps the master's default circle-help / ?)
        if (
          (field === "OVERRIDDEN_SYMBOL_ID" || field === "SYMBOL_ID") &&
          n.type === "INSTANCE"
        ) {
          const swapTo = symbolIdFromAssignment(assignment);
          if (swapTo) {
            const current = guidKey(
              (n.symbolData as { symbolID?: FigGuid } | undefined)?.symbolID
            );
            const next = guidKey(swapTo);
            // Only rewrite + clear children when the target actually changes.
            // A later post-pass re-applies the same props; wiping matching
            // children left every swapped icon empty.
            if (current !== next) {
              if (!n.symbolData) n.symbolData = {};
              (n.symbolData as { symbolID?: FigGuid }).symbolID = swapTo;
              setChildren(nid, []);
            }
          }
        }
      }
    }
  }

  function expandAllEmpty(maxPasses = 4) {
    for (let pass = 0; pass < maxPasses; pass++) {
      const ids = [...outNodes.keys()];
      let did = false;
      for (const id of ids) {
        const n = outNodes.get(id);
        if (n?.type === "INSTANCE" && getChildren(id).length === 0) {
          if (expandInstance(id, 0, new Set())) did = true;
        }
      }
      if (!did) break;
    }
  }

  // Expand every INSTANCE that currently has no children
  expandAllEmpty(3);

  // Also apply component props after full expansion for top-level instances
  // (text/visibility on nested nodes; instance-swaps only clear when symbol changes)
  for (const [id, n] of outNodes) {
    if (n.type !== "INSTANCE") continue;
    // rebuild overrideKey map from children
    const okMap = new Map<string, string>();
    const walk = (cid: string) => {
      const cn = outNodes.get(cid);
      if (!cn) return;
      const ok = guidKey(cn.overrideKey as FigGuid);
      if (ok) okMap.set(ok, cid);
      for (const k of getChildren(cid)) walk(k.id);
    };
    for (const k of getChildren(id)) walk(k.id);
    applyComponentProps(n, okMap, outNodes);
  }

  // Re-expand any slots cleared by a genuine symbol swap in the post-pass
  expandAllEmpty(3);

  console.info(
    `[fig-import] expanded ${expandedCount} component instances into concrete subtrees`
  );

  return {
    nodes: [...outNodes.values()],
    childMap: outChildren,
  };
}
