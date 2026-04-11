import { useKeyboard } from "@opentui/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { setActiveInstance } from "../api/client";
import { getBlockedUntil } from "../api/errors";
import { getCurrentUser } from "../api";
import {
  DEFAULT_THEME_NAME,
  ThemeProvider,
  getTheme,
  useTheme,
  type ThemeName,
} from "./theme";
import { CommentEditDialog } from "../components/CommentEditDialog";
import { CommentReplyDialog } from "../components/CommentReplyDialog";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ErrorBanner } from "../components/ErrorBanner";
import { HelpOverlay, type KeymapSection } from "../components/HelpOverlay";
import { Loader } from "../components/Loader";
import { ReviewSubmitDialog } from "../components/ReviewSubmitDialog";
import {
  SettingsDialog,
  settingsDialogKeymap,
} from "../components/SettingsDialog";
import { StatusBar } from "../components/StatusBar";
import { ThemeDialog, themeDialogKeymap } from "../components/ThemeDialog";
import {
  getDefaultInstance,
  loadConfig,
  saveConfig,
  setTheme as setConfigTheme,
} from "../config/store";
import { sameInstance } from "../config/schema";
import { useAsync } from "../hooks/useAsync";
import { useGlobalKeys } from "../hooks/useGlobalKeys";
import { InputFocusProvider, useInputFocusState } from "../hooks/useInputFocus";
import { NavigationProvider } from "../navigation/NavigationProvider";
import { loadSession, saveSession } from "../navigation/sessionStore";
import { useNavigation } from "../navigation/useNavigation";
import {
  CommentComposer,
  commentComposerKeymap,
} from "../screens/CommentComposer";
import { InlineCommentComposer } from "../screens/InlineCommentComposer";
import {
  FirstRunWizard,
  firstRunWizardKeymap,
} from "../screens/FirstRunWizard";
import {
  InstancePicker,
  instancePickerKeymap,
} from "../screens/InstancePicker";
import {
  MergeRequestDetail,
  mergeRequestDetailKeymap,
  overviewKeymap,
} from "../screens/MergeRequestDetail";
import {
  MergeRequestsList,
  mergeRequestsListKeymap,
} from "../screens/MergeRequestsList";
import { mergeRequestDiffKeymap, commentModeKeymap } from "../screens/MergeRequestDiff";
import { NotificationProvider, useNotifications } from "../state/NotificationContext";
import { ReviewProvider, useReview } from "../state/ReviewContext";
import { ProjectDetail, projectDetailKeymap } from "../screens/ProjectDetail";
import { ProjectsList, projectsListKeymap } from "../screens/ProjectsList";
import { AppProvider, showToast, useApp } from "../state/AppContext";
import {
  GLOBAL_KEYMAP,
  matchesKey,
  type KeymapItem,
} from "../util/keys";

const ReviewAwareStatusBar = (props: Omit<Parameters<typeof StatusBar>[0], "hint">) => {
  const { state: reviewState } = useReview();
  const { state: notifState } = useNotifications();
  const parts: string[] = ["? Help"];
  const draftCount = reviewState.drafts.length;
  if (draftCount > 0) {
    parts.push(`Review: ${draftCount} draft${draftCount !== 1 ? "s" : ""} · S to submit`);
  }
  if (notifState.unreadCount > 0) {
    parts.push(`${notifState.unreadCount} new`);
  }
  return <StatusBar {...props} hint={parts.join(" · ")} />;
};

