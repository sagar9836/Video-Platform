import api from "./axios";

export const fetchUserProfile = async () => {
  const res = await api.get("/users/me");
  return res.data;
}