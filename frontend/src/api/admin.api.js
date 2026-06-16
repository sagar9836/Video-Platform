import api from "./axios";

export const fetchCreatorRequests = async () => {
  const res = await api.get("/admin/creator-requests");
  return res.data;
};

export const approveCreatorRequest = async (user_id) => {
  const res = await api.post(`/admin/creator-requests/${user_id}/approve`);
  return res.data;
};

export const rejectCreatorRequest = async (user_id) => {
  const res = await api.post(`/admin/creator-requests/${user_id}/reject`);
  return res.data;
};

export const fetchAdminDashboard = async () => {
  const res = await api.get("/admin/dashboard");
  return res.data;
};
