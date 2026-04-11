import type { TextareaRenderable } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useRef, useState } from "react";

import { getTextareaThemeProps, useTheme } from "../app/theme";
import { showToast, useApp } from "../state/AppContext";
import { useReview } from "../state/ReviewContext";
import { matchesKey } from "../util/keys";
import type { ReviewEvent } from "../api/types";
import { DialogFrame } from "./DialogFrame";

const EVENTS: { value: ReviewEvent; label: string }[] = [
  { value: "comment", label: "Comment" },
  { value: "approve", label: "Approve" },
  { value: "request_changes", label: "Request Changes" },
];

export const ReviewSubmitDialog = ({
  onClose,
}: {
  onClose: () => void;
}) => {
  const theme = useTheme();
  const textareaRef = useRef<TextareaRenderable>(null);
  const { state: reviewState, submitReview } = useReview();
  const { dispatch } = useApp();
  const [eventIndex, setEventIndex] = useState(0);
  const [body, setBody] = useState("");
  const [focusArea, setFocusArea] = useState<"event" | "body">("event");

  useKeyboard((key) => {
    if (matchesKey(key, { name: "escape" })) {
      key.preventDefault();
      if (focusArea === "body") {
        setFocusArea("event");
        return;
      }
      onClose();
      return;
    }

    if (matchesKey(key, { name: "s", ctrl: true })) {
      key.preventDefault();
      const event = EVENTS[eventIndex]?.value ?? "comment";
      void submitReview(event, body.trim() || undefined)
        .then(() => {
          showToast(dispatch, "success", "Review submitted");
          onClose();
        })
        .catch(() => {});
      return;
    }

    if (focusArea === "event") {
      if (matchesKey(key, { name: "j" }) || matchesKey(key, { name: "down" })) {
        key.preventDefault();
        key.stopPropagation();
        setEventIndex((prev) => Math.min(EVENTS.length - 1, prev + 1));
        return;
      }

      if (matchesKey(key, { name: "k" }) || matchesKey(key, { name: "up" })) {
        key.preventDefault();
        key.stopPropagation();
        setEventIndex((prev) => Math.max(0, prev - 1));
        return;
      }

      if (matchesKey(key, { name: "tab" }) || matchesKey(key, { name: "return" })) {
        key.preventDefault();
        setFocusArea("body");
      }
    }
  });

  const footer = reviewState.submitting
    ? "Submitting review…"
    : "j/k select action · Tab for body · Ctrl+S submit · Esc cancel";

  return (
    <DialogFrame
      title={`Submit review with ${reviewState.drafts.length} comment${reviewState.drafts.length !== 1 ? "s" : ""}`}
      footer={reviewState.error ?? footer}
      preferredWidth={64}
      preferredHeight={20}
    >
      <box flexDirection="column" gap={0}>
        {EVENTS.map((event, index) => (
          <text key={event.value} fg={index === eventIndex ? theme.colors.accent : theme.colors.text}>
            {`${index === eventIndex ? "▸ " : "  "}${event.label}`}
          </text>
        ))}
      </box>

      <text fg={theme.colors.muted}>Review body (optional):</text>
      <textarea
        ref={textareaRef}
        focused={focusArea === "body"}
        flexGrow={1}
        placeholder="Overall review comment…"
        onContentChange={() => {
          setBody(textareaRef.current?.plainText ?? "");
        }}
        {...getTextareaThemeProps(theme)}
      />
    </DialogFrame>
  );
};
