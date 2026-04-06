import api from "./axios";

export const subscribeCreator = async (creator_id) => {
  const res = await api.post(`/subscriptions/${creator_id}`);
  return res.data;
};

export const unSubscribe = async (creator_id) => {
  const res = await api.delete(`/subscriptions/${creator_id}`);
  return res.data;
};

export const getSubscribedChannels = async () => {
  const res = await api.get("/subscriptions/me");
  return res.data;
};

export const checkSubscriptions = async (creator_id) => {
  const res = await api.get(`/subscriptions/creator/${creator_id}`);
  return res.data;
};
