// @ts-check
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const Url = require('url');
const querystring = require('querystring');
const express = require('express');
const formatDate = require('date-fns/format');
const prettysize = require('prettysize');

let config = {};
const app = express();
app.set('view engine', 'ejs');

app.use((req, res, next) => {
  const url = Url.parse(req.url);
  if (url.query) {
    const qs = querystring.parse(url.query);
    if (qs.token && qs.token in config.tokens) {
      const permission = config.tokens[qs.token.toString()];
      if (permission === 'admin' || new RegExp(permission).test(req.url)) {
        return next();
      }
    }
  }
  res.status(401).send('Nope');
});

app.get('*', async (req, res) => {
  const url = Url.parse(req.url);
  const pathname = decodeURIComponent(url.pathname);
  const folder = path.normalize(path.join(config.server.wwwroot, pathname));
  if (!fs.existsSync(folder)) {
    res.status(404).send('Not found');
  } else if (!fs.lstatSync(folder).isDirectory()) {
    res.send(folder);
  } else {
    const all = await fs.promises.readdir(folder);
    const files = [];
    for (const f of all) {
      const stats = await fs.promises.lstat(path.join(folder, f));
      let base = url.pathname;
      if (!url.pathname.endsWith('/')) base += '/';
      files.push({
        name: f,
        full: `${Url.resolve(base, f)}${url.query ? `?${url.query}` : ''}`,
        isDir: stats.isDirectory(),
        size: stats.isDirectory() ? '-' : prettysize(stats.size),
        modified: formatDate(stats.mtime, 'DD/MM/YYYY HH:mm:ss')
      });
    }
    files.sort((a, b) => {
      if (a.isDir === b.isDir) {
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      } else if (a.isDir) {
        return -1;
      } else {
        return 1;
      }
    });
    let base = url.pathname;
    if (!url.pathname.endsWith('/')) base += '/';
    res.render('folder', {
      up: `${Url.resolve(base, '..')}${url.query ? `?${url.query}` : ''}`,
      path: pathname,
      files
    });
  }
});

(async () => {
  let json = '{}';
  if (fs.existsSync('/config/config.json')) {
    json = await fs.promises.readFile('/config/config.json', 'utf8');
  } else if (fs.existsSync('config.json')) {
    json = await fs.promises.readFile('config.json', 'utf8');
  }
  config = JSON.parse(json);
  console.log(config);
  app.listen(8080);
})();
