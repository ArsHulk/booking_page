"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  AdminSlot,
  dateKey,
  formatDay,
  formatLongSlot,
  formatTime,
  formatWeek,
  minutesInTeacherZone,
  rowLabel,
  slotDateKey,
  startOfWeek,
  timeRows,
  timestampFor,
  weekDays,
  weekRange,
} from "../../lib/calendar";
import { AdminNotice, AdminNoticeState } from "./AdminNotice";

const ROW_HEIGHT = 40;
const REFRESH_INTERVAL = 45_000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type CompletionAction = "complete" | "uncomplete";
type UndoAction = {
  kind: "completion";
  slotId: string;
  action: CompletionAction;
  successMessage: string;
} | {
  kind: "remove_availability";
  slotIds: string[];
  successMessage: string;
} | {
  kind: "restore_availability";
  startAts: number[];
  successMessage: string;
} | {
  kind: "move_availability";
  slotId: string;
  startAt: number;
  successMessage: string;
};

type PaintState = {
  dayKey: string;
  anchorStartAt: number;
  currentStartAt: number;
};

type SlotDragState = {
  slotId: string;
  sourceStartAt: number;
  targetStartAt: number | null;
  copy: boolean;
};

function pendingUrgency(startAt: number, now: number) {
  const remaining = startAt - now;
  if (remaining <= 3 * DAY_MS) return "critical";
  if (remaining <= 7 * DAY_MS) return "soon";
  return "later";
}

function pendingUrgencyLabel(startAt: number, now: number) {
  const urgency = pendingUrgency(startAt, now);
  if (urgency === "critical") return "Within 3 days";
  if (urgency === "soon") return "Within 7 days";
  return "Later";
}

function isLateChange(startAt: number, now: number) {
  return startAt > now && startAt - now <= DAY_MS;
}

function lateChangeLabel(startAt: number, now: number) {
  const remainingMinutes = Math.max(1, Math.ceil((startAt - now) / 60_000));
  if (remainingMinutes < 60) return `${remainingMinutes} min away`;
  const hours = Math.ceil(remainingMinutes / 60);
  return `${hours} ${hours === 1 ? "hour" : "hours"} away`;
}

function paintStartTimes(paint: PaintState) {
  const direction = paint.currentStartAt >= paint.anchorStartAt ? HOUR_MS : -HOUR_MS;
  const starts: number[] = [];
  for (
    let startAt = paint.anchorStartAt;
    direction > 0 ? startAt <= paint.currentStartAt : startAt >= paint.currentStartAt;
    startAt += direction
  ) {
    starts.push(startAt);
  }
  return starts.sort((first, second) => first - second);
}

