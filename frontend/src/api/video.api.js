import api from "./axios";

/* ======================
   VIDEO UPLOAD / PLAY
   ====================== */

export const uploadVideo = async (formData) => {
  const res = await api.post("/videos/upload-direct", formData);
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
}

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
