# Legacy EC2/SSM rollback image. ECS steady state routes directly through ALB.
FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
