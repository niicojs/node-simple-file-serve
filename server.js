// @ts-check
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const Url = require('url');
const express = require('express');
const { format: formatDate } = require('date-fns');
const prettysize = require('prettysize');
const Datastore = require('nedb-promises');
const fileUpload = require('express-fileupload');
const bodyParser = require('body-parser');
const expressSession = require('express-session');
const passport = require('passport');
const auth = require('./server/auth');
const api = require('./server/api');

const config = { server: { port: 8080 }, options: {}, users: [] };
let db = undefined;

const app = express();
app.set('view engine', 'ejs');

app.use(
  expressSession({
    secret: 'secret stuff',
    resave: true,
    saveUninitialized: false,
  })
);
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(fileUpload());

const isVideo = (name) => {
  if (!config.options.player) return false;

  const lname = name.toLowerCase();
  return (
    lname.endsWith('.avi') || lname.endsWith('.mp4') || lname.endsWith('mkv')
  );
};

const init = () => {
  app.get('/gimme/:hash', async (req, res) => {
    try {
      if (req.params.hash) {
        const exists = await db.findOne({ shareid: req.params.hash }).exec();
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

  app.get('/play/*', auth.check, (req, res) => {
    const file = req.params[0];
    res.render('player', { file });
  });

  app.get('*', auth.check, async (req, res) => {
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
            let realpath = path.normalize(
              path.join(folder, f, isDir ? '/' : '')
            );
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
                isVideo: !isDir && isVideo(f),
                size: isDir ? '-' : prettysize(stats.size),
                modifiediso: stats.mtime.toISOString(),
                modified: formatDate(stats.mtime, 'yyyy-MM-dd HH:mm:ss'),
                hidden: req.user && req.user['name'] === 'admin' && hidden,
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
        res.render('main', {
          username: req.user ? req.user['name'] : 'anonymous',
          admin: req.user && req.user['name'] === 'admin',
          up: `${Url.resolve(base, '..')}${url.query ? `?${url.query}` : ''}`,
          path: pathname,
          files,
        });
      }
    } catch (e) {
      console.error(e);
      res.status(500).send('oups');
    }
  });
};

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
    const parsed = JSON.parse(json);
    Object.assign(config, parsed);
    console.log(config);

    auth.init(config, app, passport);
    api.init(config, db, app, passport);
    init();

    app.listen(config.server.port);

    console.log(`Listening on port ${config.server.port}`);
  } catch (e) {
    console.error(e);
  }
})();
