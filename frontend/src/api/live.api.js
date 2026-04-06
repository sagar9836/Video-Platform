import api from "./axios";

export const issueLiveStreamKey = async () => {
  const res = await api.post("/live/stream-key");
  return res.data;
};

export const fetchLiveSetup = async () => {
  const res = await api.get("/live/setup");
  return res.data;
};

export const fetchLiveStatus = async (creatorId) => {
  const res = await api.get(`/live/${creatorId}/status`);
  return res.data;
};

export const fetchLivePlayback = async (creatorId) => {
  const res = await api.get(`/live/${creatorId}/play`);
  return res.data;
};
