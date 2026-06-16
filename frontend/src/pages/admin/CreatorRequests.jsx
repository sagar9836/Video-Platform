import { useEffect, useState } from "react";
import {
  fetchCreatorRequests,
  approveCreatorRequest,
  rejectCreatorRequest,
} from "../../api/admin.api";

function CreatorRequests() {
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    fetchCreatorRequests().then(setRequests);
  }, []);

  const approve = async (userId) => {
    await approveCreatorRequest(userId);
    setRequests((prev) => prev.filter(r => r.user_id !== userId));
  };

  const reject = async (userId) => {
    await rejectCreatorRequest(userId);
    setRequests((prev) => prev.filter(r => r.user_id !== userId));
  };

  return (
    <div>
      <h2>Creator Requests</h2>

      {requests.length === 0 && <p>No pending requests</p>}

      {requests.map(r => (
        <div key={r.user_id} style={{ border: "1px solid #ccc", padding: 10 }}>
          <p>Email: {r.email}</p>
          <button onClick={() => approve(r.user_id)}>Approve</button>
          <button onClick={() => reject(r.user_id)}>Reject</button>
        </div>
      ))}
    </div>
  );
}

export default CreatorRequests;
