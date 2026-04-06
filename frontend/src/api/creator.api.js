import api from "./axios";

// USER → apply as creator
export const creatorApply = async () => {
  const res = await api.post("/creators/apply");
  return res.data;
};

export const requestCreatorVerification = async (payload) => {
  const res = await api.post("/creators/verify-email/request", payload);
  return res.data;
};

export const confirmCreatorVerification = async (payload) => {
  const res = await api.post("/creators/verify-email/confirm", payload);
  return res.data;
};

// CREATOR → fetch own channel
export const fetchMyProfile = async () => {
  const res = await api.get("/users/me");
  return res.data;
};

// CREATOR → create channel
export const createChannel = async (payload) => {
  const res = await api.post("/creators", payload);
  return res.data;
};

export const creatorVideos = async () =>{
  const res = await api.get("/creators/me/videos");
  return res.data;
}
export const fetchcreatorVideos = async (creatorId) => {
  const res = await api.get(`/creators/${creatorId}/videos`);
  return res.data;
}

export const fetchCreatorChannel = async (creatorId) => {
  const res = await api.get(`/creators/${creatorId}`);
  return res.data;
}
