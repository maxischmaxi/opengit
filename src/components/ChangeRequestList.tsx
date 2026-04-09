import { useEffect, useState } from "react";

import { listChangeRequests } from "../api";
import {
  getInputThemeProps,
  getSelectThemeProps,

  useTheme,
} from "../app/theme";
import { useProviderKind } from "../hooks/useProviderKind";
import { EmptyState } from "./EmptyState";
import { ErrorBanner } from "./ErrorBanner";
import { Loader } from "./Loader";
import { useAsync } from "../hooks/useAsync";
import { useDialogAwareKeyboard } from "../hooks/useDialogAwareKeyboard";
import { useInputFocus } from "../hooks/useInputFocus";
import { useNavigation } from "../navigation/useNavigation";
import { useAppState } from "../state/AppContext";
import { truncate } from "../util/format";
import { isTabBackward, isTabForward, matchesKey } from "../util/keys";

const crStates = ["open", "merged", "closed"] as const;

type ChangeRequestListProps = {
  projectId: number;
  visible: boolean;
  focused: boolean;
};

export const ChangeRequestList = ({
  projectId,
  visible,
  focused,
}: ChangeRequestListProps) => {
  const theme = useTheme();
  const providerKind = useProviderKind();
  const crPrefix = providerKind === "github" ? "#" : "!";
  const crLabel =
    providerKind === "github" ? "pull requests" : "merge requests";
  const { dialog } = useAppState();
  const navigation = useNavigation();
  const [stateIndex, setStateIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [focusArea, setFocusArea] = useState<"filter" | "list">("list");
  const dialogOpen = dialog !== null;
  const active = visible && focused && !dialogOpen;
  const listFocused = active && focusArea === "list";

  useInputFocus(active && focusArea === "filter");

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setDebouncedSearch(search.trim());
    }, 250);

    return () => clearTimeout(timer);
  }, [search]);

  const result = useAsync(async () => {
    if (!visible) {
      return {
        items: [],
        pageInfo: {
          current: 1,
          previous: null,
          next: null,
          totalPages: 1,
          perPage: 25,
        },
      };
    }

    return listChangeRequests(projectId, {
      state: crStates[stateIndex],
      search: debouncedSearch || undefined,
      page,
      perPage: 25,
    });
  }, [projectId, stateIndex, debouncedSearch, page, visible]);

  useEffect(() => {
    const maxIndex = Math.max(0, (result.data?.items.length ?? 1) - 1);
    setSelectedIndex((value) => Math.min(value, maxIndex));
  }, [result.data?.items.length]);

  useDialogAwareKeyboard((key) => {
    if (!active) return;

    if (focusArea === "filter" && matchesKey(key, { name: "escape" })) {
      key.preventDefault();
      setFocusArea("list");
      return;
    }

    if (focusArea === "filter") {
      return;
    }

    if (isTabForward(key) || matchesKey(key, { name: "right" })) {
      key.preventDefault();
      key.stopPropagation();
      setStateIndex((value) => (value + 1) % crStates.length);
      return;
    }

    if (isTabBackward(key) || matchesKey(key, { name: "left" })) {
      key.preventDefault();
      key.stopPropagation();
      setStateIndex((value) => (value + crStates.length - 1) % crStates.length);
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

    if (matchesKey(key, { name: "up" }) || matchesKey(key, { name: "k" })) {
      key.preventDefault();
      key.stopPropagation();
      setSelectedIndex((value) => Math.max(0, value - 1));
      return;
    }

    if (matchesKey(key, { name: "down" }) || matchesKey(key, { name: "j" })) {
      key.preventDefault();
      key.stopPropagation();
      setSelectedIndex((value) =>
        Math.min((result.data?.items.length ?? 1) - 1, value + 1),
      );
      return;
    }

    if (matchesKey(key, { name: "return" }) || matchesKey(key, { name: "l" })) {
      key.preventDefault();
      key.stopPropagation();
      openSelected(selectedIndex);
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
    const changeRequest = result.data?.items[index];
    if (!changeRequest) return;

    navigation.push({
      kind: "mrDetail",
      projectId,
      iid: changeRequest.iid,
      tab: "overview",
    });
  };

  return (
    <box
      flexDirection="column"
      gap={1}
      flexGrow={visible ? 1 : 0}
      maxWidth={visible ? undefined : 0}
      maxHeight={visible ? undefined : 0}
      overflow="hidden"
    >
      <box backgroundColor={theme.colors.surface} padding={1} flexShrink={0} flexDirection="column">
        <text wrapMode="none">
          {crStates.map((state, index) => {
            const isSelected = index === stateIndex;
            const label = ` ${state} `;
            const separator = index < crStates.length - 1 ? "  " : "";
            return isSelected ? (
              <span key={state} fg={theme.colors.background} bg={theme.colors.accent}>
                {label}
              </span>
            ) : (
              <span key={state} fg={theme.colors.muted}>
                {label}{separator}
              </span>
            );
          })}
        </text>
        <box marginTop={1}>
          <input
            value={search}
            onInput={setSearch}
            focused={active && focusArea === "filter"}
            placeholder={`Filter ${crLabel}`}
            {...getInputThemeProps(theme)}
          />
        </box>
      </box>

      {result.loading ? (
        <Loader label={`Loading ${crLabel}…`} />
      ) : result.error ? (
        <ErrorBanner error={result.error as Error} />
      ) : (result.data?.items.length ?? 0) === 0 ? (
        <EmptyState
          title={`No ${crLabel}`}
          description="No results for the current filter."
        />
      ) : result.data ? (
        <box
          backgroundColor={
            listFocused ? theme.colors.surfaceAlt : theme.colors.surface
          }
          padding={1}
          flexDirection="column"
          gap={1}
          flexGrow={1}
        >
          <select
            focused={listFocused}
            flexGrow={1}
            selectedIndex={selectedIndex}
            options={result.data.items.map((cr) => ({
              name: truncate(`${crPrefix}${cr.iid} ${cr.title}`, 72),
              description: truncate(cr.authorName ?? cr.webUrl, 88),
              value: cr.iid,
            }))}
            onChange={(index) => setSelectedIndex(index)}
            onSelect={(index) => openSelected(index)}
            {...getSelectThemeProps(theme)}
            focusedBackgroundColor={
              listFocused ? theme.colors.surfaceAlt : theme.colors.surface
            }
            backgroundColor={
              listFocused ? theme.colors.surfaceAlt : theme.colors.surface
            }
          />
          <text fg={theme.colors.muted}>
            {`Page ${result.data.pageInfo.current}/${result.data.pageInfo.totalPages} · ${crStates[stateIndex]} · ${result.data.items.length} items`}
          </text>
        </box>
      ) : null}
    </box>
  );
};
