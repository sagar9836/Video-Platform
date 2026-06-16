import { Link, Outlet } from "react-router-dom";
import { Box, Typography } from "@mui/material";

function AdminLayout() {
  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      {/* SIDEBAR */}
      <Box
        sx={{
          width: 240,
          bgcolor: "#0f172a",
          color: "white",
          p: 2,
        }}
      >
        <Typography variant="h6" sx={{ mb: 3 }}>
          Admin Panel
        </Typography>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Link to="/admin" style={{ color: "white" }}>Dashboard</Link>
          <Link to="/admin/creator-requests" style={{ color: "white" }}>Creator Requests</Link>
          <Link to="/admin/users" style={{ color: "white" }}>Users</Link>
          <Link to="/admin/videos" style={{ color: "white" }}>Videos</Link>
          <Link to="/admin/comments" style={{ color: "white" }}>Comments</Link>
          <Link to="/admin/reports" style={{ color: "white" }}>Reports</Link>
        </Box>
      </Box>

      {/* CONTENT */}
      <Box sx={{ flex: 1, p: 4 }}>
        <Outlet />
      </Box>
    </Box>
  );
}

export default AdminLayout;
