import api from "./axios";

/* ======================
   VIDEO UPLOAD / PLAY
   ====================== */

export const uploadVideo = async (formData) => {
  const res = await api.post("/videos/upload-direct", formData);
  return res.data;
};

export const createVideoUpload = async ({ title, description, visibility }) => {
  const res = await api.post("/videos/upload", {
    title,
    description,
    visibility,
  });
  return res.data;
};

export const completeUpload = async ({ video_id }) => {
  const res = await api.post(`/videos/${video_id}/complete`);
  return res.data;
};

export const videoStatus = async ({ video_id }) => {
  const res = await api.get(`/videos/${video_id}/status`);
  return res.data;
};

export const videoPlay = async ({ video_id }) => {
  const res = await api.get(`/videos/${video_id}/play`);
  return res.data; // { hls_url }
};

export const fetchAllVideos = async () => {
  const res = await api.get("/videos/");
  return res.data;
};

export const fetchVideoDetails = async (video_id) => {
  const res = await api.get(`/videos/${video_id}`);
  return res.data;
};

export const updateVideoVisibility = async ({ video_id, visibility }) => {
  const res = await api.patch(`/videos/${video_id}/visibility`, { visibility });
  return res.data;
};

export const deleteCreatorVideo = async ({ video_id }) => {
  const res = await api.delete(`/videos/${video_id}`);
  return res.data;
};

export const deleteAdminVideo = async ({ video_id }) => {
  const res = await api.delete(`/admin/videos/${video_id}`);
  return res.data;
};

/* ======================
   COMMENTS (NEW)
   ====================== */

// 🔹 Add comment (AUTH REQUIRED)
export const addComment = async ({ video_id, content }) => {
  const res = await api.post(`/comments/videos/${video_id}`, {
    content,
  });
  return res.data;
};

// 🔹 Fetch comments (PUBLIC)
export const fetchComments = async (video_id) => {
  const res = await api.get(`/comments/videos/${video_id}`);
  return res.data;
};
