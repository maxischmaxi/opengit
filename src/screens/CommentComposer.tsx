import type { TextareaRenderable } from "@opentui/core";
import { useRef, useState } from "react";

import { createMergeRequestNote } from "../api/gitlab";
import { getTextareaThemeProps, useTheme } from "../app/theme";
import { useDialogAwareKeyboard } from "../hooks/useDialogAwareKeyboard";
import { showToast, useApp } from "../state/AppContext";
import { useInputFocus } from "../hooks/useInputFocus";
import { useNavigation } from "../navigation/useNavigation";
import { matchesKey, type KeymapItem } from "../util/keys";

export const commentComposerKeymap: KeymapItem[] = [
  { key: "Ctrl+S", description: "Submit comment" },
  { key: "Esc", description: "Cancel" },
];

export const CommentComposer = ({
  projectId,
  iid,
}: {
  projectId: number;
  iid: number;
}) => {
  const theme = useTheme();
  const textareaRef = useRef<TextareaRenderable>(null);
  const navigation = useNavigation();
  const { state, dispatch } = useApp();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dialogOpen = state.dialog !== null;

  useInputFocus(!dialogOpen);

  const submit = async () => {
    const body = draft.trim();

    if (!body) {
      setError("Kommentar darf nicht leer sein");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await createMergeRequestNote(projectId, iid, body);
      showToast(dispatch, "success", "Comment posted");
      navigation.pop();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Kommentar konnte nicht erstellt werden",
      );
    } finally {
      setSubmitting(false);
    }
  };

  useDialogAwareKeyboard((key) => {
    if (matchesKey(key, { name: "s", ctrl: true })) {
      key.preventDefault();
      void submit();
      return;
    }

    if (matchesKey(key, { name: "escape" })) {
      key.preventDefault();

      if (!draft.trim() || confirmDiscard) {
        navigation.pop();
        return;
      }

      setConfirmDiscard(true);
    }
  });

  return (
    <box flexDirection="column" gap={1} flexGrow={1}>
      <box
        backgroundColor={theme.colors.surface}
        padding={1}
        flexDirection="column"
        gap={1}
        flexGrow={1}
      >
        <text>
          <strong>Compose comment</strong>
        </text>
        <textarea
          ref={textareaRef}
          focused={!dialogOpen}
          flexGrow={1}
          placeholder="Write a merge request comment"
          onContentChange={() => {
            const nextDraft = textareaRef.current?.plainText ?? "";
            setDraft(nextDraft);
            setConfirmDiscard(false);
          }}
          {...getTextareaThemeProps(theme)}
        />
      </box>

      {error ? (
        <box backgroundColor={theme.colors.surface} padding={1}>
          <text fg={theme.colors.error}>{error}</text>
        </box>
      ) : null}

      {confirmDiscard ? (
        <text fg={theme.colors.warning}>
          Press Esc again to discard the current draft
        </text>
      ) : (
        <text fg={theme.colors.muted}>
          {submitting ? "Submitting comment…" : "Ctrl+S sends the comment"}
        </text>
      )}
    </box>
  );
};
