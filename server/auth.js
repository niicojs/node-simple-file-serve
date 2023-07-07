// @ts-check
const passport = require('passport');
const { BasicStrategy } = require('passport-http');
const { Strategy: LocalStrategy } = require('passport-local');

const authenticate = (config) => (username, password, done) => {
  const user = config.users.find(
    (u) => u.name === username && u.key === password
  );
  if (user) {
    return done(null, user);
  } else {
    return done(null, false);
  }
};

module.exports.checkadmin = (req, res, next) => {
  if (req.isAuthenticated() && req['user'].name === 'admin') {
    return next();
  } else {
    res.status(401).send('Nope');
  }
};

module.exports.check = (req, res, next) => {
  // console.log(`Auth check ${req.url}`);
  const validate = (user) => {
    if (user.name === 'admin') {
      return next();
    } else {
      const permission = user.permission;
      if (new RegExp(permission).test(req.url)) {
        return next();
      }
    }
  };
  try {
    if (req.header('user-agent')?.startsWith('rclone/')) {
      req.sync = true;
      if (!req.isAuthenticated()) {
        return passport.authenticate(
          'basic',
          { session: false },
          (err, user) => {
            if (err) res.status(400).send('Oups');
            else if (user) validate(user);
            else res.status(401).send('Nope');
          }
        )(req, res, next);
      } else {
        console.log('rclone but authenticated?');
      }
    } else if (req.isAuthenticated()) {
      return validate(req.user);
    }
  } catch (e) {
    console.error(e);
  }

  console.log(`Unauthorized access to ${req.url}`);
  res.redirect('/login');
};

module.exports.init = (config, app, passport) => {
  passport.use(new LocalStrategy(authenticate(config)));
  passport.use(new BasicStrategy(authenticate(config)));

  passport.serializeUser((user, cb) => cb(null, JSON.stringify(user)));
  passport.deserializeUser((str, cb) => cb(null, JSON.parse(str)));

  app.use(passport.initialize());
  app.use(passport.session());

  app.get('/login', (_, res) => res.render('login'));

  app.post(
    '/login',
    passport.authenticate('local', { failureRedirect: '/login' }),
    (_, res) => res.redirect('/')
  );
};
