import { useEffect, useState } from "react";
import api from "../../api/axios";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
} from "@mui/material";

function Reports() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get("/admin/reports/summary")
      .then((res) => setStats(res.data));
  }, []);

  if (!stats) return null;

  return (
    <Box>
      <Typography variant="h5" fontWeight="bold" gutterBottom>
        Reports
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="body2">
                Total Views
              </Typography>
              <Typography variant="h4">
                {stats.total_views}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="body2">
                Total Likes
              </Typography>
              <Typography variant="h4">
                {stats.total_likes}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default Reports;
