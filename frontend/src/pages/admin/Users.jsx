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
  Chip,
} from "@mui/material";

function Users() {
  const [users, setUsers] = useState([]);

  const loadUsers = async () => {
    const res = await api.get("/admin/users");
    setUsers(res.data);
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const toggleUser = async (id) => {
    await api.post(`/admin/users/${id}/toggle-active`);
    loadUsers();
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight="bold" gutterBottom>
        Users
      </Typography>

      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Email</TableCell>
            <TableCell>Role</TableCell>
            <TableCell>Status</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>

        <TableBody>
          {users.map((u) => (
            <TableRow key={u.id}>
              <TableCell>{u.email}</TableCell>
              <TableCell>{u.role}</TableCell>
              <TableCell>
                <Chip
                  label={u.is_active ? "Active" : "Blocked"}
                  color={u.is_active ? "success" : "error"}
                />
              </TableCell>
              <TableCell>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => toggleUser(u.id)}
                >
                  {u.is_active ? "Block" : "Unblock"}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

export default Users;
