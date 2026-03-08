/**
 * useKvRealtime — Shared hook for Supabase Realtime on `kv_store_2a26506b`.
 *
 * Subscribes to INSERT/UPDATE/DELETE on one or more KV keys.
 * Debounces incoming events by 300ms to ignore echo from own writes.
 * Reconnects on visibilitychange.
 * Cleans up channel on unmount.
 */
import { useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase-client";
import type { RealtimeChannel } from "@supabase/supabase-js";

const KV_TABLE = "kv_store_2a26506b";

/** Timestamp of last local write, shared across all hooks */
let lastLocalWrite = 0;

/** Call this from any save/write action to suppress echo for 300ms */
export function markLocalWrite() {
  lastLocalWrite = Date.now();
}

/**
 * @param keys  — KV key(s) to watch, e.g. `["shopping:dev-household"]`
 * @param onRemoteChange — called when a remote write is detected (debounced)
 * @param enabled — optional flag to pause/resume the subscription (default true)
 */
export function useKvRealtime(
  keys: string[],
  onRemoteChange: () => void,
  enabled = true,
) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(onRemoteChange);
  callbackRef.current = onRemoteChange;

  const setupChannel = useCallback(() => {
    // Tear down previous
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (!enabled || keys.length === 0) return;

    const channelName = `kv-rt-${keys.join(",")}-${Date.now()}`;
    const channel = supabase.channel(channelName);

    for (const key of keys) {
      channel.on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: KV_TABLE,
          filter: `key=eq.${key}`,
        },
        () => {
          // Skip if this is likely our own echo
          if (Date.now() - lastLocalWrite < 400) return;

          // Debounce rapid updates
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            callbackRef.current();
          }, 300);
        },
      );
    }

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log(`[Realtime] Subscribed to ${keys.join(", ")}`);
      }
    });

    channelRef.current = channel;
  }, [keys.join(","), enabled]);

  // Set up channel
  useEffect(() => {
    setupChannel();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [setupChannel]);

  // Reconnect on visibility change
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        console.log(`[Realtime] Reconnecting ${keys.join(", ")} after visibility change`);
        setupChannel();
        // Also trigger a reload to catch anything missed while hidden
        callbackRef.current();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [setupChannel, keys.join(",")]);
}