export function AdminDashboard({ teacherName }: { teacherName: string }) {
  const [now, setNow] = useState(() => Date.now());
  const [weekStart, setWeekStart] = useState(() => startOfWeek());
  const [activeDay, setActiveDay] = useState(() => Math.max(0, (new Date().getDay() || 7) - 1));
  const [slots, setSlots] = useState<AdminSlot[]>([]);
  const [pendingRequests, setPendingRequests] = useState<AdminSlot[]>([]);
  const [nextLesson, setNextLesson] = useState<AdminSlot | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<AdminNoticeState>(null);
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);
  const [selectedAvailabilityIds, setSelectedAvailabilityIds] = useState<string[]>([]);
  const [paintState, setPaintState] = useState<PaintState | null>(null);
  const [slotDrag, setSlotDrag] = useState<SlotDragState | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const calendarScroll = useRef<HTMLDivElement | null>(null);
  const paintStateRef = useRef<PaintState | null>(null);
  const slotDragRef = useRef<SlotDragState | null>(null);
  const suppressAvailabilityClick = useRef(false);
  const days = useMemo(() => weekDays(weekStart), [weekStart]);
  const selected = [...slots, ...pendingRequests].find((slot) => slot.id === selectedId) ?? null;
  const pending = pendingRequests;
  const confirmed = slots.filter((slot) => slot.status === "confirmed");
  const scheduled = confirmed.filter((slot) => !slot.completedAt);
  const completed = confirmed.filter((slot) => slot.completedAt);
  const available = slots.filter((slot) => slot.status === "available");

  const loadSlots = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const range = weekRange(weekStart);
      const response = await fetch(`/api/admin/slots?from=${range.from}&to=${range.to}`, {
        cache: "no-store",
      });
      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }
      const data = (await response.json()) as { slots?: AdminSlot[]; pendingRequests?: AdminSlot[]; nextLesson?: AdminSlot | null; pendingCount?: number; error?: string };
      if (!response.ok || !data.slots) throw new Error(data.error ?? "Could not load this week.");
      setSlots(data.slots);
      setPendingRequests(data.pendingRequests ?? []);
      setNextLesson(data.nextLesson ?? null);
      setPendingCount(data.pendingCount ?? 0);
      setSelectedId((current) =>
        [...(data.slots ?? []), ...(data.pendingRequests ?? [])].some(
          (slot) => slot.id === current,
        )
          ? current
          : null,
      );
      setSelectedAvailabilityIds((current) =>
        current.filter((id) => data.slots?.some((slot) => slot.id === id && slot.status === "available")),
      );
      if (showLoading) {
        setNotice(null);
        setUndoAction(null);
      }
    } catch (loadError) {
      if (showLoading) {
        setUndoAction(null);
        setNotice({
          tone: "error",
          message: loadError instanceof Error ? loadError.message : "Please try again.",
        });
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    void loadSlots(true);
  }, [loadSlots]);

  useEffect(() => {
    if (!notice) return;
    const duration = notice.canUndo ? 5_000 : notice.tone === "error" ? 6_000 : 3_500;
    const timer = window.setTimeout(() => {
      setNotice(null);
      if (!notice.canUndo) setUndoAction(null);
    }, duration);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    document.title = pendingCount
      ? `(${pendingCount}) Arsenios Admin`
      : "Arsenios Admin";
    return () => {
      document.title = "Arsenios' Booking Page";
    };
  }, [pendingCount]);

  useEffect(() => {
    const refresh = () => {
      setNow(Date.now());
      void loadSlots(false);
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const timer = window.setInterval(refresh, REFRESH_INTERVAL);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loadSlots]);

  useEffect(() => {
    const scrollArea = calendarScroll.current;
    if (!scrollArea) return;
    const isCurrentWeek = dateKey(weekStart) === dateKey(startOfWeek());
    const targetMinutes = isCurrentWeek
      ? Math.max(timeRows[0], minutesInTeacherZone(Date.now()) - 90)
      : timeRows[0];
    const targetRow = Math.max(0, (targetMinutes - timeRows[0]) / 30);
    const frame = window.requestAnimationFrame(() => {
      scrollArea.scrollTop = targetRow * ROW_HEIGHT;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [weekStart]);

  function changeWeek(amount: number) {
    setWeekStart((current) => addDays(current, amount * 7));
    setActiveDay(0);
    setSelectedId(null);
    setSelectedAvailabilityIds([]);
    setUndoAction(null);
    setNotice(null);
    paintStateRef.current = null;
    slotDragRef.current = null;
    setPaintState(null);
    setSlotDrag(null);
  }

  function returnToToday() {
    const today = new Date();
    setNow(today.getTime());
    setWeekStart(startOfWeek(today));
    setActiveDay(Math.max(0, (today.getDay() || 7) - 1));
    setSelectedId(null);
    setSelectedAvailabilityIds([]);
    setUndoAction(null);
    setNotice(null);
  }

  function toggleEditing() {
    setIsEditing((current) => {
      const next = !current;
      if (!next) {
        if (selected?.status === "available") setSelectedId(null);
        setSelectedAvailabilityIds([]);
        paintStateRef.current = null;
        slotDragRef.current = null;
        setPaintState(null);
        setSlotDrag(null);
      }
      return next;
    });
  }

  function dismissNotice() {
    setNotice(null);
    setUndoAction(null);
  }

  function showNotice(
    message: string,
    tone: "error" | "success" = "success",
    undo: UndoAction | null = null,
  ) {
    setUndoAction(undo);
    setNotice({ message, tone, canUndo: Boolean(undo) });
  }

  function slotAt(day: Date, minutes: number) {
    const startAt = timestampFor(day, minutes);
    return slots.find((slot) => startAt < slot.endAt && startAt + HOUR_MS > slot.startAt);
  }

  function isValidDropTarget(drag: SlotDragState, targetStartAt: number) {
    if (targetStartAt < now) return false;
    if (!drag.copy && targetStartAt === drag.sourceStartAt) return true;
    const targetEndAt = targetStartAt + HOUR_MS;
    return !slots.some((slot) => {
      if (!drag.copy && slot.id === drag.slotId) return false;
      return slot.startAt < targetEndAt && slot.endAt > targetStartAt;
    });
  }

  async function addAvailabilityRange(startAts: number[], successMessage?: string) {
    if (busy || !startAts.length) return;
    setBusy(true);
    dismissNotice();
    try {
      const response = await fetch("/api/admin/slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_availability_range", startAts }),
      });
      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }
      const data = (await response.json()) as {
        added?: number;
        skipped?: number;
        addedSlotIds?: string[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Could not add availability.");
      await loadSlots(false);
      const added = data.added ?? 0;
      const skipped = data.skipped ?? 0;
      showNotice(
        successMessage ??
          `${added} ${added === 1 ? "availability" : "availabilities"} added${skipped ? `; ${skipped} skipped because the time was occupied` : ""}.`,
        "success",
        data.addedSlotIds?.length
          ? {
              kind: "remove_availability",
              slotIds: data.addedSlotIds,
              successMessage: "Added availability removed.",
            }
          : null,
      );
    } catch (updateError) {
      showNotice(updateError instanceof Error ? updateError.message : "Please try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  function beginAvailabilityPaint(
    event: React.PointerEvent<HTMLButtonElement>,
    day: Date,
    minutes: number,
  ) {
    if (event.pointerType !== "mouse" || event.button !== 0 || busy || !isEditing) return;
    event.preventDefault();
    const startAt = timestampFor(day, minutes);
    const next = {
      dayKey: dateKey(day),
      anchorStartAt: startAt,
      currentStartAt: startAt,
    };
    suppressAvailabilityClick.current = true;
    paintStateRef.current = next;
    setPaintState(next);
  }

  function extendAvailabilityPaint(
    event: React.PointerEvent<HTMLButtonElement>,
    day: Date,
    minutes: number,
  ) {
    const current = paintStateRef.current;
    if (!current || event.buttons !== 1 || current.dayKey !== dateKey(day)) return;
    const next = { ...current, currentStartAt: timestampFor(day, minutes) };
    paintStateRef.current = next;
    setPaintState(next);
  }

  function finishAvailabilityPaint() {
    const completedPaint = paintStateRef.current;
    if (!completedPaint) return;
    paintStateRef.current = null;
    setPaintState(null);
    const startAts = paintStartTimes(completedPaint);
    window.setTimeout(() => {
      suppressAvailabilityClick.current = false;
    }, 0);
    void addAvailabilityRange(startAts);
  }

  function beginSlotDrag(event: React.DragEvent<HTMLButtonElement>, slot: AdminSlot) {
    if (!isEditing || busy || slot.status !== "available") {
      event.preventDefault();
      return;
    }
    const drag = {
      slotId: slot.id,
      sourceStartAt: slot.startAt,
      targetStartAt: slot.startAt,
      copy: event.metaKey || event.ctrlKey,
    };
    suppressAvailabilityClick.current = true;
    slotDragRef.current = drag;
    setSlotDrag(drag);
    event.dataTransfer.effectAllowed = "copyMove";
    event.dataTransfer.setData("text/plain", slot.id);
  }

  function updateSlotDragTarget(event: React.DragEvent<HTMLDivElement>, day: Date) {
    const current = slotDragRef.current;
    if (!current || !isEditing) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const row = Math.max(
      0,
      Math.min(timeRows.length - 2, Math.floor((event.clientY - bounds.top) / ROW_HEIGHT)),
    );
    const targetStartAt = timestampFor(day, timeRows[0] + row * 30);
    const next = {
      ...current,
      targetStartAt,
      copy: event.metaKey || event.ctrlKey,
    };
    slotDragRef.current = next;
    setSlotDrag(next);
    event.dataTransfer.dropEffect = next.copy ? "copy" : "move";
  }

  async function moveOrCopyAvailability(drag: SlotDragState) {
    if (busy || drag.targetStartAt === null) return;
    if (!drag.copy && drag.targetStartAt === drag.sourceStartAt) return;
    if (!isValidDropTarget(drag, drag.targetStartAt)) {
      showNotice("That destination overlaps another available or booked lesson.", "error");
      return;
    }

    setBusy(true);
    dismissNotice();
    try {
      const response = await fetch("/api/admin/slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "move_availability",
          slotId: drag.slotId,
          targetStartAt: drag.targetStartAt,
          copy: drag.copy,
        }),
      });
      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }
      const data = (await response.json()) as {
        createdSlotId?: string;
        slotId?: string;
        sourceStartAt?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Could not update availability.");
      await loadSlots(false);
      if (drag.copy && data.createdSlotId) {
        showNotice("Availability copied.", "success", {
          kind: "remove_availability",
          slotIds: [data.createdSlotId],
          successMessage: "Copied availability removed.",
        });
      } else {
        showNotice("Availability moved.", "success", {
          kind: "move_availability",
          slotId: drag.slotId,
          startAt: drag.sourceStartAt,
          successMessage: "Availability moved back.",
        });
      }
    } catch (updateError) {
      showNotice(updateError instanceof Error ? updateError.message : "Please try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  function dropAvailability(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const dropped = slotDragRef.current;
    slotDragRef.current = null;
    setSlotDrag(null);
    window.setTimeout(() => {
      suppressAvailabilityClick.current = false;
    }, 0);
    if (dropped) void moveOrCopyAvailability(dropped);
  }

  function endSlotDrag() {
    slotDragRef.current = null;
    setSlotDrag(null);
    window.setTimeout(() => {
      suppressAvailabilityClick.current = false;
    }, 0);
  }

  async function toggleAvailabilityAt(startAt: number) {
    if (busy) return;
    setBusy(true);
    dismissNotice();
    try {
      const response = await fetch("/api/admin/slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startAt }),
      });
      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }
      const data = (await response.json()) as { removed?: string; slot?: AdminSlot; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not update availability.");
      await loadSlots(false);
      if (data.removed) {
        showNotice("Availability removed.", "success", {
          kind: "restore_availability",
          startAts: [startAt],
          successMessage: "Availability restored.",
        });
      } else {
        showNotice(
          "Availability added.",
          "success",
          data.slot
            ? {
                kind: "remove_availability",
                slotIds: [data.slot.id],
                successMessage: "Added availability removed.",
              }
            : null,
        );
      }
    } catch (updateError) {
      showNotice(updateError instanceof Error ? updateError.message : "Please try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  function toggleAvailability(day: Date, minutes: number) {
    return toggleAvailabilityAt(timestampFor(day, minutes));
  }

  function toggleAvailabilitySelection(slotId: string) {
    setSelectedAvailabilityIds((current) =>
      current.includes(slotId)
        ? current.filter((id) => id !== slotId)
        : [...current, slotId],
    );
  }

  function selectAllAvailability() {
    setSelectedAvailabilityIds(available.map((slot) => slot.id));
    setSelectedId(null);
  }

  async function removeSelectedAvailability() {
    if (busy || !selectedAvailabilityIds.length) return;
    const count = selectedAvailabilityIds.length;
    const removedStartAts = available
      .filter((slot) => selectedAvailabilityIds.includes(slot.id))
      .map((slot) => slot.startAt);
    const confirmedRemoval = window.confirm(
      `Remove ${count} selected ${count === 1 ? "availability" : "availabilities"}? Pending and confirmed lessons will not be changed.`,
    );
    if (!confirmedRemoval) return;

    setBusy(true);
    dismissNotice();
    try {
      const response = await fetch("/api/admin/slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "remove_availability",
          slotIds: selectedAvailabilityIds,
        }),
      });
      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }
      const data = (await response.json()) as { removed?: number; skipped?: number; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not remove the selected availability.");
      setSelectedAvailabilityIds([]);
      await loadSlots(false);
      showNotice(
        `${data.removed ?? 0} selected ${data.removed === 1 ? "availability" : "availabilities"} removed${data.skipped ? `; ${data.skipped} kept because they were no longer available` : ""}.`,
        "success",
        data.removed && removedStartAts.length
          ? {
              kind: "restore_availability",
              startAts: removedStartAts,
              successMessage: "Removed availability restored.",
            }
          : null,
      );
    } catch (updateError) {
      showNotice(updateError instanceof Error ? updateError.message : "Please try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function copyPreviousWeek() {
    if (busy) return;
    const sourceWeek = addDays(weekStart, -7);
    const confirmedCopy = window.confirm(
      `Copy last week's lesson times from ${formatWeek(sourceWeek)} into ${formatWeek(weekStart)}? Student names and bookings will not be copied, and existing slots will stay unchanged.`,
    );
    if (!confirmedCopy) return;

    setBusy(true);
    dismissNotice();
    try {
      const response = await fetch("/api/admin/slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "copy_previous_week",
          weekStart: dateKey(weekStart),
        }),
      });
      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }
      const data = (await response.json()) as { copied?: number; skipped?: number; copiedSlotIds?: string[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not copy last week's availability.");
      await loadSlots(false);
      if (!data.copied && !data.skipped) {
        showNotice("There were no lesson times to copy from last week.");
      } else {
        showNotice(
          `${data.copied ?? 0} ${data.copied === 1 ? "slot" : "slots"} copied${data.skipped ? `; ${data.skipped} skipped because the time was past or already occupied` : ""}.`,
          "success",
          data.copiedSlotIds?.length
            ? {
                kind: "remove_availability",
                slotIds: data.copiedSlotIds,
                successMessage: "Copied availability removed.",
              }
            : null,
        );
      }
    } catch (updateError) {
      showNotice(updateError instanceof Error ? updateError.message : "Please try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function updateBooking(slot: AdminSlot, action: "approve" | "release") {
    if (busy) return;
    const label = slot.status === "confirmed" ? "cancel this confirmed lesson" : "reject this request";
    if (action === "release") {
      const lateWarning = slot.status === "confirmed" && isLateChange(slot.startAt, now)
        ? ` This lesson is ${lateChangeLabel(slot.startAt, now)} and is within the 24-hour late-change period.`
        : "";
      if (!window.confirm(`Are you sure you want to ${label}?${lateWarning}`)) return;
    }

    setBusy(true);
    dismissNotice();
    try {
      const response = await fetch("/api/admin/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: slot.id, action }),
      });
      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }
      const data = (await response.json()) as { error?: string; emailWarning?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not update the booking.");
      setSelectedId(null);
      await loadSlots(false);
      showNotice(
        data.emailWarning ??
          (action === "approve"
            ? "Request accepted. Confirmation email sent."
            : slot.status === "confirmed"
              ? "Lesson cancelled. Cancellation email sent."
              : "Request rejected and email sent."),
      );
    } catch (updateError) {
      showNotice(updateError instanceof Error ? updateError.message : "Please try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function requestCompletionChange(slotId: string, action: CompletionAction) {
    const response = await fetch("/api/admin/completed", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId, action }),
    });
    if (response.status === 401) {
      window.location.assign("/admin/login");
      throw new Error("Your admin session has expired.");
    }
    const data = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(data.error ?? "Could not update the lesson.");
  }

  async function updateCompletion(slot: AdminSlot, action: CompletionAction) {
    if (busy) return;
    if (action === "complete" && slot.startAt > Date.now()) {
      const proceed = window.confirm("This lesson has not started yet. Mark it as completed anyway?");
      if (!proceed) return;
    }

    setBusy(true);
    dismissNotice();
    try {
      await requestCompletionChange(slot.id, action);
      await loadSlots(false);
      showNotice(
        action === "complete" ? "Lesson marked completed." : "Lesson returned to scheduled.",
        "success",
        {
          kind: "completion",
          slotId: slot.id,
          action: action === "complete" ? "uncomplete" : "complete",
          successMessage: action === "complete" ? "Lesson returned to scheduled." : "Lesson marked completed.",
        },
      );
    } catch (updateError) {
      showNotice(updateError instanceof Error ? updateError.message : "Please try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function undoLastAction() {
    if (!undoAction || busy) return;
    const undo = undoAction;
    setBusy(true);
    dismissNotice();
    try {
      if (undo.kind === "completion") {
        await requestCompletionChange(undo.slotId, undo.action);
        await loadSlots(false);
        showNotice(undo.successMessage);
      } else if (undo.kind === "remove_availability") {
        const response = await fetch("/api/admin/slots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "undo_copy_previous_week",
            slotIds: undo.slotIds,
          }),
        });
        if (response.status === 401) {
          window.location.assign("/admin/login");
          return;
        }
        const data = (await response.json()) as { removed?: number; skipped?: number; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Could not undo the copied availability.");
        await loadSlots(false);
        showNotice(
          `${undo.successMessage}${data.skipped ? ` ${data.skipped} kept because they were no longer available.` : ""}`,
        );
      } else if (undo.kind === "restore_availability") {
        const response = await fetch("/api/admin/slots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "add_availability_range",
            startAts: undo.startAts,
          }),
        });
        if (response.status === 401) {
          window.location.assign("/admin/login");
          return;
        }
        const data = (await response.json()) as { added?: number; skipped?: number; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Could not restore availability.");
        await loadSlots(false);
        showNotice(
          `${undo.successMessage}${data.skipped ? ` ${data.skipped} could not be restored because the time is now occupied.` : ""}`,
        );
      } else {
        const response = await fetch("/api/admin/slots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "move_availability",
            slotId: undo.slotId,
            targetStartAt: undo.startAt,
            copy: false,
          }),
        });
        if (response.status === 401) {
          window.location.assign("/admin/login");
          return;
        }
        const data = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(data.error ?? "Could not move availability back.");
        await loadSlots(false);
        showNotice(undo.successMessage);
      }
    } catch (updateError) {
      showNotice(updateError instanceof Error ? updateError.message : "Please try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const handleUndoShortcut = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        event.key.toLocaleLowerCase("en") === "z" &&
        undoAction &&
        !busy
      ) {
        event.preventDefault();
        void undoLastAction();
      }
    };
    window.addEventListener("keydown", handleUndoShortcut);
    return () => window.removeEventListener("keydown", handleUndoShortcut);
  });

  function handleTouchEnd(event: React.TouchEvent) {
    if (!touchStart.current) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.current.x;
    const dy = touch.clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0 && activeDay < 6) setActiveDay(activeDay + 1);
    if (dx > 0 && activeDay > 0) setActiveDay(activeDay - 1);
  }

  const range = weekRange(weekStart);
  const exportHref = `/api/admin/calendar?from=${range.from}&to=${range.to}`;
  const todayKey = slotDateKey(now);
  const currentMinutes = minutesInTeacherZone(now);
  const currentLineTop = (currentMinutes - timeRows[0]) / 30 * ROW_HEIGHT;
  const showCurrentTime = currentMinutes >= timeRows[0] && currentMinutes < timeRows[timeRows.length - 1] + 30;
  const isCurrentWeek = dateKey(weekStart) === dateKey(startOfWeek(new Date(now)));
  const activeDayKey = dateKey(days[activeDay]);
  const paintPreviewStarts = new Set(
    paintState ? paintStartTimes(paintState) : [],
  );

  async function signOut() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.replace("/admin/login");
  }

  return (
    <main className="admin-page">
      <aside className="admin-sidebar">
        <Link className="wordmark admin-wordmark" href="/admin">
          <span className="wordmark-mark inverse">A</span>
          <span>Arsenios&apos; Booking Page</span>
        </Link>
        <nav>
          <Link className="active" href="/admin">
            <span className="nav-icon">▦</span><span className="nav-label">Weekly schedule</span>
            {pendingCount ? <span className="nav-badge" aria-label={`${pendingCount} pending requests`}>{pendingCount > 9 ? "9+" : pendingCount}</span> : null}
          </Link>
          <Link href="/admin/completed"><span className="nav-icon">✓</span><span className="nav-label">Completed lessons</span></Link>
          <Link href="/admin/students"><span className="nav-icon">◉</span><span className="nav-label">Students</span></Link>
          <Link href="/" target="_blank"><span className="nav-icon">↗</span><span className="nav-label">View booking page</span></Link>
          <button className="admin-mobile-signout" onClick={() => void signOut()}><span className="nav-icon">↪</span><span className="nav-label">Sign out</span></button>
        </nav>
        <div className="admin-profile">
          <span>{teacherName.slice(0, 1).toUpperCase()}</span>
          <div><strong>{teacherName}</strong><small>Teacher</small></div>
          <button className="admin-signout" onClick={() => void signOut()}>Sign out</button>
        </div>
      </aside>

      <section className="admin-content">
        <header className="admin-topbar">
          <div>
            <p className="eyebrow">Weekly schedule</p>
            <h1>Your schedule</h1>
            {isEditing ? <p className="admin-description">Choose a future half-hour start time to offer a one-hour lesson.</p> : null}
          </div>
          <div className="admin-topbar-actions">
            <button className={`secondary-button copy-week-button ${isEditing ? "is-editing" : ""}`} onClick={() => void copyPreviousWeek()} disabled={busy} type="button">Copy last week</button>
            <button className={isEditing ? "primary-button" : "secondary-button"} onClick={toggleEditing} type="button">
              {isEditing ? "Done editing" : "Edit availability"}
            </button>
            <a className="secondary-button export-button" href={exportHref}>↓ Download week</a>
          </div>
        </header>

        <div className="stat-row admin-stat-row">
          <div><span>Pending</span><strong>{pending.length}</strong></div>
          <div><span>Scheduled</span><strong>{scheduled.length}</strong></div>
          <div><span>Completed</span><strong>{completed.length}</strong></div>
          <div><span>Open slots</span><strong>{slots.filter((slot) => slot.status === "available").length}</strong></div>
          <p>Each new week starts blank.</p>
        </div>

        <AdminNotice
          notice={notice}
          onUndo={undoAction ? () => void undoLastAction() : undefined}
          onDismiss={dismissNotice}
        />

        {!isEditing ? (
          <article className={`next-lesson-card ${nextLesson ? "has-lesson" : "is-empty"}`}>
            <div>
              <span>Next lesson</span>
              <strong>{nextLesson?.studentName ?? "No upcoming lessons"}</strong>
            </div>
            {nextLesson ? <p>{formatLongSlot(nextLesson.startAt, nextLesson.endAt)}</p> : <p>Your next confirmed lesson will appear here.</p>}
          </article>
        ) : null}

        <section className={`admin-overview-grid ${isEditing ? "admin-overview-editing" : ""}`} aria-label="Weekly lesson overview">
          <article className="admin-overview-card pending-overview">
            <header><div><h2>Pending requests</h2></div><strong>{pending.length}</strong></header>
            {pending.length ? (
              <div className="overview-list">
                {pending.map((slot) => {
                  const urgency = pendingUrgency(slot.startAt, now);
                  return (
                  <div className={`overview-row pending-urgency-${urgency}`} key={slot.id}>
                    <button className="overview-lesson" onClick={() => setSelectedId(slot.id)}>
                      <strong>{slot.studentName ?? "Student"}</strong>
                      <span>{formatDay(new Date(slot.startAt))} · {formatTime(slot.startAt)}</span>
                      <small className={`pending-urgency-label ${urgency}`}>{pendingUrgencyLabel(slot.startAt, now)}</small>
                    </button>
                    <div className="overview-actions">
                      <button className="mini-approve" onClick={() => void updateBooking(slot, "approve")} disabled={busy}>Approve</button>
                      <button className="mini-reject" onClick={() => void updateBooking(slot, "release")} disabled={busy}>Reject</button>
                    </div>
                  </div>
                  );
                })}
              </div>
            ) : <p className="overview-empty">No requests are waiting.</p>}
          </article>

          <article className="admin-overview-card confirmed-overview">
            <header><div><h2>Confirmed this week</h2></div><strong>{confirmed.length}</strong></header>
            {confirmed.length ? (
              <div className="overview-list">
                {confirmed.map((slot) => (
                  <button className={`confirmed-list-row ${isLateChange(slot.startAt, now) ? "is-late-change" : ""}`} key={slot.id} onClick={() => setSelectedId(slot.id)}>
                    <span className={`lesson-check ${slot.completedAt ? "is-complete" : ""}`}>{slot.completedAt ? "✓" : ""}</span>
                    <span><strong>{slot.studentName ?? "Student"}</strong><small>{formatDay(new Date(slot.startAt))} · {formatTime(slot.startAt)}</small></span>
                    <em>{slot.completedAt ? "Completed" : isLateChange(slot.startAt, now) ? "Within 24h" : "Scheduled"}</em>
                  </button>
                ))}
              </div>
            ) : <p className="overview-empty">No confirmed lessons this week.</p>}
          </article>
        </section>

        <section className={`admin-calendar-card ${!isEditing ? "admin-calendar-readonly" : ""}`}>
          <div className="week-toolbar admin-toolbar">
            <button className="icon-button" onClick={() => changeWeek(-1)} aria-label="Previous week">←</button>
            <div><span className="toolbar-kicker">{isEditing ? "Editing availability" : "Schedule"}</span><strong>{formatWeek(weekStart)}</strong></div>
            <button className="icon-button" onClick={() => changeWeek(1)} aria-label="Next week">→</button>
            <button className="return-today-button admin-today-button" onClick={returnToToday} disabled={isCurrentWeek && activeDayKey === todayKey} type="button">Today</button>
          </div>

          <div className="mobile-day-tabs admin-day-tabs" aria-label="Choose a day">
            {days.map((day, index) => (
              <button key={dateKey(day)} className={`${index === activeDay ? "active" : ""} ${dateKey(day) === todayKey ? "is-today" : ""}`} onClick={() => setActiveDay(index)}>
                <span>{formatDay(day, false)}</span><strong>{day.getDate()}</strong>
              </button>
            ))}
          </div>

          {isEditing ? (
            <div className="edit-mode-notice" role="status">
              <div className="edit-mode-copy">
                <strong>Editing availability</strong>
                <span>Drag empty time to add · Drag a white slot to move · Hold ⌘ while dragging to copy.</span>
              </div>
              <div className="availability-selection-actions">
                <button
                  className="selection-button"
                  type="button"
                  onClick={selectAllAvailability}
                  disabled={busy || !available.length || selectedAvailabilityIds.length === available.length}
                >
                  Select all
                </button>
                {selectedAvailabilityIds.length ? (
                  <button className="selection-button" type="button" onClick={() => setSelectedAvailabilityIds([])} disabled={busy}>Clear</button>
                ) : null}
                <button
                  className="remove-selected-button"
                  type="button"
                  onClick={() => void removeSelectedAvailability()}
                  disabled={busy || !selectedAvailabilityIds.length}
                >
                  Remove selected{selectedAvailabilityIds.length ? ` (${selectedAvailabilityIds.length})` : ""}
                </button>
              </div>
            </div>
          ) : null}

          <div
            className={`week-calendar admin-calendar ${isEditing ? "is-editing" : "is-schedule"} ${loading ? "is-loading" : ""} ${paintState ? "is-painting" : ""} ${slotDrag ? "is-dragging-slot" : ""}`}
            onTouchStart={(event) => { const touch = event.touches[0]; touchStart.current = { x: touch.clientX, y: touch.clientY }; }}
            onTouchEnd={handleTouchEnd}
            onPointerUp={finishAvailabilityPaint}
            onPointerCancel={finishAvailabilityPaint}
            onPointerLeave={() => {
              if (paintStateRef.current) finishAvailabilityPaint();
            }}
          >
            <div className="calendar-header-row">
              <div className="time-heading">Time</div>
              {days.map((day, index) => (
                <div className={`day-heading ${index === activeDay ? "mobile-active" : ""} ${dateKey(day) === todayKey ? "is-today" : ""}`} key={dateKey(day)}>
                  <span>{formatDay(day, false)}</span><strong>{day.getDate()}</strong>
                </div>
              ))}
            </div>

            <div className="calendar-scroll" ref={calendarScroll}>
              <div className="time-rail">
                {timeRows.map((minutes) => <div key={minutes} style={{ height: ROW_HEIGHT }}>{minutes % 60 === 0 ? rowLabel(minutes) : ""}</div>)}
              </div>

              {days.map((day, index) => {
                const key = dateKey(day);
                const isToday = key === todayKey;
                const daySlots = slots.filter((slot) => slotDateKey(slot.startAt) === key);
                const dropTargetAt = slotDrag?.targetStartAt ?? null;
                const showsDropTarget = dropTargetAt !== null && slotDateKey(dropTargetAt) === key;
                const dropTargetRow = showsDropTarget
                  ? (minutesInTeacherZone(dropTargetAt) - timeRows[0]) / 30
                  : -1;
                const validDropTarget = slotDrag && dropTargetAt !== null
                  ? isValidDropTarget(slotDrag, dropTargetAt)
                  : false;
                return (
                  <div
                    className={`day-column admin-day-column ${index === activeDay ? "mobile-active" : ""} ${isToday ? "is-today" : ""}`}
                    style={{ height: timeRows.length * ROW_HEIGHT }}
                    key={key}
                    onDragOver={(event) => updateSlotDragTarget(event, day)}
                    onDrop={dropAvailability}
                  >
                    <div className="grid-lines" aria-hidden="true" />
                    {isToday && showCurrentTime ? <div className="current-time-line admin-current-time" style={{ top: currentLineTop }} aria-label={`Current time ${formatTime(now)}`}><span>{formatTime(now)}</span></div> : null}
                    {showsDropTarget ? (
                      <div
                        className={`availability-drop-preview ${validDropTarget ? "is-valid" : "is-invalid"} ${slotDrag?.copy ? "is-copy" : "is-move"}`}
                        style={{ top: dropTargetRow * ROW_HEIGHT + 3, height: ROW_HEIGHT * 2 - 6 }}
                        aria-hidden="true"
                      >
                        {slotDrag?.copy ? "Copy" : "Move"}
                      </div>
                    ) : null}
                    {timeRows.slice(0, -1).map((minutes, row) => {
                      const occupied = slotAt(day, minutes);
                      const triggerStartAt = timestampFor(day, minutes);
                      const startsBeforeNow = triggerStartAt < Date.now();
                      const isPaintPreview = paintPreviewStarts.has(triggerStartAt);
                      return (
                        <button
                          className={`availability-trigger ${startsBeforeNow ? "is-past" : ""} ${isPaintPreview ? "is-paint-preview" : ""}`}
                          disabled={!isEditing || Boolean(occupied) || startsBeforeNow || busy}
                          key={minutes}
                          onClick={() => {
                            if (suppressAvailabilityClick.current) return;
                            void toggleAvailability(day, minutes);
                          }}
                          onPointerDown={(event) => beginAvailabilityPaint(event, day, minutes)}
                          onPointerEnter={(event) => extendAvailabilityPaint(event, day, minutes)}
                          style={{ top: row * ROW_HEIGHT, height: ROW_HEIGHT }}
                          aria-label={startsBeforeNow ? `${formatDay(day)} at ${rowLabel(minutes)} is in the past` : `Add availability ${formatDay(day)} at ${rowLabel(minutes)}`}
                          title={isEditing && !occupied && !startsBeforeNow ? "Add a one-hour lesson" : undefined}
                        />
                      );
                    })}
                    {daySlots.map((slot) => {
                      const row = (minutesInTeacherZone(slot.startAt) - timeRows[0]) / 30;
                      if (row < 0 || row >= timeRows.length) return null;
                      const label = slot.status === "available" ? "Available" : slot.studentName ?? "Student";
                      const displayStatus = slot.status === "confirmed" ? (slot.completedAt ? "completed" : "scheduled") : slot.status;
                      const isAvailabilitySelected = selectedAvailabilityIds.includes(slot.id);
                      const urgency = slot.status === "pending" ? pendingUrgency(slot.startAt, now) : null;
                      const lateChange = slot.status === "confirmed" && !slot.completedAt && isLateChange(slot.startAt, now);
                      return (
                        <button
                          className={`admin-slot ${slot.status} ${slot.completedAt ? "completed" : ""} ${slot.id === selectedId ? "selected" : ""} ${isAvailabilitySelected ? "multi-selected" : ""} ${slot.status === "available" && !isEditing ? "is-readonly" : ""} ${urgency ? `pending-urgency-${urgency}` : ""} ${lateChange ? "is-late-change" : ""} ${slotDrag?.slotId === slot.id ? "is-drag-source" : ""}`}
                          key={slot.id}
                          draggable={isEditing && slot.status === "available" && !busy}
                          onDragStart={(event) => beginSlotDrag(event, slot)}
                          onDragEnd={endSlotDrag}
                          onClick={() => {
                            if (suppressAvailabilityClick.current) return;
                            if (slot.status === "available" && isEditing) {
                              toggleAvailabilitySelection(slot.id);
                              setSelectedId(null);
                            } else if (slot.status !== "available") {
                              setSelectedId(slot.id);
                            }
                          }}
                          style={{ top: row * ROW_HEIGHT + 3, height: ROW_HEIGHT * 2 - 6 }}
                          aria-pressed={slot.status === "available" && isEditing ? isAvailabilitySelected : undefined}
                          aria-label={
                            slot.status === "available" && isEditing
                              ? `${isAvailabilitySelected ? "Deselect" : "Select"} availability at ${formatTime(slot.startAt)}`
                              : slot.status === "available"
                                ? `Available lesson at ${formatTime(slot.startAt)}`
                                : `Open ${label} at ${formatTime(slot.startAt)}`
                          }
                        >
                          <span>{formatTime(slot.startAt)}</span>
                          <strong>{isAvailabilitySelected ? "Selected" : label}</strong>
                          {slot.status === "pending" ? <small>{pendingUrgencyLabel(slot.startAt, now)}</small> : null}
                          {lateChange ? <small>Within 24h</small> : slot.status === "confirmed" ? <small>{displayStatus}</small> : null}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {selected ? (
          <section className="booking-inspector" aria-live="polite">
            <button className="inspector-close" onClick={() => setSelectedId(null)} aria-label="Close details">×</button>
            <div>
              <span className={`status-pill ${selected.status} ${selected.completedAt ? "completed" : ""}`}>
                {selected.status === "confirmed" ? (selected.completedAt ? "completed" : "scheduled") : selected.status}
              </span>
              {selected.status === "pending" ? (
                <span className={`inspector-urgency pending-urgency-${pendingUrgency(selected.startAt, now)}`}>
                  {pendingUrgencyLabel(selected.startAt, now)}
                </span>
              ) : null}
              {selected.status === "confirmed" && !selected.completedAt && isLateChange(selected.startAt, now) ? (
                <span className="inspector-urgency is-late-change">Within 24 hours · {lateChangeLabel(selected.startAt, now)}</span>
              ) : null}
              <h2>{selected.studentName ?? "Open lesson slot"}</h2>
              <p>{formatLongSlot(selected.startAt, selected.endAt)}</p>
              {selected.studentEmail ? <a className="student-email" href={`mailto:${selected.studentEmail}`}>{selected.studentEmail}</a> : null}
            </div>
            <div className="inspector-actions">
              {selected.status === "pending" ? <><button className="primary-button" onClick={() => void updateBooking(selected, "approve")} disabled={busy}>Approve request</button><button className="danger-button" onClick={() => void updateBooking(selected, "release")} disabled={busy}>Reject</button></> : null}
              {selected.status === "confirmed" ? (
                <>
                  <a className="secondary-button" href={`/api/admin/calendar?slot=${encodeURIComponent(selected.id)}`}>↓ Calendar invite</a>
                  <button className={selected.completedAt ? "secondary-button" : "complete-button"} onClick={() => void updateCompletion(selected, selected.completedAt ? "uncomplete" : "complete")} disabled={busy}>
                    {selected.completedAt ? "Undo completed" : "✓ Mark completed"}
                  </button>
                  {!selected.completedAt ? <button className="danger-button" onClick={() => void updateBooking(selected, "release")} disabled={busy}>Cancel lesson</button> : null}
                </>
              ) : null}
              {selected.status === "available" && isEditing ? <button className="danger-button" onClick={() => void toggleAvailabilityAt(selected.startAt)} disabled={busy}>Remove availability</button> : null}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
