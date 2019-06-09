// @ts-check
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const Url = require('url');
const querystring = require('querystring');
const express = require('express');
const formatDate = require('date-fns/format');
const prettysize = require('prettysize');
const del = require('del');
const Datastore = require('nedb-promises');
const shortid = require('shortid');
const fileUpload = require('express-fileupload');

let config = {};
let db = undefined;

const app = express();
app.set('view engine', 'ejs');

app.use(express.json());
app.use(fileUpload());
app.use((req, res, next) => {
  try {
    if (req.url.startsWith('/gimme/')) {
      // anonymous share
      return next();
    }

    let token = '';
    const auth = req.header('authorization');
    if (auth && auth.startsWith('Basic ')) {
      token = Buffer.from(auth.substring(6), 'base64').toString();
      token = token.substring(0, token.length - 1);
      req['sync'] = true;
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
        if (permission === 'admin') {
          req['user'] = 'admin';
          return next();
        } else if (!req.url.startsWith('/api/')) {
          if (new RegExp(permission).test(req.url)) {
            return next();
          }
        }
      }
    }
  } catch (e) {}
  console.log(`Unauthorized access to ${req.url}`);
  res.status(401).send('Nope');
});

app.post('/api/delete', async (req, res) => {
  try {
    const url = Url.parse(req.body.file);
    const name = decodeURIComponent(url.pathname);
    console.log(`Delete ${name}`);
    const file = path.normalize(path.join(config.server.wwwroot, name));
    if (fs.existsSync(file)) {
      const stats = await fs.promises.lstat(file);
      if (stats.isDirectory()) {
        console.log(`delete folder ${file}`);
        await del(file + '**', { force: true });
      } else {
        await fs.promises.unlink(file);
      }
    }
    res.send({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).send({ ok: false, error: e.message });
  }
});

app.post('/api/hide', async (req, res) => {
  try {
    const url = Url.parse(req.body.file);
    const pathname = decodeURIComponent(url.pathname);
    console.log(`Hide ${pathname}`);
    const file = path.normalize(path.join(config.server.wwwroot, pathname));
    let hidefile = true;
    const exists = await db.findOne({ file });
    if (exists) {
      hidefile = !exists.hidden;
      await db.update({ file }, { $set: { hidden: hidefile } });
    } else {
      await db.insert({ file, hidden: true });
    }
    return res.send({ ok: true, hide: hidefile });
  } catch (e) {
    console.error(e);
    res.status(500).send({ ok: false, error: e.message });
  }
});

app.post('/api/share', async (req, res) => {
  try {
    const url = Url.parse(req.body.file);
    const pathname = decodeURIComponent(url.pathname);
    console.log(`Share ${pathname}`);
    const file = path.normalize(path.join(config.server.wwwroot, pathname));
    const exists = await db.findOne({ file });
    let shareid = shortid.generate();
    if (exists) {
      if (exists.shareid) {
        shareid = exists.shareid;
      } else {
        await db.update({ file }, { $set: { shareid } });
      }
    } else {
      await db.insert({ file, hidden: false, shareid });
    }
    return res.send({ ok: true, shareid });
  } catch (e) {
    console.error(e);
    res.status(500).send({ ok: false, error: e.message });
  }
});

app.post('/api/upload', async (req, res) => {
  console.log('file upload');
  const file = req.files.file;
  // @ts-ignore
  const name = file.name;
  const full = path.normalize(
    path.join(config.server.wwwroot, req.body.path, name)
  );
  // @ts-ignore
  await file.mv(full);
  res.send(path.join(req.body.path, name));
});

app.get('/gimme/:hash', async (req, res) => {
  try {
    if (req.params.hash) {
      const exists = await db.findOne({ shareid: req.params.hash });
      if (exists) {
        if (fs.existsSync(exists.file)) {
          return res.download(exists.file);
        }
      }
      return res.status(404).send('Not Found.');
    }
  } catch (e) {
    console.error(e);
    res.status(500).send({ ok: false, error: e.message });
  }
});

app.get('*', async (req, res) => {
  try {
    const url = Url.parse(req.url);
    const pathname = decodeURIComponent(url.pathname);
    const folder = path.normalize(path.join(config.server.wwwroot, pathname));
    if (!fs.existsSync(folder)) {
      res.status(404).send('Not found');
    } else if (!fs.lstatSync(folder).isDirectory()) {
      res.sendFile(folder);
    } else {
      console.log(`Listing files in ${folder}`);
      const all = await fs.promises.readdir(folder);
      const files = [];
      for (const f of all) {
        if (req['sync'] && f.endsWith('.partial~')) {
          // don't sync partial files
        } else if (!f.startsWith('.')) {
          const stats = await fs.promises.lstat(path.join(folder, f));
          const isDir = stats.isDirectory();
          let base = url.pathname;
          if (!url.pathname.endsWith('/')) base += '/';
          let realpath = path.normalize(path.join(folder, f, isDir ? '/' : ''));
          const exists = await db.findOne({ file: realpath });
          const hidden = exists ? exists.hidden : false;
          if (!req['sync'] || !hidden) {
            let full = Url.resolve(base, f);
            full += isDir ? '/' : '';
            full += url.query ? `?${url.query}` : '';
            files.push({
              name: f,
              full,
              isDir: isDir,
              size: isDir ? '-' : prettysize(stats.size),
              modifiediso: stats.mtime.toISOString(),
              modified: formatDate(stats.mtime, 'YYYY-MM-DD HH:mm:ss'),
              hidden: req['user'] === 'admin' && hidden
            });
          }
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
  } catch (e) {
    console.error(e);
    res.status(500).send('oups');
  }
});

(async () => {
  console.log('Starting...');
  try {
    let configlocation = 'config.json';
    let dblocation = 'db.db';
    if (fs.existsSync('/config/config.json')) {
      configlocation = '/config/config.json';
      dblocation = '/data/db.db';
    }

    db = new Datastore({ filename: dblocation, autoload: true });

    const json = await fs.promises.readFile(configlocation, 'utf8');
    config = JSON.parse(json);
    console.log(config);

    app.listen(config.server.port);
  } catch (e) {
    console.error(e);
  }
})();
