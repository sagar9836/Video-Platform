import api from "./axios";

export const loginUser = async (payload) => {
  const res = await api.post("/auth/login", payload);
  return res.data;
};

export const registerUser = async (payload) => {
  const res = await api.post("/auth/register", payload);
  return res.data;
};

export const requestPasswordReset = async (payload) => {
  const res = await api.post("/auth/forgot-password/request", payload);
  return res.data;
};

export const confirmPasswordReset = async (payload) => {
  const res = await api.post("/auth/forgot-password/confirm", payload);
  return res.data;
};
