const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { masterPool } = require('./database');

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const result = await masterPool.query('SELECT * FROM users WHERE id = $1', [id]);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            // Assign default tenant code for single-tenant/master instance users
            user.tenant_code = process.env.DEFAULT_TENANT_CODE || 'master';
            done(null, user);
        } else {
            // User might have been deleted or DB reset
            done(null, null);
        }
    } catch (err) {
        done(err, null);
    }
});

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback',
    passReqToCallback: true
}, async (req, accessToken, refreshToken, profile, done) => {
    const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
    const googleId = profile.id;
    const displayName = profile.displayName;

    if (!email) {
        return done(new Error('No email found in Google profile'), null);
    }

    try {
        // Check if user exists
        let result = await masterPool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (result.rows.length > 0) {
            // User exists
            const user = result.rows[0];
            // Update Google ID if missing
            if (!user.google_id) {
                await masterPool.query('UPDATE users SET google_id = $1 WHERE email = $2', [googleId, email]);
                user.google_id = googleId;
            }
            return done(null, user);
        } else {
            // New user
            const isSuperAdmin = email === 'jaigaurav56789@gmail.com';
            const role = isSuperAdmin ? 'admin' : 'employee'; 
            const status = isSuperAdmin ? 'active' : 'pending';

            const newUserResult = await masterPool.query(
                `INSERT INTO users (google_id, email, name, role, account_status) 
                 VALUES ($1, $2, $3, $4, $5) RETURNING *`,
                [googleId, email, displayName, role, status]
            );
            return done(null, newUserResult.rows[0]);
        }
    } catch (err) {
        return done(err, null);
    }
}));

module.exports = passport;
