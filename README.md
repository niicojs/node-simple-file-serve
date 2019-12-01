# simple file serve

[![Greenkeeper badge](https://badges.greenkeeper.io/niicojs/node-simple-file-serve.svg)](https://greenkeeper.io/)

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

## rclone config

`http` with url like `https://secrettoken@files.server.com/`

## cron

```
0 9 * * 1-5 /storage/rclone copy remotefiles:/ /media/Media --log-file /storage/rclone.log --log-format INFO >/dev/null 2>&1
30 23 * * 6 /storage/rclone copy remotefiles:/ /media/Media --log-file /storage/rclone.log --log-format INFO >/dev/null 2>&1
```
