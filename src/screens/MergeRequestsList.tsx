import type { TabSelectRenderable } from "@opentui/core";
import { useEffect, useRef, useState } from "react";

import { listChangeRequests } from "../api";
import {
  getInputThemeProps,
  getSelectThemeProps,
  getTabSelectThemeProps,
  useTheme,
} from "../app/theme";
import { useProviderKind } from "../hooks/useProviderKind";
import { EmptyState } from "../components/EmptyState";
import { ErrorBanner } from "../components/ErrorBanner";
import { Loader } from "../components/Loader";
import { useAsync } from "../hooks/useAsync";
import { useDialogAwareKeyboard } from "../hooks/useDialogAwareKeyboard";
import { useInputFocus } from "../hooks/useInputFocus";
import { useNavigation } from "../navigation/useNavigation";
import { useAppState } from "../state/AppContext";
import { truncate } from "../util/format";
import {
  isTabBackward,
  isTabForward,
  matchesKey,
  type KeymapItem,
} from "../util/keys";

const mrStates = ["open", "merged", "closed"] as const;

export const mergeRequestsListKeymap: KeymapItem[] = [
  { key: "Tab", description: "Cycle state" },
  { key: "/", description: "Focus filter" },
  { key: "Enter", description: "Open MR" },
  { key: "r", description: "Reload" },
];

export const MergeRequestsList = ({ projectId }: { projectId: number }) => {
  const theme = useTheme();
  const providerKind = useProviderKind();
  const crPrefix = providerKind === "github" ? "#" : "!";
  const { dialog } = useAppState();
  const navigation = useNavigation();
  const tabsRef = useRef<TabSelectRenderable>(null);
  const [stateIndex, setStateIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [focusArea, setFocusArea] = useState<"filter" | "list">("list");
  const dialogOpen = dialog !== null;

  useInputFocus(focusArea === "filter" && !dialogOpen);

  useEffect(() => {
    tabsRef.current?.setSelectedIndex(stateIndex);
  }, [stateIndex]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setDebouncedSearch(search.trim());
    }, 250);

    return () => clearTimeout(timer);
  }, [search]);

  const result = useAsync(
    async () =>
      listChangeRequests(projectId, {
        state: mrStates[stateIndex],
        search: debouncedSearch || undefined,
        page,
        perPage: 25,
      }),
    [projectId, stateIndex, debouncedSearch, page],
  );

  useEffect(() => {
    const maxIndex = Math.max(0, (result.data?.items.length ?? 1) - 1);
    setSelectedIndex((value) => Math.min(value, maxIndex));
  }, [result.data?.items.length]);

  useDialogAwareKeyboard((key) => {
    if (focusArea === "filter" && matchesKey(key, { name: "escape" })) {
      key.preventDefault();
      setFocusArea("list");
      return;
    }

    if (focusArea === "filter") {
      return;
    }

    if (isTabForward(key)) {
      key.preventDefault();
      setStateIndex((value) => (value + 1) % mrStates.length);
      return;
    }

    if (isTabBackward(key)) {
      key.preventDefault();
      setStateIndex((value) => (value + mrStates.length - 1) % mrStates.length);
      return;
    }

    if (matchesKey(key, { name: "/" })) {
      key.preventDefault();
      setFocusArea("filter");
      return;
    }

    if (matchesKey(key, { name: "r" })) {
      key.preventDefault();
      result.reload();
      return;
    }

    if (matchesKey(key, { name: "n" }) && result.data?.pageInfo.next) {
      key.preventDefault();
      setPage(result.data.pageInfo.next);
      return;
    }

    if (matchesKey(key, { name: "p" }) && result.data?.pageInfo.previous) {
      key.preventDefault();
      setPage(result.data.pageInfo.previous);
    }
  });

  const openSelected = (index: number) => {
    const mergeRequest = result.data?.items[index];
    if (!mergeRequest) return;

    navigation.push({
      kind: "mrDetail",
      projectId,
      iid: mergeRequest.iid,
      tab: "overview",
    });
  };

  return (
    <box flexDirection="column" gap={1} flexGrow={1}>
      <box backgroundColor={theme.colors.surface} padding={1}>
        <tab-select
          ref={tabsRef}
          options={mrStates.map((state) => ({
            name: state,
            description: state,
            value: state,
          }))}
          showDescription={false}
          focused={!dialogOpen}
          {...getTabSelectThemeProps(theme)}
        />
      </box>

      <box backgroundColor={theme.colors.surface} padding={1}>
        <input
          value={search}
          onInput={setSearch}
          focused={focusArea === "filter" && !dialogOpen}
          placeholder="Filter merge requests"
          {...getInputThemeProps(theme)}
        />
      </box>

      {result.loading ? <Loader label="Loading merge requests…" /> : null}
      {!result.loading && result.error ? (
        <ErrorBanner error={result.error as Error} />
      ) : null}
      {!result.loading &&
      !result.error &&
      (result.data?.items.length ?? 0) === 0 ? (
        <EmptyState
          title="No merge requests"
          description="No results for the current filter."
        />
      ) : null}

      {!result.loading && !result.error && result.data ? (
        <box
          backgroundColor={theme.colors.surface}
          padding={1}
          flexDirection="column"
          gap={1}
          flexGrow={1}
        >
          <select
            focused={focusArea === "list" && !dialogOpen}
            flexGrow={1}
            selectedIndex={selectedIndex}
            options={result.data.items.map((mergeRequest) => ({
              name: truncate(`${crPrefix}${mergeRequest.iid} ${mergeRequest.title}`, 72),
              description: truncate(
                mergeRequest.authorName ?? mergeRequest.webUrl,
                88,
              ),
              value: mergeRequest.iid,
            }))}
            onChange={(index) => setSelectedIndex(index)}
            onSelect={(index) => openSelected(index)}
            {...getSelectThemeProps(theme)}
          />
          <text fg={theme.colors.muted}>
            {`Page ${result.data.pageInfo.current}/${result.data.pageInfo.totalPages} · state ${mrStates[stateIndex]}`}
          </text>
        </box>
      ) : null}
    </box>
  );
};
