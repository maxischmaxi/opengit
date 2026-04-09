import { useEffect, useMemo, useState } from "react";

import { createProvider } from "../api/providers";
import { getInputThemeProps, getSelectThemeProps, useTheme } from "../app/theme";
import { showToast, useApp } from "../state/AppContext";
import { useNavigation } from "../navigation/useNavigation";
import { addInstance, saveConfig, updateInstance } from "../config/store";
import {
  normalizeInstance,
  sameInstance,
  type InstanceProvider,
} from "../config/schema";
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

const providerOptions: { name: string; value: InstanceProvider }[] = [
  { name: "GitLab", value: "gitlab" },
  { name: "GitHub", value: "github" },
];

const FIELD_COUNT = 4;

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
  const [provider, setProvider] = useState<InstanceProvider>(
    existingInstance?.provider ?? "gitlab",
  );
  const [name, setName] = useState(existingInstance?.name ?? "");
  const [host, setHost] = useState(
    existingInstance?.host ?? "https://gitlab.com",
  );
  const [username, setUsername] = useState(existingInstance?.username ?? "");
  const [token, setToken] = useState(existingInstance?.token ?? "");
  const [focusedField, setFocusedField] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const dialogOpen = state.dialog !== null;

  const isGitHub = provider === "github";
  const inputFocusField = isGitHub ? (focusedField === 2 ? 2 : focusedField === 3 ? 3 : -1) : (focusedField === 2 ? 2 : focusedField === 3 ? 3 : -1);

  useInputFocus(
    !dialogOpen &&
      focusedField >= 1 &&
      (focusedField !== 0),
  );

  useEffect(() => {
    setProvider(existingInstance?.provider ?? "gitlab");
    setName(existingInstance?.name ?? "");
    setHost(existingInstance?.host ?? "https://gitlab.com");
    setUsername(existingInstance?.username ?? "");
    setToken(existingInstance?.token ?? "");
    setFocusedField(0);
    setError(null);
  }, [existingInstance]);

  const submit = async () => {
    const instance = normalizeInstance({
      provider,
      name,
      host: isGitHub ? "https://github.com" : host,
      token,
      username: isGitHub ? username : undefined,
    });

    if (!instance.name || !instance.token) {
      setError("Bitte alle Pflichtfelder ausfuellen");
      return;
    }

    if (isGitHub && !instance.username) {
      setError("GitHub Username ist erforderlich");
      return;
    }

    if (!isGitHub && !instance.host) {
      setError("Host ist erforderlich");
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
      const providerClient = createProvider(instance);
      await providerClient.validateToken();

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
      setFocusedField((value) => (value + 1) % FIELD_COUNT);
      return;
    }

    if (isTabBackward(key)) {
      key.preventDefault();
      setFocusedField((value) => (value + FIELD_COUNT - 1) % FIELD_COUNT);
      return;
    }

    if (matchesKey(key, { name: "escape" }) && state.config?.instances.length) {
      key.preventDefault();
      navigation.pop();
      return;
    }
  });

  const scopeHint = isGitHub
    ? "Token-Scopes: repo, read:user"
    : "PAT-Scopes: read_api, read_user, read_repository, api";

  return (
    <box flexDirection="column" gap={1}>
      <box flexDirection="column">
        <text>
          <strong>{isEditing ? "Edit Instance" : "First Run Wizard"}</strong>
        </text>
        <text fg={theme.colors.muted}>{scopeHint}</text>
      </box>

      <box
        backgroundColor={theme.colors.surface}
        padding={1}
        flexDirection="column"
        gap={1}
      >
        <text fg={theme.colors.muted}>Provider</text>
        <select
          focused={focusedField === 0 && !dialogOpen}
          height={4}
          selectedIndex={providerOptions.findIndex((o) => o.value === provider)}
          options={providerOptions.map((o) => ({
            name: o.name,
            description: o.name,
            value: o.value,
          }))}
          onChange={(index) => {
            const selected = providerOptions[index];
            if (selected) setProvider(selected.value);
          }}
          {...getSelectThemeProps(theme)}
          backgroundColor={theme.colors.surface}
          focusedBackgroundColor={theme.colors.surfaceElevated}
        />

        <text fg={theme.colors.muted}>Instance name</text>
        <input
          value={name}
          onInput={setName}
          onSubmit={() => setFocusedField(2)}
          focused={focusedField === 1 && !dialogOpen}
          {...getInputThemeProps(theme)}
        />

        {isGitHub ? (
          <>
            <text fg={theme.colors.muted}>Username</text>
            <input
              value={username}
              onInput={setUsername}
              onSubmit={() => setFocusedField(3)}
              focused={focusedField === 2 && !dialogOpen}
              {...getInputThemeProps(theme)}
            />
          </>
        ) : (
          <>
            <text fg={theme.colors.muted}>Host</text>
            <input
              value={host}
              onInput={setHost}
              onSubmit={() => setFocusedField(3)}
              focused={focusedField === 2 && !dialogOpen}
              {...getInputThemeProps(theme)}
            />
          </>
        )}

        <text fg={theme.colors.muted}>Token</text>
        <input
          value={token}
          onInput={setToken}
          onSubmit={() => void submit()}
          focused={focusedField === 3 && !dialogOpen}
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
