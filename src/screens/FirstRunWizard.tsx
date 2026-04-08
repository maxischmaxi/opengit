import { Gitlab } from "@gitbeaker/rest";
import { useEffect, useMemo, useState } from "react";

import { getInputThemeProps, useTheme } from "../app/theme";
import { showToast, useApp } from "../state/AppContext";
import { useNavigation } from "../navigation/useNavigation";
import { addInstance, saveConfig, updateInstance } from "../config/store";
import { normalizeInstance, sameInstance } from "../config/schema";
import { useDialogAwareKeyboard } from "../hooks/useDialogAwareKeyboard";
import { useInputFocus } from "../hooks/useInputFocus";
import {
  isTabBackward,
  isTabForward,
  matchesKey,
  type KeymapItem,
} from "../util/keys";

export const firstRunWizardKeymap: KeymapItem[] = [
  { key: "Tab", description: "Next field" },
  { key: "Shift+Tab", description: "Previous field" },
  { key: "Enter", description: "Validate and save" },
];

export const FirstRunWizard = ({ instanceName }: { instanceName?: string }) => {
  const theme = useTheme();
  const { state, dispatch } = useApp();
  const navigation = useNavigation();
  const existingInstance = useMemo(
    () =>
      instanceName
        ? (state.config?.instances.find(
            (instance) => instance.name === instanceName,
          ) ?? null)
        : null,
    [instanceName, state.config?.instances],
  );
  const isEditing = existingInstance !== null;
  const [name, setName] = useState(existingInstance?.name ?? "");
  const [host, setHost] = useState(
    existingInstance?.host ?? "https://gitlab.com",
  );
  const [token, setToken] = useState(existingInstance?.token ?? "");
  const [focusedField, setFocusedField] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const dialogOpen = state.dialog !== null;

  useInputFocus(!dialogOpen);

  useEffect(() => {
    setName(existingInstance?.name ?? "");
    setHost(existingInstance?.host ?? "https://gitlab.com");
    setToken(existingInstance?.token ?? "");
    setFocusedField(0);
    setError(null);
  }, [existingInstance]);

  const submit = async () => {
    const instance = normalizeInstance({ name, host, token });

    if (!instance.name || !instance.host || !instance.token) {
      setError("Bitte Name, Host und Token ausfuellen");
      return;
    }

    if (
      state.config?.instances.some(
        (candidate) =>
          candidate.name !== existingInstance?.name &&
          (candidate.name === instance.name ||
            sameInstance(candidate, instance)),
      )
    ) {
      setError("Instance existiert bereits");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const api = new Gitlab({ host: instance.host, token: instance.token });
      await api.Users.showCurrentUser();

      const nextConfig =
        existingInstance && state.config
          ? updateInstance(state.config, existingInstance.name, instance)
          : addInstance(state.config, instance);
      const nextActiveInstance =
        nextConfig.instances.find(
          (candidate) => candidate.name === instance.name,
        ) ?? instance;
      const editingActiveInstance =
        existingInstance &&
        state.activeInstance?.name === existingInstance.name;

      await saveConfig(nextConfig);

      dispatch({ type: "CONFIG_UPDATED", config: nextConfig });
      if (editingActiveInstance || !state.activeInstance || !isEditing) {
        dispatch({ type: "INSTANCE_ACTIVATED", instance: nextActiveInstance });
      }
      showToast(
        dispatch,
        "success",
        isEditing ? "Instance aktualisiert" : "Instance gespeichert",
      );
      navigation.reset([{ kind: "projects" }]);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Token-Validierung fehlgeschlagen",
      );
    } finally {
      setSubmitting(false);
    }
  };

  useDialogAwareKeyboard((key) => {
    if (submitting) return;

    if (isTabForward(key)) {
      key.preventDefault();
      setFocusedField((value) => (value + 1) % 3);
      return;
    }

    if (isTabBackward(key)) {
      key.preventDefault();
      setFocusedField((value) => (value + 2) % 3);
      return;
    }

    if (matchesKey(key, { name: "escape" }) && state.config?.instances.length) {
      key.preventDefault();
      navigation.pop();
      return;
    }
  });

  return (
    <box flexDirection="column" gap={1}>
      <box flexDirection="column">
        <text>
          <strong>{isEditing ? "Edit Instance" : "First Run Wizard"}</strong>
        </text>
        <text fg={theme.colors.muted}>
          PAT-Scopes: read_api, read_user, read_repository, api
        </text>
      </box>

      <box
        backgroundColor={theme.colors.surface}
        padding={1}
        flexDirection="column"
        gap={1}
      >
        <text fg={theme.colors.muted}>Instance name</text>
        <input
          value={name}
          onInput={setName}
          onSubmit={() => setFocusedField(1)}
          focused={focusedField === 0 && !dialogOpen}
          {...getInputThemeProps(theme)}
        />

        <text fg={theme.colors.muted}>Host</text>
        <input
          value={host}
          onInput={setHost}
          onSubmit={() => setFocusedField(2)}
          focused={focusedField === 1 && !dialogOpen}
          {...getInputThemeProps(theme)}
        />

        <text fg={theme.colors.muted}>Token</text>
        <input
          value={token}
          onInput={setToken}
          onSubmit={() => void submit()}
          focused={focusedField === 2 && !dialogOpen}
          {...getInputThemeProps(theme)}
        />
      </box>

      {error ? (
        <box backgroundColor={theme.colors.surface} padding={1}>
          <text fg={theme.colors.error}>{error}</text>
        </box>
      ) : null}

      <text fg={theme.colors.muted}>
        {submitting
          ? "Validating token…"
          : isEditing
            ? "Enter validiert und aktualisiert die Instanz"
            : "Enter speichert die Config mit Mode 0600"}
      </text>
    </box>
  );
};
