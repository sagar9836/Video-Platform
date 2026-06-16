import api from "./axios";

const LOCALHOST_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

const resolveBrowserLivekitUrl = (rawUrl) => {
  if (!rawUrl || typeof window === "undefined") return rawUrl;

  try {
    const parsed = new URL(rawUrl);
    const browserHost = window.location.hostname;

    if (!LOCALHOST_HOSTS.has(parsed.hostname) || LOCALHOST_HOSTS.has(browserHost)) {
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

const normalize = (data) => {
  if (!data) return data;

  return {
    ...data,
    url: resolveBrowserLivekitUrl(data.url || data.livekit_url),
  };
};

const normalizeSession = (session) => {
  if (!session) return null;

  return {
    ...session,
    roomName: session.room_name || session.roomName || "",
    recordingEnabled:
      session.recording_enabled ?? session.recordingEnabled ?? false,
    startedAt: session.started_at || session.startedAt || null,
    endedAt: session.ended_at || session.endedAt || null,
    createdAt: session.created_at || session.createdAt || null,
  };
};

const normalizePremiere = (premiere) => {
  if (!premiere) return null;

  return {
    ...premiere,
    videoId: premiere.video_id || premiere.videoId || null,
    scheduledStartAt:
      premiere.scheduled_start_at || premiere.scheduledStartAt || null,
    playUrl: premiere.play_url || premiere.playUrl || null,
    thumbnailUrl: premiere.thumbnail_url || premiere.thumbnailUrl || null,
    initialOffsetSeconds:
      premiere.initial_offset_seconds ?? premiere.initialOffsetSeconds ?? 0,
  };
};

const normalizeStatus = (data) => {
  if (!data) return data;

  const session = normalizeSession(data.session);
  const premiere = normalizePremiere(data.premiere);
  const isLive = Boolean(data.is_live ?? data.isLive ?? data.live);

  return {
    ...data,
    isLive,
    live: isLive,
    roomName: data.room_name || data.roomName || session?.roomName || "",
    playUrl: data.play_url || data.playUrl || premiere?.playUrl || null,
    scheduledStartAt:
      data.scheduled_start_at || data.scheduledStartAt || premiere?.scheduledStartAt || null,
    initialOffsetSeconds:
      data.initial_offset_seconds ??
      data.initialOffsetSeconds ??
      premiere?.initialOffsetSeconds ??
      0,
    session,
    premiere,
  };
};

// ----------------------
// LIVE STATUS
// ----------------------
export const fetchLiveRoom = async (creatorId) => {
  const res = await api.get(`/live/${creatorId}/status`);
  return normalizeStatus(res.data);
};

// ----------------------
// TOKENS (FIXED)
// ----------------------
export const issueViewerToken = async (creatorId) => {
  const res = await api.post("/live/token/viewer", {
    creator_id: creatorId,
  });

  return {
    ...normalize(res.data),
    roomName: res.data.room_name || res.data.roomName || "",
  };
};

export const issuePublisherToken = async () => {
  const res = await api.post("/live/token/publisher");
  return {
    ...normalize(res.data),
    roomName: res.data.room_name || res.data.roomName || "",
    session: normalizeSession(res.data.session),
  };
};

// ----------------------
// SESSION
// ----------------------
export const fetchMyLiveSession = async () => {
  const res = await api.get("/live/session/me");
  return {
    ...res.data,
    session: normalizeSession(res.data.session),
  };
};

export const createLiveSession = async (payload) => {
  const res = await api.post("/live/session", payload);
  return {
    ...res.data,
    session: normalizeSession(res.data.session),
  };
};

export const startLiveSession = async (payload) => {
  const res = await api.post("/live/session/start", payload);
  return {
    ...res.data,
    session: normalizeSession(res.data.session),
  };
};

export const startLiveRecording = async () => {
  const res = await api.post("/live/session/recording/start");
  return {
    ...res.data,
    session: normalizeSession(res.data.session),
  };
};

export const endLiveSession = async () => {
  const res = await api.post("/live/session/end");
  return {
    ...res.data,
    session: normalizeSession(res.data.session),
  };
};

// ----------------------
// PREMIERE
// ----------------------
export const fetchMyPremiereSession = async () => {
  const res = await api.get("/live/premiere/me");
  return {
    ...res.data,
    premiere: normalizePremiere(res.data.premiere),
  };
};

export const schedulePremiereSession = async (payload) => {
  const res = await api.post("/live/premiere", payload);
  return {
    ...res.data,
    premiere: normalizePremiere(res.data.premiere),
  };
};

export const cancelPremiereSession = async (premiereId) => {
  const res = await api.post(`/live/premiere/${premiereId}/cancel`);
  return res.data;
};

export const endPremiereSession = async (premiereId) => {
  const res = await api.post(`/live/premiere/${premiereId}/end`);
  return res.data;
};
