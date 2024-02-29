// @ts-check
import 'dotenv/config';

import { existsSync, lstatSync, promises } from 'fs';
import { normalize, join } from 'path';
import express, { urlencoded } from 'express';
import { format as formatDate } from 'date-fns';
import prettysize from 'prettysize';
import Datastore from 'nedb-promises';
import fileUpload from 'express-fileupload';
import expressSession from 'express-session';
import passport from 'passport';
import { getQuery, normalizeURL, parseURL, withQuery, resolveURL } from 'ufo';
import { check, init as authinit } from './server/auth.js';
import { init as apiinit } from './server/api.js';

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
app.use(urlencoded({ extended: true }));
app.use(express.json());
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
          if (existsSync(exists.file)) {
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

  app.get('/play/*', check, (req, res) => {
    const file = req.params[0];
    res.render('player', { file });
  });

  app.get('*', check, async (req, res) => {
    try {
      const url = parseURL(req.url);
      const query = getQuery(req.url);
      const pathname = decodeURIComponent(url.pathname);
      const folder = normalize(join(config.server.wwwroot, pathname));
      if (!existsSync(folder)) {
        res.status(404).send('Not found');
      } else if (!lstatSync(folder).isDirectory()) {
        res.sendFile(folder);
      } else {
        console.log(`Listing files in ${folder}`);
        const all = await promises.readdir(folder);
        const files = [];
        for (const f of all) {
          if (req['sync'] && f.endsWith('.partial~')) {
            // don't sync partial files
          } else if (!f.startsWith('.')) {
            const stats = await promises.lstat(join(folder, f));
            const isDir = stats.isDirectory();
            let base = url.pathname;
            if (!url.pathname.endsWith('/')) base += '/';
            let realpath = normalize(join(folder, f, isDir ? '/' : ''));
            const exists = await db.findOne({ file: realpath });
            const hidden = exists ? exists.hidden : false;
            if (!req['sync'] || !hidden) {
              let full = normalizeURL(resolveURL(base, f));
              full += isDir ? '/' : '';
              full = withQuery(full, query);
              files.push({
                name: f,
                full,
                fullJs: full.replace("'", "\\'"),
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
          up: withQuery(`${resolveURL(base, '..')}`, query),
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
    if (existsSync('/config/config.json')) {
      configlocation = '/config/config.json';
      dblocation = '/data/db.db';
    }

    db = Datastore.create({ filename: dblocation, autoload: true });

    const json = await promises.readFile(configlocation, 'utf8');
    const parsed = JSON.parse(json);
    Object.assign(config, parsed);
    console.log(config);

    authinit(config, app, passport);
    apiinit(config, db, app, passport);
    init();

    app.listen(config.server.port);

    console.log(`Listening on port ${config.server.port}`);
  } catch (e) {
    console.error(e);
  }
})();