const AppFrame = ({ onExit }: { onExit: () => void }) => {
  const theme = useTheme();
  const { state, dispatch } = useApp();
  const navigation = useNavigation();
  const { hasFocusedInput } = useInputFocusState();
  const hydrated = useRef(false);

  const boot = useAsync(loadConfig, []);
  const currentUser = useAsync(
    async () => (state.activeInstance ? getCurrentUser() : null),
    [state.activeInstance?.name ?? ""],
  );

  useEffect(() => {
    if (boot.loading || boot.error || hydrated.current) return;
    dispatch({ type: "CONFIG_LOADED", config: boot.data ?? null });
    hydrated.current = true;
  }, [boot.loading, boot.error, boot.data, dispatch]);

  useEffect(() => {
    if (!hydrated.current) return;

    const config = state.config;

    if (!config || config.instances.length === 0) {
      if (state.activeInstance) {
        dispatch({ type: "INSTANCE_ACTIVATED", instance: null });
      }

      if (navigation.current.kind !== "wizard") {
        navigation.reset([{ kind: "wizard" }]);
      }

      return;
    }

    const activeInstance =
      config.instances.find((instance) =>
        sameInstance(instance, state.activeInstance),
      ) ?? null;
    const preferred = activeInstance ?? getDefaultInstance(config);

    if (!sameInstance(state.activeInstance, preferred)) {
      setActiveInstance(preferred);
      dispatch({ type: "INSTANCE_ACTIVATED", instance: preferred });
      return;
    }

    if (navigation.current.kind === "wizard" && navigation.stack.length === 1) {
      navigation.reset([{ kind: "projects" }]);
    }
  }, [
    state.config,
    state.activeInstance,
    navigation.current.kind,
    navigation.stack.length,
    navigation.reset,
    dispatch,
  ]);

  useEffect(() => {
    setActiveInstance(state.activeInstance);
  }, [state.activeInstance]);

  useEffect(() => {
    if (!state.toast) return;
    const timer = setTimeout(() => dispatch({ type: "TOAST_CLEAR" }), 4000);
    return () => clearTimeout(timer);
  }, [state.toast?.id, dispatch, state.toast]);

  useEffect(() => {
    if (!currentUser.error || !state.activeInstance) return;
    showToast(dispatch, "error", (currentUser.error as Error).message);
  }, [currentUser.error, state.activeInstance, dispatch]);

  useKeyboard((key) => {
    if (!boot.error) return;

    if (matchesKey(key, { name: "r" })) {
      key.preventDefault();
      boot.reload();
    }
  });

  const screen = navigation.current;
  const dialog = state.dialog;
  const currentThemeName = state.config?.settings.theme ?? DEFAULT_THEME_NAME;
  const isFirstSetupWizard =
    screen.kind === "wizard" && !state.config?.instances.length;

  const closeDialog = () => dispatch({ type: "DIALOG_CLOSE" });

  const openSettingsDialog = () => {
    dispatch({ type: "HELP_SET", open: false });
    dispatch({ type: "DIALOG_OPEN", dialog: { kind: "settings" } });
  };

  const openThemeDialog = () =>
    dispatch({ type: "DIALOG_OPEN", dialog: { kind: "theme" } });

  const applyTheme = async (themeName: ThemeName) => {
    try {
      const nextConfig = setConfigTheme(state.config, themeName);

      await saveConfig(nextConfig);

      dispatch({ type: "CONFIG_UPDATED", config: nextConfig });
      showToast(dispatch, "success", `Theme: ${getTheme(themeName).label}`);
      closeDialog();
    } catch (error) {
      showToast(
        dispatch,
        "error",
        error instanceof Error ? error.message : "Could not save theme",
      );
    }
  };

  useGlobalKeys({
    disabled: hasFocusedInput,
    dialogOpen: dialog !== null,
    exitOnEscape: isFirstSetupWizard,
    helpOpen: state.helpOpen,
    canPop: navigation.canPop,
    onExit,
    onBack: navigation.pop,
    onCloseDialog: closeDialog,
    onOpenSettings: openSettingsDialog,
    onToggleHelp: () => dispatch({ type: "HELP_TOGGLE" }),
    onOpenInstances: () => {
      if (
        !state.config?.instances.length ||
        navigation.current.kind === "instancePicker"
      )
        return;
      navigation.push({ kind: "instancePicker" });
    },
  });

  const screenDefinition = useMemo(() => {
    const section = (title: string, items: KeymapItem[]): KeymapSection => ({ title, items });

    switch (screen.kind) {
      case "wizard":
        return {
          title: screen.instanceName
            ? `Edit Instance · ${screen.instanceName}`
            : "First Run Wizard",
          sections: [section("Wizard", isFirstSetupWizard
            ? [...firstRunWizardKeymap, { key: "Esc", description: "Exit app" }]
            : firstRunWizardKeymap)],
          body: <FirstRunWizard instanceName={screen.instanceName} />,
        };
      case "instancePicker":
        return {
          title: "Instance Picker",
          sections: [section("Instances", instancePickerKeymap)],
          body: <InstancePicker />,
        };
      case "projects":
        return {
          title: "Projects",
          sections: [section("Projects", projectsListKeymap)],
          body: <ProjectsList />,
        };
      case "projectDetail":
        return {
          title: `Project #${screen.projectId}`,
          sections: [section("Project", projectDetailKeymap)],
          body: <ProjectDetail projectId={screen.projectId} />,
        };
      case "mrList":
        return {
          title: `Merge Requests · Project #${screen.projectId}`,
          sections: [section("Merge Requests", mergeRequestsListKeymap)],
          body: <MergeRequestsList projectId={screen.projectId} />,
        };
      case "mrDetail": {
        const sections: KeymapSection[] = [
          section("Merge Request", mergeRequestDetailKeymap),
        ];
        if (screen.tab === "overview") {
          sections.push(section("Overview", overviewKeymap));
        }
        if (screen.tab === "diff") {
          sections.push(section("Diff View", mergeRequestDiffKeymap));
          sections.push(section("Comment Mode (press c)", commentModeKeymap));
        }
        return {
          title: `Merge Request !${screen.iid}`,
          sections,
          body: (
            <MergeRequestDetail
              projectId={screen.projectId}
              iid={screen.iid}
              tab={screen.tab}
            />
          ),
        };
      }
      case "commentCompose":
        return {
          title: `Comment · !${screen.iid}`,
          sections: [section("Compose", commentComposerKeymap)],
          body: (
            <CommentComposer projectId={screen.projectId} iid={screen.iid} />
          ),
        };
      default:
        return {
          title: "gl-tui",
          sections: [] as KeymapSection[],
          body: <Loader label="Preparing screen…" />,
        };
    }
  }, [screen, isFirstSetupWizard]);

  const activeTitle =
    dialog?.kind === "settings"
      ? "Settings"
      : dialog?.kind === "theme"
        ? "Theme"
        : screenDefinition.title;

  const activeSections: KeymapSection[] =
    dialog?.kind === "settings"
      ? [{ title: "Settings", items: settingsDialogKeymap }]
      : dialog?.kind === "theme"
        ? [{ title: "Theme", items: themeDialogKeymap }]
        : screenDefinition.sections;

  const awaitingInstance =
    hydrated.current &&
    !boot.loading &&
    !!state.config?.instances.length &&
    !state.activeInstance;

  const body =
    !hydrated.current || boot.loading || awaitingInstance ? (
      <Loader label="Loading configuration…" />
    ) : boot.error ? (
      <ErrorBanner error={boot.error as Error} />
    ) : (
      screenDefinition.body
    );

  const reviewProjectId = screen.kind === "mrDetail" ? screen.projectId : 0;
  const reviewIid = screen.kind === "mrDetail" ? screen.iid : 0;

  return (
    <NotificationProvider active={!!state.activeInstance}>
    <ReviewProvider projectId={reviewProjectId} iid={reviewIid}>
      <box
        flexDirection="column"
        height="100%"
        position="relative"
        backgroundColor={theme.colors.background}
        gap={1}
      >
        <box
          flexGrow={1}
          position="relative"
          backgroundColor={theme.colors.background}
        >
          {body}
          {!state.helpOpen && dialog?.kind === "settings" ? (
            <SettingsDialog
              currentThemeName={currentThemeName}
              onOpenTheme={openThemeDialog}
            />
          ) : null}
          {!state.helpOpen && dialog?.kind === "theme" ? (
            <ThemeDialog
              currentThemeName={currentThemeName}
              onSelectTheme={(themeName) => void applyTheme(themeName)}
            />
          ) : null}
        </box>
        <ReviewAwareStatusBar
          toast={state.toast}
          instanceName={state.activeInstance?.name ?? null}
          username={currentUser.data?.username ?? null}
          blockedUntil={getBlockedUntil()}
        />
        {!state.helpOpen && dialog?.kind === "confirm" ? (
          <ConfirmDialog
            title={dialog.title}
            message={dialog.message}
            detail={dialog.detail}
          />
        ) : null}
        {!state.helpOpen && dialog?.kind === "approveConfirm" ? (
          <ConfirmDialog
            title="Approve"
            message="Approve this merge request?"
            confirmLabel="Approve"
          />
        ) : null}
        {!state.helpOpen && dialog?.kind === "inlineComment" ? (
          <InlineCommentComposer
            position={dialog.position}
            onClose={closeDialog}
          />
        ) : null}
        {!state.helpOpen && dialog?.kind === "reviewSubmit" ? (
          <ReviewSubmitDialog onClose={closeDialog} />
        ) : null}
        {!state.helpOpen && dialog?.kind === "commentReply" ? (
          <CommentReplyDialog
            projectId={reviewProjectId}
            iid={reviewIid}
            commentId={dialog.commentId}
            authorName={dialog.authorName}
            originalBody={dialog.body}
            onClose={closeDialog}
          />
        ) : null}
        {!state.helpOpen && dialog?.kind === "commentEdit" ? (
          <CommentEditDialog
            projectId={reviewProjectId}
            iid={reviewIid}
            commentId={dialog.commentId}
            initialBody={dialog.body}
            onClose={closeDialog}
          />
        ) : null}
        {state.helpOpen ? (
          <HelpOverlay
            title={activeTitle}
            sections={activeSections}
            globalKeymap={GLOBAL_KEYMAP}
          />
        ) : null}
      </box>
    </ReviewProvider>
    </NotificationProvider>
  );
};

const AppThemeShell = ({ onExit }: { onExit: () => void }) => {
  const { state } = useApp();

  return (
    <ThemeProvider
      themeName={state.config?.settings.theme ?? DEFAULT_THEME_NAME}
    >
      <AppFrame onExit={onExit} />
    </ThemeProvider>
  );
};

export const App = ({ onExit }: { onExit: () => void }) => {
  const [sessionStack, setSessionStack] = useState<
    import("../navigation/screens").Screen[] | null | undefined
  >(undefined);

  useEffect(() => {
    loadSession().then(
      (stack) => setSessionStack(stack),
      () => setSessionStack(null),
    );
  }, []);

  if (sessionStack === undefined) return null;

  return (
    <AppProvider>
      <NavigationProvider
        initialStack={sessionStack ?? undefined}
        onStackChange={saveSession}
      >
        <InputFocusProvider>
          <AppThemeShell onExit={onExit} />
        </InputFocusProvider>
      </NavigationProvider>
    </AppProvider>
  );
};
