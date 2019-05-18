# simple file serve

Small UI to browse file on a remote server.  
Compatible with [rclone](https://rclone.org/) http sync.

Allow user to hide file from rclone from the UI so it's not sync.

## Docker install on cloudbox

```
docker run -d \
    --name simple-file-serve \
    --restart=always \
    --user node \
    --network=cloudbox \
    --network-alias=simple-file-serve \
    -v /opt/simple-file-serve/:/config \
    -v /mnt/unionfs/Media:/media \
    -v /mnt/:/mnt/ \
    --label com.github.cloudbox.cloudbox_managed=false \
    -e VIRTUAL_PORT=8080 \
    -e VIRTUAL_HOST=files.server.com \
    -e LETSENCRYPT_HOST=files.server.com \
    -e LETSENCRYPT_EMAIL=email \
    niico/simple-file-serve
```
