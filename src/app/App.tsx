import { useKeyboard } from "@opentui/react";
import { useEffect, useMemo, useRef } from "react";

import { setActiveInstance } from "../api/client";
import { getBlockedUntil } from "../api/errors";
import { getCurrentUser } from "../api/gitlab";
import {
  DEFAULT_THEME_NAME,
  ThemeProvider,
  getTheme,
  useTheme,
  type ThemeName,
} from "./theme";
import { ErrorBanner } from "../components/ErrorBanner";
import { Header } from "../components/Header";
import { HelpOverlay } from "../components/HelpOverlay";
import { Loader } from "../components/Loader";
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
import { useNavigation } from "../navigation/useNavigation";
import {
  CommentComposer,
  commentComposerKeymap,
} from "../screens/CommentComposer";
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
} from "../screens/MergeRequestDetail";
import {
  MergeRequestsList,
  mergeRequestsListKeymap,
} from "../screens/MergeRequestsList";
import { mergeRequestDiffKeymap } from "../screens/MergeRequestDiff";
import { ProjectDetail, projectDetailKeymap } from "../screens/ProjectDetail";
import { ProjectsList, projectsListKeymap } from "../screens/ProjectsList";
import { AppProvider, showToast, useApp } from "../state/AppContext";
import {
  GLOBAL_KEYMAP,
  formatKeymapHint,
  matchesKey,
  type KeymapItem,
} from "../util/keys";

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
    switch (screen.kind) {
      case "wizard":
        return {
          title: screen.instanceName
            ? `Edit Instance · ${screen.instanceName}`
            : "First Run Wizard",
          keymap: isFirstSetupWizard
            ? [...firstRunWizardKeymap, { key: "Esc", description: "Exit app" }]
            : firstRunWizardKeymap,
          body: <FirstRunWizard instanceName={screen.instanceName} />,
        };
      case "instancePicker":
        return {
          title: "Instance Picker",
          keymap: instancePickerKeymap,
          body: <InstancePicker />,
        };
      case "projects":
        return {
          title: "Projects",
          keymap: projectsListKeymap,
          body: <ProjectsList />,
        };
      case "projectDetail":
        return {
          title: `Project #${screen.projectId}`,
          keymap: projectDetailKeymap,
          body: <ProjectDetail projectId={screen.projectId} />,
        };
      case "mrList":
        return {
          title: `Merge Requests · Project #${screen.projectId}`,
          keymap: mergeRequestsListKeymap,
          body: <MergeRequestsList projectId={screen.projectId} />,
        };
      case "mrDetail":
        return {
          title: `Merge Request !${screen.iid}`,
          keymap:
            screen.tab === "diff"
              ? [...mergeRequestDetailKeymap, ...mergeRequestDiffKeymap]
              : mergeRequestDetailKeymap,
          body: (
            <MergeRequestDetail
              projectId={screen.projectId}
              iid={screen.iid}
              tab={screen.tab}
            />
          ),
        };
      case "commentCompose":
        return {
          title: `Comment · !${screen.iid}`,
          keymap: commentComposerKeymap,
          body: (
            <CommentComposer projectId={screen.projectId} iid={screen.iid} />
          ),
        };
      default:
        return {
          title: "gl-tui",
          keymap: [] as KeymapItem[],
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

  const activeKeymap =
    dialog?.kind === "settings"
      ? settingsDialogKeymap
      : dialog?.kind === "theme"
        ? themeDialogKeymap
        : screenDefinition.keymap;

  const body =
    !hydrated.current || boot.loading ? (
      <Loader label="Loading configuration…" />
    ) : boot.error ? (
      <ErrorBanner error={boot.error as Error} />
    ) : (
      screenDefinition.body
    );

  return (
    <box
      flexDirection="column"
      height="100%"
      backgroundColor={theme.colors.background}
    >
      <Header title={activeTitle} subtitle={state.activeInstance?.host} />
      <box
        flexGrow={1}
        padding={1}
        position="relative"
        backgroundColor={theme.colors.background}
      >
        {state.helpOpen ? (
          <HelpOverlay
            title={activeTitle}
            screenKeymap={activeKeymap}
            globalKeymap={GLOBAL_KEYMAP}
          />
        ) : (
          body
        )}
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
      <StatusBar
        hint={formatKeymapHint(activeKeymap)}
        toast={state.toast}
        instanceName={state.activeInstance?.name ?? null}
        username={currentUser.data?.username ?? null}
        blockedUntil={getBlockedUntil()}
      />
    </box>
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

export const App = ({ onExit }: { onExit: () => void }) => (
  <AppProvider>
    <NavigationProvider>
      <InputFocusProvider>
        <AppThemeShell onExit={onExit} />
      </InputFocusProvider>
    </NavigationProvider>
  </AppProvider>
);
