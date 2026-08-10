/**
 * Document comments / pins — create, resolve, and load from import payloads.
 */
import type { AlteronDocument, DocumentComment, NodeId } from "./types.js";
import { nextLocalId } from "./create-node.js";

export function ensureComments(doc: AlteronDocument): AlteronDocument {
  return { ...doc, comments: doc.comments ?? {} };
}

export function createComment(
  doc: AlteronDocument,
  x: number,
  y: number,
  message: string,
  options?: { author?: string; nodeId?: NodeId; pageId?: NodeId }
): { doc: AlteronDocument; commentId: string } {
  const next = ensureComments(doc);
  const id = nextLocalId("cmt");
  const comment: DocumentComment = {
    id,
    x,
    y,
    message: message.trim() || "Comment",
    author: options?.author ?? "You",
    createdAt: Date.now(),
    resolved: false,
    nodeId: options?.nodeId,
    pageId: options?.pageId ?? doc.currentPageId ?? undefined,
    replies: [],
  };
  return {
    doc: {
      ...next,
      comments: { ...next.comments, [id]: comment },
    },
    commentId: id,
  };
}

export function updateCommentMessage(
  doc: AlteronDocument,
  commentId: string,
  message: string
): AlteronDocument {
  const c = doc.comments?.[commentId];
  if (!c) return doc;
  return {
    ...doc,
    comments: {
      ...doc.comments,
      [commentId]: { ...c, message: message.trim() || c.message },
    },
  };
}

export function resolveComment(
  doc: AlteronDocument,
  commentId: string,
  resolved = true
): AlteronDocument {
  const c = doc.comments?.[commentId];
  if (!c) return doc;
  return {
    ...doc,
    comments: {
      ...doc.comments,
      [commentId]: { ...c, resolved },
    },
  };
}

export function deleteComment(
  doc: AlteronDocument,
  commentId: string
): AlteronDocument {
  if (!doc.comments?.[commentId]) return doc;
  const comments = { ...doc.comments };
  delete comments[commentId];
  return { ...doc, comments };
}

export function addCommentReply(
  doc: AlteronDocument,
  commentId: string,
  message: string,
  author = "You"
): AlteronDocument {
  const c = doc.comments?.[commentId];
  if (!c) return doc;
  const reply = {
    id: nextLocalId("rpl"),
    message: message.trim() || "Reply",
    author,
    createdAt: Date.now(),
  };
  return {
    ...doc,
    comments: {
      ...doc.comments,
      [commentId]: {
        ...c,
        replies: [...(c.replies ?? []), reply],
      },
    },
  };
}

/**
 * Map loose comment payloads from a decoded fig-kiwi message (or similar)
 * into ADM comments. Tolerates missing/unknown shapes.
 */
export function commentsFromImportPayload(
  message: Record<string, unknown> | null | undefined,
  pageId?: NodeId | null
): Record<string, DocumentComment> {
  const out: Record<string, DocumentComment> = {};
  if (!message || typeof message !== "object") return out;

  const rawLists: unknown[] = [];
  for (const key of [
    "comments",
    "commentData",
    "commentPins",
    "threads",
  ] as const) {
    const v = message[key];
    if (Array.isArray(v)) rawLists.push(...v);
  }

  // Some payloads nest under session or meta
  const session = message.session as Record<string, unknown> | undefined;
  if (session && Array.isArray(session.comments)) {
    rawLists.push(...session.comments);
  }

  let i = 0;
  for (const raw of rawLists) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const id =
      (typeof r.id === "string" && r.id) ||
      (typeof r.guid === "string" && r.guid) ||
      `import_cmt_${i++}`;
    const messageText =
      (typeof r.message === "string" && r.message) ||
      (typeof r.text === "string" && r.text) ||
      (typeof r.body === "string" && r.body) ||
      "Comment";
    const x =
      typeof r.x === "number"
        ? r.x
        : typeof (r.position as { x?: number })?.x === "number"
          ? (r.position as { x: number }).x
          : 0;
    const y =
      typeof r.y === "number"
        ? r.y
        : typeof (r.position as { y?: number })?.y === "number"
          ? (r.position as { y: number }).y
          : 0;
    const createdAt =
      typeof r.createdAt === "number"
        ? r.createdAt
        : typeof r.created_at === "number"
          ? r.created_at
          : Date.now();
    out[id] = {
      id,
      x,
      y,
      message: messageText,
      author:
        typeof r.author === "string"
          ? r.author
          : typeof r.userName === "string"
            ? r.userName
            : typeof (r.user as { name?: string })?.name === "string"
              ? (r.user as { name: string }).name
              : undefined,
      createdAt,
      resolved: Boolean(r.resolved ?? r.isResolved),
      nodeId: typeof r.nodeId === "string" ? r.nodeId : undefined,
      pageId:
        typeof r.pageId === "string"
          ? r.pageId
          : pageId ?? undefined,
      replies: Array.isArray(r.replies)
        ? (r.replies as Array<Record<string, unknown>>).map((rep, j) => ({
            id: typeof rep.id === "string" ? rep.id : `${id}_r${j}`,
            message:
              typeof rep.message === "string"
                ? rep.message
                : typeof rep.text === "string"
                  ? rep.text
                  : "",
            author: typeof rep.author === "string" ? rep.author : undefined,
            createdAt:
              typeof rep.createdAt === "number" ? rep.createdAt : Date.now(),
          }))
        : [],
    };
  }
  return out;
}

export function mergeImportedComments(
  doc: AlteronDocument,
  comments: Record<string, DocumentComment>
): AlteronDocument {
  if (!Object.keys(comments).length) return doc;
  return {
    ...doc,
    comments: { ...(doc.comments ?? {}), ...comments },
  };
}
