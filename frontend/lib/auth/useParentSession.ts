"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  getParentToken,
  parentApi,
  setParentToken,
  type ParentUser,
} from "@/lib/api/client";

/**
 * Parent accounts use a separate token from student `useAuth()`.
 * Settings and parent pages should use this for login awareness.
 */
export function useParentSession() {
  const [parent, setParent] = useState<ParentUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = getParentToken();
    if (!token) {
      setParent(null);
      setLoading(false);
      return;
    }
    try {
      const me = await parentApi.me();
      setParent(me);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setParentToken(null);
      }
      setParent(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  return {
    parent,
    isParentAuthenticated: !!parent,
    loading,
    refresh,
  };
}
