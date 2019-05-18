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

app.use(express.json());

app.use((req, res, next) => {
  try {
    let token = '';
    const auth = req.header('authorization');
    if (auth && auth.startsWith('Basic ')) {
      token = Buffer.from(auth.substring(6), 'base64').toString();
      token = token.substring(0, token.length - 1);
    } else {
      const url = Url.parse(req.url);
      if (url.query) {
        const qs = querystring.parse(url.query);
        if (qs.token) {
          token = qs.token.toString();
        }
      }
    }
    if (token) {
      if (token in config.tokens) {
        const permission = config.tokens[token];
        if (permission === 'admin') req['user'] = 'admin';
        if (req.url.startsWith('/api/')) {
          if (permission === 'admin') {
            // only admin can call api
            next();
          }
        } else {
          if (permission === 'admin' || new RegExp(permission).test(req.url)) {
            return next();
          }
        }
      }
    }
  } catch (e) {}
  console.log(`Unauthorized access to ${req.url}`);
  res.status(401).send('Nope');
});

app.post('/api', async (req, res) => {
  try {
    if (req.body.action === 'DELETE') {
      const url = Url.parse(req.body.file);
      const file = path.normalize(
        path.join(config.server.wwwroot, decodeURIComponent(url.pathname))
      );
      if (fs.existsSync(file)) {
        // await fs.promises.unlink(file);
      }
    } else if (req.body.action === 'HIDE') {
    }
    res.send({ ok: true });
  } catch (e) {
    res.status(500).send({ ok: false });
  }
});

app.get('*', async (req, res) => {
  const url = Url.parse(req.url);
  const pathname = decodeURIComponent(url.pathname);
  const folder = path.normalize(path.join(config.server.wwwroot, pathname));
  if (!fs.existsSync(folder)) {
    res.status(404).send('Not found');
  } else if (!fs.lstatSync(folder).isDirectory()) {
    // console.log(`Getting file ${folder}`);
    res.sendFile(folder);
  } else {
    console.log(`Listing files in ${folder}`);
    const all = await fs.promises.readdir(folder);
    const files = [];
    for (const f of all) {
      if (!f.startsWith('.')) {
        const stats = await fs.promises.lstat(path.join(folder, f));
        let base = url.pathname;
        if (!url.pathname.endsWith('/')) base += '/';
        let full = Url.resolve(base, f);
        full += stats.isDirectory() ? '/' : '';
        full += url.query ? `?${url.query}` : '';
        files.push({
          name: f,
          full,
          isDir: stats.isDirectory(),
          size: stats.isDirectory() ? '-' : prettysize(stats.size),
          modifiediso: stats.mtime.toISOString(),
          modified: formatDate(stats.mtime, 'YYYY-MM-DD HH:mm:ss')
        });
      }
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
      admin: req['user'] === 'admin',
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
