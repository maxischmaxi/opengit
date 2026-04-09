import type { TabSelectRenderable } from "@opentui/core";
import { useEffect, useRef } from "react";

import { getChangeRequest, listChangeRequestNotes } from "../api";
import { getTabSelectThemeProps, useTheme } from "../app/theme";
import { useProviderKind } from "../hooks/useProviderKind";
import { EmptyState } from "../components/EmptyState";
import { ErrorBanner } from "../components/ErrorBanner";
import { Loader } from "../components/Loader";
import { useAsync } from "../hooks/useAsync";
import { useDialogAwareKeyboard } from "../hooks/useDialogAwareKeyboard";
import { useNavigation } from "../navigation/useNavigation";
import { useAppState } from "../state/AppContext";
import { formatDate } from "../util/format";
import { matchesKey, type KeymapItem } from "../util/keys";
import { MergeRequestDiff } from "./MergeRequestDiff";

export const mergeRequestDetailKeymap: KeymapItem[] = [
  { key: "1 / 2 / 3", description: "Switch tab" },
  { key: "c", description: "Compose comment" },
  { key: "r", description: "Reload" },
];

const tabs = ["overview", "diff", "comments"] as const;

export const MergeRequestDetail = ({
  projectId,
  iid,
  tab,
}: {
  projectId: number;
  iid: number;
  tab: "overview" | "diff" | "comments";
}) => {
  const theme = useTheme();
  const providerKind = useProviderKind();
  const crPrefix = providerKind === "github" ? "#" : "!";
  const { dialog } = useAppState();
  const navigation = useNavigation();
  const tabsRef = useRef<TabSelectRenderable>(null);
  const dialogOpen = dialog !== null;
  const mergeRequest = useAsync(
    async () => getChangeRequest(projectId, iid),
    [projectId, iid],
  );
  const notes = useAsync(
    async () =>
      tab === "comments" ? listChangeRequestNotes(projectId, iid) : [],
    [projectId, iid, tab],
  );

  useEffect(() => {
    tabsRef.current?.setSelectedIndex(Math.max(0, tabs.indexOf(tab)));
  }, [tab]);

  useDialogAwareKeyboard((key) => {
    if (matchesKey(key, { name: "1" })) {
      key.preventDefault();
      navigation.replace({ kind: "mrDetail", projectId, iid, tab: "overview" });
      return;
    }

    if (matchesKey(key, { name: "2" })) {
      key.preventDefault();
      navigation.replace({ kind: "mrDetail", projectId, iid, tab: "diff" });
      return;
    }

    if (matchesKey(key, { name: "3" })) {
      key.preventDefault();
      navigation.replace({ kind: "mrDetail", projectId, iid, tab: "comments" });
      return;
    }

    if (tab === "comments" && matchesKey(key, { name: "c" })) {
      key.preventDefault();
      navigation.push({ kind: "commentCompose", projectId, iid });
      return;
    }

    if (matchesKey(key, { name: "r" })) {
      key.preventDefault();
      mergeRequest.reload();
      if (tab === "comments") {
        notes.reload();
      }
    }
  });

  if (mergeRequest.loading) return <Loader label="Loading merge request…" />;
  if (mergeRequest.error)
    return <ErrorBanner error={mergeRequest.error as Error} />;
  if (!mergeRequest.data)
    return (
      <EmptyState
        title="Merge request missing"
        description="The merge request could not be loaded."
      />
    );

  const mr = mergeRequest.data;

  return (
    <box flexDirection="column" gap={1} flexGrow={1}>
      <box
        backgroundColor={theme.colors.surface}
        padding={1}
        flexDirection="column"
        gap={1}
      >
        <text>
          <strong>{`${crPrefix}${mr.iid} ${mr.title}`}</strong>
        </text>
        <text>
          {`State: ${mr.state} · Author: ${mr.authorName ?? "unknown"} · Updated: ${formatDate(mr.updatedAt)}`}
        </text>
        <text>{`${mr.sourceBranch} → ${mr.targetBranch}`}</text>
      </box>

      <box backgroundColor={theme.colors.surface} padding={1}>
        <tab-select
          ref={tabsRef}
          options={tabs.map((item) => ({
            name: item,
            description: item,
            value: item,
          }))}
          showDescription={false}
          focused={!dialogOpen}
          {...getTabSelectThemeProps(theme)}
        />
      </box>

      <box flexGrow={1}>
        {tab === "overview" ? (
          <scrollbox focused={!dialogOpen} flexGrow={1}>
            <box flexDirection="column" gap={1} paddingRight={1}>
              <box backgroundColor={theme.colors.surface} padding={1}>
                <text>{mr.description || "No description provided."}</text>
              </box>
            </box>
          </scrollbox>
        ) : null}

        {tab === "comments" ? (
          notes.loading ? (
            <Loader label="Loading comments…" />
          ) : notes.error ? (
            <ErrorBanner error={notes.error as Error} />
          ) : !notes.data || notes.data.length === 0 ? (
            <EmptyState
              title="No comments"
              description="Press c to write the first comment."
            />
          ) : (
            <scrollbox focused={!dialogOpen} flexGrow={1}>
              <box flexDirection="column" gap={1} paddingRight={1}>
                {notes.data.map((note) => (
                  <box
                    key={note.id}
                    backgroundColor={theme.colors.surface}
                    padding={1}
                    flexDirection="column"
                    gap={1}
                  >
                    <text
                      fg={theme.colors.muted}
                    >{`${note.authorName ?? "unknown"} · ${formatDate(note.createdAt)}`}</text>
                    <text>{note.body}</text>
                  </box>
                ))}
              </box>
            </scrollbox>
          )
        ) : null}

        {tab === "diff" ? (
          <MergeRequestDiff projectId={projectId} iid={iid} />
        ) : null}
      </box>
    </box>
  );
};
