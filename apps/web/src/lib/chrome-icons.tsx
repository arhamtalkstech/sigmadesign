/**
 * Lucide icon map for SigmaDesign chrome (tools + layer types).
 * No emoji in product chrome.
 */
"use client";

import type { LucideIcon } from "lucide-react";
import {
  MousePointer2,
  Hand,
  Frame,
  Square,
  Circle,
  Type,
  PenTool,
  MessageSquare,
  Folder,
  Group,
  LayoutTemplate,
  Minus,
  VectorSquare,
  Component,
  Copy,
  Blend,
  File,
  HelpCircle,
  ChevronRight,
  ChevronDown,
  Eye,
  EyeOff,
  Trash2,
  BringToFront,
  SendToBack,
  PanelRight,
  Upload,
  Plus,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  Library,
  Import,
  X,
} from "lucide-react";
import type { Tool } from "@/store/document-store";

const size = 16;
const stroke = 1.75;

export function Icon({
  icon: Ico,
  size: s = size,
  className,
}: {
  icon: LucideIcon;
  size?: number;
  className?: string;
}) {
  return (
    <Ico
      size={s}
      strokeWidth={stroke}
      className={className}
      aria-hidden
    />
  );
}

export const TOOL_ICONS: Record<Tool, LucideIcon> = {
  move: MousePointer2,
  hand: Hand,
  frame: Frame,
  rectangle: Square,
  ellipse: Circle,
  text: Type,
  pen: PenTool,
  comment: MessageSquare,
};

export const LAYER_TYPE_ICONS: Record<string, LucideIcon> = {
  FRAME: Frame,
  GROUP: Group,
  SECTION: LayoutTemplate,
  RECTANGLE: Square,
  ELLIPSE: Circle,
  LINE: Minus,
  VECTOR: VectorSquare,
  TEXT: Type,
  COMPONENT: Component,
  INSTANCE: Copy,
  BOOLEAN_OPERATION: Blend,
  PAGE: File,
  UNKNOWN: HelpCircle,
  FOLDER: Folder,
};

export const ChromeIcons = {
  ChevronRight,
  ChevronDown,
  Eye,
  EyeOff,
  Trash2,
  BringToFront,
  SendToBack,
  PanelRight,
  Upload,
  Plus,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  Library,
  Import,
  X,
  MousePointer2,
  Copy,
};
