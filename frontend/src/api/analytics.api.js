import api from "./axios";

/* ===========================
   VIDEO ANALYTICS EVENTS
   =========================== */

// 1️⃣ View (page opened)
export const registerView = async (videoId) => {
  await api.post(`/analytics/videos/${videoId}/view`);
};

// 2️⃣ Watch (playback started)
export const registerWatch = async (videoId) => {
  await api.post(`/analytics/videos/${videoId}/watch`);
};

// 3️⃣ Like
export const likeVideo = async (videoId) => {
  await api.post(`/analytics/videos/${videoId}/like`);
};

// 4️⃣ Fetch stats (views / likes / watch)
export const getVideoStats = async (videoId) => {
  const res = await api.get(`/analytics/videos/${videoId}/stats`);
  return res.data;
};
