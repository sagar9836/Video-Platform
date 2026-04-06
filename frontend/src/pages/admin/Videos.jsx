import { useEffect, useState } from "react";
import api from "../../api/axios";
import {
  Box,
  Typography,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Button,
} from "@mui/material";

function Videos() {
  const [videos, setVideos] = useState([]);

  const loadVideos = async () => {
    const res = await api.get("/admin/videos");
    setVideos(res.data);
  };

  useEffect(() => {
    loadVideos();
  }, []);

  const disableVideo = async (id) => {
    await api.post(`/admin/videos/${id}/disable`);
    loadVideos();
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight="bold" gutterBottom>
        Videos
      </Typography>

      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Title</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Creator</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>

        <TableBody>
          {videos.map((v) => (
            <TableRow key={v.id}>
              <TableCell>{v.title}</TableCell>
              <TableCell>{v.status}</TableCell>
              <TableCell>{v.creator_id}</TableCell>
              <TableCell>
                <Button
                  size="small"
                  color="error"
                  variant="outlined"
                  onClick={() => disableVideo(v.id)}
                >
                  Disable
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

export default Videos;
