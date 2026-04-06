import api from "./axios";

const graphqlRequest = async (query, variables = {}) => {
  const res = await api.post("/graphql", {
    query,
    variables,
  });

  if (res.data.errors?.length) {
    throw new Error(res.data.errors[0]?.message || "GraphQL request failed");
  }

  return res.data.data;
};

export const fetchDashboardFeedGraphql = async () => {
  const data = await graphqlRequest(`
    query DashboardFeed {
      dashboardFeed {
        id
        title
        description
        creatorId
        status
        playUrl
      }
    }
  `);

  return data.dashboardFeed;
};

export const fetchChannelPageGraphql = async (creatorId) => {
  const data = await graphqlRequest(
    `
      query ChannelPage($creatorId: Int!) {
        channelPage(creatorId: $creatorId) {
          isLive
          isSubscribed
          channel {
            id
            channelName
            description
            subscribersCount
            videosCount
          }
          videos {
            id
            title
            description
            creatorId
            status
            playUrl
          }
        }
      }
    `,
    { creatorId: Number(creatorId) }
  );

  return data.channelPage;
};

export const fetchVideoPageGraphql = async (videoId) => {
  const data = await graphqlRequest(
    `
      query VideoPage($videoId: Int!) {
        videoPage(videoId: $videoId) {
          id
          title
          description
          isSubscribed
          creator {
            id
            channelName
            description
            subscribersCount
            videosCount
          }
          stats {
            views
            watchCount
            likes
            liked
          }
          playback {
            hlsUrl
            guestMode
            allowedFraction
            message
          }
        }
      }
    `,
    { videoId: Number(videoId) }
  );

  return data.videoPage;
};

export const fetchCreatorStudioGraphql = async () => {
  const data = await graphqlRequest(`
    query CreatorStudio {
      creatorStudio {
        isLive
        creator {
          id
          channelName
          description
          subscribersCount
          videosCount
        }
        videos {
          id
          title
          description
          creatorId
          status
          playUrl
        }
      }
    }
  `);

  return data.creatorStudio;
};

export const fetchAdminDashboardGraphql = async () => {
  const data = await graphqlRequest(`
    query AdminDashboard {
      adminDashboard {
        pendingCreatorRequests
        totalUsers
        totalVideos
        totalComments
      }
    }
  `);

  return data.adminDashboard;
};
