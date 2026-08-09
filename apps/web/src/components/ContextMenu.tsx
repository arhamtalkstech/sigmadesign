"use client";

import { useEffect, useRef } from "react";
import {
  CONTEXT_MENU_ITEMS,
  type ContextMenuActionId,
} from "@/lib/context-menu-actions";
import { ChromeIcons, Icon } from "@/lib/chrome-icons";

const ACTION_ICONS: Record<ContextMenuActionId, typeof ChromeIcons.PanelRight> =
  {
    "edit-properties": ChromeIcons.PanelRight,
    "toggle-visibility": ChromeIcons.Eye,
    duplicate: ChromeIcons.Copy,
    "bring-to-front": ChromeIcons.BringToFront,
    "send-to-back": ChromeIcons.SendToBack,
    delete: ChromeIcons.Trash2,
  };

export type ContextMenuState = {
  x: number;
  y: number;
  targetId: string;
};

type Props = {
  menu: ContextMenuState;
  onAction: (action: ContextMenuActionId) => void;
  onClose: () => void;
};

export function ContextMenu({ menu, onAction, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  // Keep menu on-screen
  const maxX =
    typeof window !== "undefined" ? window.innerWidth - 220 : menu.x;
  const maxY =
    typeof window !== "undefined" ? window.innerHeight - 280 : menu.y;
  const left = Math.min(menu.x, maxX);
  const top = Math.min(menu.y, maxY);

  return (
    <div
      ref={ref}
      className="sigma-context-menu"
      role="menu"
      style={{ left, top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {CONTEXT_MENU_ITEMS.map((item) => (
        <div key={item.id}>
          <button
            type="button"
            role="menuitem"
            className={`sigma-context-item ${item.danger ? "danger" : ""}`}
            onClick={() => {
              onAction(item.id);
              onClose();
            }}
          >
            <span className="sigma-context-icon">
              <Icon icon={ACTION_ICONS[item.id]} size={15} />
            </span>
            {item.label}
          </button>
          {item.separatorAfter && <div className="sigma-context-sep" />}
        </div>
      ))}
    </div>
  );
}
