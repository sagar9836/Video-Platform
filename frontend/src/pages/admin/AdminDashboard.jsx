import { useEffect, useState } from "react";
import { fetchAdminDashboardGraphql } from "../../api/graphql.api";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  CircularProgress,
} from "@mui/material";

function StatCard({ label, value }) {
  return (
    <Card sx={{ borderRadius: 3, boxShadow: 3 }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {label}
        </Typography>

        <Typography variant="h4" fontWeight="bold">
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}

function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadStats = async () => {
    try {
      const data = await fetchAdminDashboardGraphql();
      setStats(data);
    } catch {
      // keep dashboard resilient
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    const interval = setInterval(loadStats, 15000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h5" fontWeight="bold" gutterBottom>
        Admin Dashboard
      </Typography>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Live platform overview (auto-refreshing)
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6} lg={3}>
          <StatCard
            label="Pending Creator Requests"
            value={stats.pendingCreatorRequests}
          />
        </Grid>

        <Grid item xs={12} md={6} lg={3}>
          <StatCard label="Total Users" value={stats.totalUsers} />
        </Grid>

        <Grid item xs={12} md={6} lg={3}>
          <StatCard label="Total Videos" value={stats.totalVideos} />
        </Grid>

        <Grid item xs={12} md={6} lg={3}>
          <StatCard label="Total Comments" value={stats.totalComments} />
        </Grid>
      </Grid>
    </Box>
  );
}

export default AdminDashboard;
