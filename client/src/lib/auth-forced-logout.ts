import { createClientRandomId } from "@/lib/secure-id";

const FORCE_LOGOUT_EVENT_NAME = "force-logout";
const FORCE_LOGOUT_BROADCAST_CHANNEL_NAME = "sqr-auth-force-logout";

type ForcedLogoutPayload = {
  message?: string;
  nonce?: string;
};

type ForcedLogoutListener = (payload: ForcedLogoutPayload) => void;

function normalizeAuthNoticeMessage(message: string | null | undefined): string {
  return String(message || "").trim();
}

export function parseForcedLogoutStorageValue(raw: string | null | undefined): ForcedLogoutPayload | null {
  const normalized = String(raw || "").trim();
  if (!normalized) {
    return null;
  }

  if (normalized === "true") {
    return {};
  }

  try {
    const parsed = JSON.parse(normalized) as ForcedLogoutPayload;
    return {
      message: normalizeAuthNoticeMessage(parsed?.message),
    };
  } catch {
    return {};
  }
}

function normalizeForcedLogoutPayload(raw: unknown): ForcedLogoutPayload | null {
  if (typeof raw === "string" || raw === null || raw === undefined) {
    return parseForcedLogoutStorageValue(raw);
  }

  if (typeof raw !== "object") {
    return null;
  }

  const parsed = raw as {
    message?: unknown;
    nonce?: unknown;
  };

  const message = normalizeAuthNoticeMessage(
    typeof parsed.message === "string" ? parsed.message : "",
  );
  const nonce = typeof parsed.nonce === "string" ? parsed.nonce.trim() : "";

  return {
    ...(message ? { message } : {}),
    ...(nonce ? { nonce } : {}),
  };
}

function createForcedLogoutPayload(message?: string | null | undefined): ForcedLogoutPayload {
  const normalizedMessage = normalizeAuthNoticeMessage(message);
  return normalizedMessage
    ? {
      message: normalizedMessage,
      nonce: createClientRandomId("force-logout"),
    }
    : {};
}

function createForceLogoutBroadcastChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel !== "function") {
    return null;
  }

  try {
    return new BroadcastChannel(FORCE_LOGOUT_BROADCAST_CHANNEL_NAME);
  } catch {
    return null;
  }
}

export function broadcastForcedLogoutToOtherTabs(message?: string | null | undefined) {
  const payload = createForcedLogoutPayload(message);
  const channel = createForceLogoutBroadcastChannel();
  if (!channel) {
    return;
  }

  try {
    channel.postMessage(payload);
  } catch {
    // Ignore cross-tab broadcast channel failures.
  } finally {
    channel.close();
  }
}

export function broadcastForcedLogout(message?: string | null | undefined) {
  const payload = createForcedLogoutPayload(message);
  broadcastForcedLogoutToOtherTabs(payload.message);

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(FORCE_LOGOUT_EVENT_NAME, {
        detail: Object.keys(payload).length > 0 ? payload : undefined,
      }),
    );
  }
}

export function subscribeForcedLogout(listener: ForcedLogoutListener) {
  const handleForcedLogoutEvent = (event: Event) => {
    const payload = normalizeForcedLogoutPayload(
      (event as CustomEvent<ForcedLogoutPayload | undefined>).detail,
    );
    if (payload) {
      listener(payload);
    }
  };

  let channel: BroadcastChannel | null = null;
  const handleChannelMessage = (event: MessageEvent<unknown>) => {
    const payload = normalizeForcedLogoutPayload(event.data);
    if (payload) {
      listener(payload);
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener(FORCE_LOGOUT_EVENT_NAME, handleForcedLogoutEvent);
  }

  channel = createForceLogoutBroadcastChannel();
  if (channel) {
    channel.addEventListener("message", handleChannelMessage);
  }

  return () => {
    if (typeof window !== "undefined") {
      window.removeEventListener(FORCE_LOGOUT_EVENT_NAME, handleForcedLogoutEvent);
    }
    if (channel) {
      channel.removeEventListener("message", handleChannelMessage);
      channel.close();
    }
  };
}
