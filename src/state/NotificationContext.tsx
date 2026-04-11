import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { getNotifications } from "../api";
import type { Notification } from "../api/types";

type NotificationState = {
  notifications: Notification[];
  unreadCount: number;
  lastChecked: string | null;
};

type NotificationContextValue = {
  state: NotificationState;
  markRead: () => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

export const NotificationProvider = ({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) => {
  const [state, setState] = useState<NotificationState>({
    notifications: [],
    unreadCount: 0,
    lastChecked: null,
  });
  const pollIntervalRef = useRef(60);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(async () => {
    try {
      const result = await getNotifications(
        state.lastChecked ? { since: state.lastChecked } : undefined,
      );

      pollIntervalRef.current = result.pollInterval;

      if (result.notifications.length > 0) {
        setState((prev) => ({
          notifications: result.notifications,
          unreadCount: prev.unreadCount + result.notifications.length,
          lastChecked: new Date().toISOString(),
        }));
      } else {
        setState((prev) => ({
          ...prev,
          lastChecked: new Date().toISOString(),
        }));
      }
    } catch {
      // Silently ignore poll errors
    }
  }, [state.lastChecked]);

  useEffect(() => {
    if (!active) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    const tick = () => {
      void poll().finally(() => {
        timerRef.current = setTimeout(tick, pollIntervalRef.current * 1000);
      });
    };

    // Start first poll after a short delay
    timerRef.current = setTimeout(tick, 5000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [active, poll]);

  const markRead = useCallback(() => {
    setState((prev) => ({ ...prev, unreadCount: 0 }));
  }, []);

  return (
    <NotificationContext.Provider value={{ state, markRead }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);

  if (!context) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }

  return context;
};
