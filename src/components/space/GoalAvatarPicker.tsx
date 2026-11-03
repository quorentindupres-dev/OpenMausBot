import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { createPortal } from "react-dom";
import { ImagePlus, SmilePlus, Trash2 } from "lucide-react";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import type { SpaceGoal } from "../../../shared/space";

export const GOAL_QUICK_EMOJIS = [
  "🎯", "🚀", "🔥", "⚡", "💰", "🧠", "🛠️", "📦",
  "🎨", "📈", "🛡️", "🤖", "🌟", "🧪", "📌", "✅",
] as const;

const MAX_AVATAR_PX = 128;

export function isImageIcon(icon?: string | null): boolean {
  if (!icon) return false;
  return icon.startsWith("data:image/") || icon.startsWith("http://") || icon.startsWith("https://") || icon.startsWith("/");
}

export async function readImageFileAsDataUrl(file: File): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("Could not read image file"));
    reader.readAsDataURL(file);
  });
  if (typeof document === "undefined" || typeof window === "undefined" || "happyDOM" in window) return raw;
  const probe = document.createElement("canvas");
  if (typeof probe.getContext !== "function" || !probe.getContext("2d")) return raw;
  return new Promise<string>((resolve) => {
    const img = new Image();
    const timer = window.setTimeout(() => resolve(raw), 300);
    img.onload = () => {
      window.clearTimeout(timer);
      const width = img.naturalWidth || img.width || MAX_AVATAR_PX;
      const height = img.naturalHeight || img.height || MAX_AVATAR_PX;
      const scale = Math.min(1, MAX_AVATAR_PX / Math.max(width, height));
      const w = Math.max(1, Math.round(width * scale));
      const h = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(raw); return; }
      ctx.drawImage(img, 0, 0, w, h);
      const scaled = canvas.toDataURL("image/webp", 0.86);
      resolve(scaled.startsWith("data:image/") && scaled.length <= 300_000 ? scaled : raw);
    };
    img.onerror = () => { window.clearTimeout(timer); resolve(raw); };
    img.src = raw;
  });
}

export function GoalAvatarPicker({ goal, onChange }: { goal: SpaceGoal; onChange(icon: string | null): void }) {
  const [open, setOpen] = useState(false);
  const [customEmoji, setCustomEmoji] = useState("");
  const [coords, setCoords] = useState({ left: 8, top: 8 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setCoords({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 248)),
        top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 260)),
      });
    }
    const outside = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", outside);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("mousedown", outside);
      window.removeEventListener("keydown", escape);
    };
  }, [open]);

  const pickFile = async (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    const dataUrl = await readImageFileAsDataUrl(file);
    if (dataUrl) {
      onChange(dataUrl);
      setOpen(false);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    void pickFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    const file = event.dataTransfer?.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    event.preventDefault();
    event.stopPropagation();
    void pickFile(file);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-goal-avatar={goal.id}
        aria-label={t("quest.avatar.aria", { title: goal.title })}
        title={t("quest.avatar.hint")}
        onClick={(event) => { event.stopPropagation(); setOpen((prev) => !prev); }}
        onDragOver={(event) => {
          if (event.dataTransfer?.files?.[0]?.type.startsWith("image/")) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onDrop={handleDrop}
        className={cn(
          "flex size-[30px] shrink-0 items-center justify-center rounded-lg border border-hairline/50 bg-card hover:bg-control focus-visible:outline-2 focus-visible:outline-accent",
        )}
      >
        {isImageIcon(goal.icon) ? (
          <img src={goal.icon} alt="" className="size-full rounded-lg object-cover" />
        ) : goal.icon ? (
          <span className="text-[16px] leading-none">{goal.icon}</span>
        ) : (
          <SmilePlus size={14} className="text-ink-secondary" />
        )}
      </button>
      {open && createPortal(
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={t("quest.avatar.aria", { title: goal.title })}
          data-goal-avatar-menu={goal.id}
          onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); }}
          onDrop={handleDrop}
          style={{ left: coords.left, top: coords.top, width: 240 }}
          className="fixed z-50 rounded-xl border border-hairline/60 bg-panel p-2.5 text-ink shadow-xl"
        >
          <div className="grid grid-cols-8 gap-1">
            {GOAL_QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                data-goal-emoji={emoji}
                onClick={() => { onChange(emoji); setOpen(false); }}
                className={cn(
                  "flex size-6 items-center justify-center rounded-md text-[15px] hover:bg-control",
                  goal.icon === emoji && "bg-control ring-1 ring-accent",
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
          <form
            className="mt-2 flex gap-1"
            onSubmit={(event) => {
              event.preventDefault();
              if (customEmoji.trim()) {
                onChange(customEmoji.trim());
                setCustomEmoji("");
                setOpen(false);
              }
            }}
          >
            <input
              value={customEmoji}
              maxLength={16}
              onChange={(event) => setCustomEmoji(event.target.value)}
              placeholder={t("quest.avatar.customEmoji")}
              aria-label={t("quest.avatar.customEmoji")}
              className="min-w-0 flex-1 rounded-md border border-hairline/60 bg-app px-2 py-1 text-[12px] outline-none focus:border-accent/60"
            />
            <button type="submit" className="rounded-md bg-control px-2 py-1 text-[11.5px] font-medium hover:bg-card">
              {t("common.add")}
            </button>
          </form>
          <div className="mt-2 flex items-center gap-1.5 border-t border-hairline/40 pt-2">
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" data-goal-avatar-file={goal.id} />
            <button
              type="button"
              data-goal-avatar-upload={goal.id}
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-hairline/60 bg-card px-2 py-1.5 text-[11.5px] font-medium hover:bg-control"
            >
              <ImagePlus size={13} />
              {t("quest.avatar.upload")}
            </button>
            {goal.icon && (
              <button
                type="button"
                data-goal-avatar-clear={goal.id}
                onClick={() => { onChange(null); setOpen(false); }}
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11.5px] font-medium text-danger hover:bg-danger/10"
              >
                <Trash2 size={13} />
                {t("quest.avatar.clear")}
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
