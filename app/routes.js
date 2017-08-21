/**
 * Created by tfeue on 8/21/2017.
 */
module.exports = function(app, passport){

    function isLoggedIn(req, res, next){
        if (req.isAuthenticated())
            return next();

        // if they aren't redirect them to the home page
        res.sendStatus(403);
    }

    app.get('/login', passport.authenticate('local-login', {
        successRedirect: '/login_success',
        failureRedirect: '/login_failure'
    }));

    app.get('/logout', function(req,res){

    });

    app.post('/signup', passport.authenticate('local-signup', {
        successRedirect : '/signup_success', // redirect to the secure profile section
        failureRedirect : '/signup_failure' // redirect back to the signup page if there is an error
    }));

    app.post('/login', passport.authenticate('local-login', {
        successRedirect : '/login_success', // redirect to the secure profile section
        failureRedirect : '/login_failure' // redirect back to the signup page if there is an error
    }));

    app.get('/login_success', function (req, res) {
        res.sendStatus(200);
    });
    app.get('/login_failure', function (req, res) {
        res.sendStatus(503);
    });
    app.get('/signup_success', function (req, res) {
        res.sendStatus(200);
    });
    app.get('/signup_failure', function (req, res) {
        res.sendStatus(503);
    });

};