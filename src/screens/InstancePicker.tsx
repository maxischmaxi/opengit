import { useEffect, useState } from "react";

import { getSelectThemeProps, useTheme } from "../app/theme";
import { EmptyState } from "../components/EmptyState";
import { useDialogAwareKeyboard } from "../hooks/useDialogAwareKeyboard";
import { showToast, useApp } from "../state/AppContext";
import { useNavigation } from "../navigation/useNavigation";
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
  { key: "+", description: "Add instance" },
  { key: "d", description: "Delete selected" },
];

export const InstancePicker = () => {
  const theme = useTheme();
  const { state, dispatch } = useApp();
  const navigation = useNavigation();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dialogOpen = state.dialog !== null;

  const instances = state.config?.instances ?? [];

  useEffect(() => {
    const activeIndex = instances.findIndex(
      (instance) => instance.name === state.activeInstance?.name,
    );
    setSelectedIndex(activeIndex >= 0 ? activeIndex : 0);
  }, [instances, state.activeInstance?.name]);

  useDialogAwareKeyboard((key) => {
    if (matchesKey(key, { name: "+" })) {
      key.preventDefault();
      navigation.push({ kind: "wizard" });
      return;
    }

    if (matchesKey(key, { name: "d" })) {
      key.preventDefault();
      setConfirmDelete(true);
      return;
    }

    if (matchesKey(key, { name: "e" })) {
      key.preventDefault();

      const selected = instances[selectedIndex];
      if (!selected) return;

      setConfirmDelete(false);
      navigation.push({ kind: "wizard", instanceName: selected.name });
      return;
    }

    if (
      matchesKey(key, { name: "enter" }) ||
      matchesKey(key, { name: "return" })
    ) {
      key.preventDefault();

      const selected = instances[selectedIndex];
      const config = state.config;
      if (!selected || !config) return;

      void (async () => {
        if (confirmDelete) {
          const nextConfig = removeInstance(config, selected.name);
          const nextDefault = getDefaultInstance(nextConfig);

          await saveConfig(nextConfig);

          dispatch({ type: "CONFIG_UPDATED", config: nextConfig });
          dispatch({ type: "INSTANCE_ACTIVATED", instance: nextDefault });

          if (nextDefault) {
            showToast(dispatch, "success", "Instance geloescht");
            navigation.reset([{ kind: "projects" }]);
          } else {
            showToast(dispatch, "info", "Alle Instances entfernt");
            navigation.reset([{ kind: "wizard" }]);
          }

          setConfirmDelete(false);
          return;
        }

        const nextConfig = setDefault(config, selected.name);
        const nextInstance =
          nextConfig.instances.find(
            (instance) => instance.name === selected.name,
          ) ?? selected;

        await saveConfig(nextConfig);
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
        description="Press + to add a GitLab instance."
      />
    );
  }

  return (
    <box flexDirection="column" gap={1}>
      <box
        backgroundColor={theme.colors.surface}
        padding={1}
        flexDirection="column"
        gap={1}
      >
        <text>
          <strong>Instances</strong>
        </text>
        <select
          focused={!dialogOpen}
          height={Math.max(6, Math.min(16, instances.length + 2))}
          selectedIndex={selectedIndex}
          options={instances.map((instance) => ({
            name: instance.name,
            description: instance.host,
            value: instance.name,
          }))}
          onChange={(index) => {
            setSelectedIndex(index);
            setConfirmDelete(false);
          }}
          {...getSelectThemeProps(theme)}
        />
      </box>

      {confirmDelete ? (
        <box backgroundColor={theme.colors.surface} padding={1}>
          <text fg={theme.colors.warning}>
            Enter bestaetigt das Loeschen der ausgewaehlten Instance
          </text>
        </box>
      ) : (
        <text fg={theme.colors.muted}>
          Enter aktiviert die Auswahl und setzt sie als Default
        </text>
      )}
    </box>
  );
};
