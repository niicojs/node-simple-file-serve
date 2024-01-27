// @ts-check
import { existsSync, promises } from 'fs';
import { posix as path } from 'path';
import { $URL } from 'ufo';
import isPathInside from 'is-path-inside';
import { generate } from 'shortid';
import { checkadmin } from './auth.js';

export function init(config, db, app, passport) {
  app.use('/api/*', checkadmin);

  app.post('/api/delete', async (req, res) => {
    try {
      const url = new $URL(req.body.file);
      const name = decodeURIComponent(url.pathname || '');
      console.log(`Delete ${name}`);
      const file = path.normalize(path.join(config.server.wwwroot, name));
      if (existsSync(file)) {
        if (!isPathInside(file, config.server.wwwroot)) {
          res.status(403).send({ ok: false });
        } else {
          const supprime = async (file) => {
            const stats = await promises.lstat(file);
            if (stats.isDirectory()) {
              const files = await promises.readdir(file);
              for (const sub of files) {
                await supprime(path.join(file, sub));
              }
              await promises.rmdir(file);
            } else {
              await promises.unlink(file);
            }
          };
          await supprime(file);
          res.send({ ok: true });
        }
      } else {
        res.status(404).send({ ok: false });
      }
    } catch (e) {
      console.error(e);
      res.status(500).send({ ok: false, error: e.message });
    }
  });

  app.post('/api/hide', async (req, res) => {
    try {
      const url = new $URL(req.body.file);
      const pathname = decodeURIComponent(url.pathname || '');
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
      const url = new $URL(req.body.file);
      const pathname = decodeURIComponent(url.pathname || '');
      console.log(`Share ${pathname}`);
      const file = path.normalize(path.join(config.server.wwwroot, pathname));
      const exists = await db.findOne({ file });
      let shareid = generate();
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
}
