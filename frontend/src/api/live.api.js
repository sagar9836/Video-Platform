import api from "./axios";

const LOCALHOST_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const resolveBrowserLivekitUrl = (rawUrl) => {
  if (!rawUrl || typeof window === "undefined") {
    return rawUrl;
  }

  try {
    const parsed = new URL(rawUrl);
    const browserHost = window.location.hostname;

    if (!LOCALHOST_HOSTS.has(parsed.hostname) || !browserHost || LOCALHOST_HOSTS.has(browserHost)) {
      return rawUrl;
    }

    parsed.hostname = browserHost;
    if (window.location.protocol === "https:" && parsed.protocol === "ws:") {
      parsed.protocol = "wss:";
    }

    return parsed.toString();
  } catch {
    return rawUrl;
  }
};

const normalizeLivekitPayload = (payload) => {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const resolvedUrl = resolveBrowserLivekitUrl(
    payload.url || payload.livekit_url || payload.livekit?.url
  );

  return {
    ...payload,
    ...(payload.url ? { url: resolvedUrl } : {}),
    ...(payload.livekit_url ? { livekit_url: resolvedUrl } : {}),
    ...(payload.livekit ? { livekit: { ...payload.livekit, url: resolvedUrl } } : {}),
  };
};

export const fetchLiveStatus = async (creatorId) => {
  const res = await api.get(`/live/${creatorId}/status`);
  return res.data;
};

export const fetchLiveRoom = async (creatorId) => {
  const res = await api.get(`/live/${creatorId}/room`);
  return normalizeLivekitPayload(res.data);
};

export const fetchMyLiveSession = async () => {
  const res = await api.get("/live/session/me");
  return normalizeLivekitPayload(res.data);
};

export const createLiveSession = async (payload) => {
  const res = await api.post("/live/session", payload);
  return normalizeLivekitPayload(res.data);
};

export const startLiveSession = async (payload) => {
  const res = await api.post("/live/session/start", payload);
  return normalizeLivekitPayload(res.data);
};

export const endLiveSession = async () => {
  const res = await api.post("/live/session/end");
  return res.data;
};

export const fetchMyPremiereSession = async () => {
  const res = await api.get("/live/premiere/me");
  return res.data;
};

export const schedulePremiereSession = async (payload) => {
  const res = await api.post("/live/premiere", payload);
  return res.data;
};

export const cancelPremiereSession = async (premiereId) => {
  const res = await api.post(`/live/premiere/${premiereId}/cancel`);
  return res.data;
};

export const endPremiereSession = async (premiereId) => {
  const res = await api.post(`/live/premiere/${premiereId}/end`);
  return res.data;
};

export const issuePublisherToken = async () => {
  const res = await api.post("/live/token/publisher");
  return normalizeLivekitPayload(res.data);
};

export const issueViewerToken = async (creatorId) => {
  const res = await api.post("/live/token/viewer", { creator_id: creatorId });
  return normalizeLivekitPayload(res.data);
};
