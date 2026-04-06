FROM alfg/nginx-rtmp

# Remove default configs
RUN rm -f /etc/nginx/conf.d/*

# Copy our custom nginx config
COPY nginx.conf /etc/nginx/nginx.conf