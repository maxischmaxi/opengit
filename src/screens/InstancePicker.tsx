import { useEffect, useState } from "react";

import { useKeyboard } from "@opentui/react";
import { useTheme } from "../app/theme";
import { EmptyState } from "../components/EmptyState";
import { useDialogAwareKeyboard } from "../hooks/useDialogAwareKeyboard";
import { showToast, useApp } from "../state/AppContext";
import { useNavigation } from "../navigation/useNavigation";
import { setActiveInstance } from "../api/client";
import {
  getDefaultInstance,
  removeInstance,
  saveConfig,
  setDefault,
} from "../config/store";
import { type KeymapItem, matchesKey } from "../util/keys";

export const instancePickerKeymap: KeymapItem[] = [
  { key: "Enter", description: "Activate instance" },
  { key: "e", description: "Edit instance" },
  { key: "n", description: "Add instance" },
  { key: "d", description: "Delete selected" },
];

export const InstancePicker = () => {
  const theme = useTheme();
  const { state, dispatch } = useApp();
  const navigation = useNavigation();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dialogOpen = state.dialog !== null;

  useEffect(() => {
    if (confirmDelete && selected) {
      dispatch({
        type: "DIALOG_OPEN",
        dialog: {
          kind: "confirm",
          title: "Delete instance",
          message: `"${selected.name}" will be permanently removed.`,
          detail: isActive
            ? "This is the active instance. Deleting it will switch to the next available one."
            : "This action cannot be undone.",
        },
      });
    } else if (state.dialog?.kind === "confirm") {
      dispatch({ type: "DIALOG_CLOSE" });
    }
  }, [confirmDelete]);

  useEffect(() => {
    if (!state.dialog && confirmDelete) {
      setConfirmDelete(false);
    }
  }, [state.dialog]);

  const instances = state.config?.instances ?? [];
  const selected = instances[selectedIndex] ?? null;
  const isActive = selected?.name === state.activeInstance?.name;

  useEffect(() => {
    const activeIndex = instances.findIndex(
      (instance) => instance.name === state.activeInstance?.name,
    );
    setSelectedIndex(activeIndex >= 0 ? activeIndex : 0);
  }, [instances, state.activeInstance?.name]);

  const performDelete = async () => {
    const config = state.config;
    if (!selected || !config) return;

    const nextConfig = removeInstance(config, selected.name);
    const nextDefault = getDefaultInstance(nextConfig);

    await saveConfig(nextConfig);
    setActiveInstance(nextDefault);
    dispatch({ type: "CONFIG_UPDATED", config: nextConfig });
    dispatch({ type: "INSTANCE_ACTIVATED", instance: nextDefault });

    setConfirmDelete(false);

    if (nextDefault) {
      showToast(dispatch, "success", "Instance geloescht");
      navigation.reset([{ kind: "projects" }]);
    } else {
      showToast(dispatch, "info", "Alle Instances entfernt");
      navigation.reset([{ kind: "wizard" }]);
    }
  };

  useKeyboard((key) => {
    if (!confirmDelete) return;

    if (matchesKey(key, { name: "y" })) {
      key.preventDefault();
      void performDelete();
      return;
    }

    if (matchesKey(key, { name: "n" }) || matchesKey(key, { name: "N" })) {
      key.preventDefault();
      setConfirmDelete(false);
    }
  });

  useDialogAwareKeyboard((key) => {

    if (matchesKey(key, { name: "n" })) {
      key.preventDefault();
      navigation.push({ kind: "wizard" });
      return;
    }

    if (matchesKey(key, { name: "d" })) {
      key.preventDefault();
      if (!selected) return;
      setConfirmDelete(true);
      return;
    }

    if (matchesKey(key, { name: "e" })) {
      key.preventDefault();
      if (!selected) return;
      navigation.push({ kind: "wizard", instanceName: selected.name });
      return;
    }

    if (matchesKey(key, { name: "up" }) || matchesKey(key, { name: "k" })) {
      key.preventDefault();
      setSelectedIndex((v) => Math.max(0, v - 1));
      return;
    }

    if (matchesKey(key, { name: "down" }) || matchesKey(key, { name: "j" })) {
      key.preventDefault();
      setSelectedIndex((v) => Math.min(instances.length - 1, v + 1));
      return;
    }

    if (
      matchesKey(key, { name: "enter" }) ||
      matchesKey(key, { name: "return" })
    ) {
      key.preventDefault();

      const config = state.config;
      if (!selected || !config) return;

      void (async () => {
        const nextConfig = setDefault(config, selected.name);
        const nextInstance =
          nextConfig.instances.find(
            (instance) => instance.name === selected.name,
          ) ?? selected;

        await saveConfig(nextConfig);
        setActiveInstance(nextInstance);
        dispatch({ type: "CONFIG_UPDATED", config: nextConfig });
        dispatch({ type: "INSTANCE_ACTIVATED", instance: nextInstance });
        showToast(dispatch, "success", `Aktiv: ${selected.name}`);
        navigation.reset([{ kind: "projects" }]);
      })();
    }
  });

  if (instances.length === 0) {
    return (
      <EmptyState
        title="No instances"
        description="Press n to add an instance."
      />
    );
  }

  return (
    <box flexDirection="column" gap={1} flexGrow={1}>
      <box
        backgroundColor={theme.colors.surface}
        padding={1}
        flexDirection="column"
        gap={0}
        flexShrink={0}
      >
        <text>
          <strong>Instances</strong>
        </text>
        <text fg={theme.colors.muted}>
          {`${instances.length} configured`}
        </text>
      </box>

      <box
        backgroundColor={theme.colors.surface}
        flexDirection="column"
        flexGrow={1}
        padding={1}
        gap={1}
      >
        {instances.map((instance, index) => {
          const isFocused = index === selectedIndex;
          const isDefault = instance.default === true;
          const isInstanceActive = instance.name === state.activeInstance?.name;
          const bg = isFocused ? theme.colors.surfaceElevated : theme.colors.surface;
          const fg = isFocused ? theme.colors.accent : theme.colors.text;
          const provider = instance.provider ?? "gitlab";
          const providerIcon = provider === "github" ? "  " : "  ";
          const host =
            provider === "github"
              ? `@${instance.username ?? ""}`
              : instance.host.replace(/^https?:\/\//, "");

          return (
            <box
              key={instance.name}
              backgroundColor={bg}
              paddingLeft={1}
              paddingRight={1}
              paddingTop={0}
              paddingBottom={0}
              flexDirection="column"
            >
              <box flexDirection="row" gap={0}>
                <text fg={fg} wrapMode="none">
                  {isFocused ? "> " : "  "}
                </text>
                <text fg={fg} wrapMode="none" truncate>
                  <strong>{instance.name}</strong>
                </text>
                <text fg={theme.colors.muted} wrapMode="none">
                  {`  ${providerIcon}${host}`}
                </text>
                {isDefault || isInstanceActive ? (
                  <text wrapMode="none">{"  "}</text>
                ) : null}
                {isInstanceActive ? (
                  <text fg={theme.colors.success} wrapMode="none">
                    {"● "}
                  </text>
                ) : null}
                {isDefault ? (
                  <text fg={theme.colors.warning} wrapMode="none">
                    default
                  </text>
                ) : null}
              </box>
            </box>
          );
        })}
      </box>

      {selected ? (
        <box
          backgroundColor={theme.colors.surface}
          padding={1}
          flexDirection="row"
          flexShrink={0}
          gap={2}
        >
          <text fg={theme.colors.muted}>
            {isActive
              ? `${selected.name} is active`
              : "Enter to connect"}
          </text>
        </box>
      ) : null}
    </box>
  );
};
