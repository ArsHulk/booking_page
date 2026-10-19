"use client";

export type AdminNoticeState = {
  message: string;
  tone: "error" | "success";
  canUndo?: boolean;
} | null;

export function AdminNotice({
  notice,
  onUndo,
  onDismiss,
}: {
  notice: AdminNoticeState;
  onUndo?: () => void;
  onDismiss: () => void;
}) {
  if (!notice) return null;

  return (
    <div
      className={`admin-toast ${notice.tone} ${notice.canUndo ? "has-undo" : ""}`}
      role={notice.tone === "error" ? "alert" : "status"}
      aria-live={notice.tone === "error" ? "assertive" : "polite"}
    >
      <span>{notice.message}</span>
      {notice.canUndo && onUndo ? <button onClick={onUndo} type="button">Undo</button> : null}
      <button className="admin-toast-close" onClick={onDismiss} type="button" aria-label="Dismiss message">×</button>
    </div>
  );
}
