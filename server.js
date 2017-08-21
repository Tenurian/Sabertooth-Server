var express         = require('express');
var app             = require('express')();
var http            = require('http').Server(app);
var io              = require('socket.io')(http);
var path            = require('path');
var textract        = require('textract');
var fs              = require('fs');
var db              = require('./public/db.js');
var passport        = require('passport');
var session         = require('express-session');
var cookieParser    = require('cookie-parser');
var bodyParser      = require('body-parser');

app.use(cookieParser());
app.use(bodyParser());
app.use(session({ secret: 'developmentsecretpassphrase'}));
app.use(passport.initialize());
app.use(passport.session());
/**/
var airports = require('./public/airports.js').filter(function(el) {
    return el.name !== "" && el.name !== null
});
var lines = require('./public/lines');

function getMarkedDates(line, color, textColor){
    textColor = (textColor === undefined)? '#000' : textColor;
    var out = {};
    line.work_days.map(function(wd, i, a) {
        var date_id = ''+new Date().getFullYear()+'-'+('08').substr(-2)+'-'+('0000'+wd.date).substr(-2);
    if(!((a.length-i<7 && wd.date <7)))
    // out[date_id] = {selected: true, marked: true};
        if(i > 0 && i < a.length-1){
            if(wd.date === a[i-1].date+1 && wd.date === a[i+1].date-1){
                out[date_id] = [{color: color, textColor: textColor}];
            } else if(wd.date === a[i-1].date+1 && wd.date !== a[i+1].date-1){
                out[date_id] = [{endingDay: true, color: color, textColor: textColor}];
                // console.log('endingDay');
            } else if(wd.date !== a[i-1].date+1 && wd.date === a[i+1].date-1){
                out[date_id] = [{startingDay: true, color: color, textColor: textColor}];
                // console.log('startingDay');
            } else {
                console.error('shit hit the fan', a[i-1], wd, a[i+1]);
                throw new Error();
            }
        } else if(i === 0){
            out[date_id] = [{startingDay: true, color: color, textColor: textColor}];
        } else if(i === a.length-1){
            out[date_id] = [{endingDay: true, color: color, textColor: textColor}];
        } else {
            console.error('shit hit the fan 2');
            throw new Error();
        }
    // out[date_id] = {startingDay: true, endingDay: true, color: '#009900', selected: true, marked: true};
});
    return out;
}
Array.prototype.unique = function() {
    var a = this.concat();
    for(var i=0; i<a.length; ++i) {
        for(var j=i+1; j<a.length; ++j) {
            if(a[i] === a[j])
                a.splice(j--, 1);
        }
    }

    return a;
};
Array.prototype.filterLinesByOffDays = function(off_days) {
    var lines = this.concat();
    if(off_days.length === 0){
        return lines;
    }
    return lines.filter(function(l) {
            // console.log(JSON.stringify(l));
            if(l.id === -1){
        return true;
    }
    return l.work_days.filter(function(d) {
            // return d.day === days_off;
            return off_days.indexOf(d.day) > -1
        }).length === 0 && l.work_days.length > 0;
});
};
Array.prototype.filterLinesByStartTime = function(start_time) {
    var lines = this.concat();
    if(start_time === 0) {
        return lines;
    }

    return lines.filter(function(l) {
            if(l.id === -1){
        return true;
    }
    if(l.sequences.length === 0){
        return false;
    }
    return l.sequences[0].base_report_time >= start_time;
});
};
Array.prototype.filterLinesByEndTime = function(end_time) {
    var lines = this.concat();
    if(end_time === 0) {
        return lines;
    }

    return lines.filter(function(l) {
            if(l.id === -1){
        return true;
    }
    if(l.sequences.length === 0){
        return false;
    }
    return parseInt(l.sequences[l.sequences.length-1].days[l.sequences[l.sequences.length-1].days.length-1].day_end) <= end_time;
});
};
Array.prototype.diff = function(a) {
    return this.filter(function(i) {return a.indexOf(i) < 0;});
};

var filePath = 'public/DOC_FLIGHT_AUG17_ordCRJp.txt';

io.on('connection', function(socket){
    console.log('user with id '+socket.id+' connected');

    // console.log(socket);

    socket.emit('something', {data: 'test'});

    socket.on('ping', function() {
        console.log('ping');
        socket.emit('pong');
    });

    function sendFilteredLines(filter) {
        var filtered_lines = {};
        filtered_lines.green_lines=(lines.filterLinesByOffDays(filter.days_off)).filterLinesByStartTime(filter.start_time).filterLinesByEndTime(filter.end_time);
        filtered_lines.green_lines.map(function(line){
            line['marked_days'] = getMarkedDates(line, '#009900');
        });
        var green_out = filtered_lines.green_lines;
        console.log('sending green lines...', JSON.stringify(green_out).length);
        socket.emit('LGL', green_out);

        filtered_lines.yellow_lines=lines.filterLinesByOffDays(filter.days_off).concat(lines.filterLinesByStartTime(filter.start_time)).concat(lines.filterLinesByEndTime(filter.end_time)).unique().diff(filtered_lines.green_lines);
        filtered_lines.yellow_lines.map(function(line){
            line['marked_days'] = getMarkedDates(line, '#ffee00');
        });
        var yellow_out = filtered_lines.yellow_lines;
        console.log('sending yellow lines...', JSON.stringify(yellow_out).length);
        socket.emit('LYL', yellow_out);

        filtered_lines.red_lines=lines.diff(filtered_lines.green_lines.concat(filtered_lines.yellow_lines).unique());
        filtered_lines.red_lines.map(function(line){
            line['marked_days'] = getMarkedDates(line, '#b71a1e', '#eeeeee');
        });
        var red_out = filtered_lines.red_lines;
        console.log('sending red lines...', JSON.stringify(red_out).length);
        socket.emit('LRL', red_out);
        console.log('Sent!');
    }

    function getFilteredLines(filter) {
        console.log('getFilteredLines');
        filter.start_time = filter.start_time===undefined?0:filter.start_time;
        filter.end_time = filter.end_time===undefined?2359:filter.end_time;
        filter.days_off = filter.days_off===undefined?[]:filter.days_off;

        var filtered_lines = {};
        filtered_lines.green_lines=(lines.filterLinesByOffDays(filter.days_off)).filterLinesByStartTime(filter.start_time).filterLinesByEndTime(filter.end_time);
        filtered_lines.green_lines.map(function(line){
            line['markedDates'] = getMarkedDates(line, '#009900');
        });
        filtered_lines.yellow_lines=lines.filterLinesByOffDays(filter.days_off).concat(lines.filterLinesByStartTime(filter.start_time)).concat(lines.filterLinesByEndTime(filter.end_time)).unique().diff(filtered_lines.green_lines);
        filtered_lines.yellow_lines.map(function(line){
            line['markedDates'] = getMarkedDates(line, '#ffee00');
        });
        filtered_lines.red_lines=lines.diff(filtered_lines.green_lines.concat(filtered_lines.yellow_lines).unique());
        filtered_lines.red_lines.map(function(line){
            line['markedDates'] = getMarkedDates(line, '#b71a1e', '#eeeeee');
        });
        return filtered_lines;
    }

    socket.on('disconnect', function(){
        console.log('user with id '+socket.id+' disconnected');
    });

    socket.on('request_text', function () {
        fs.readFile(filePath, function (err, f) {
            if (err) throw err;
            // console.log('OK: '+filePath);
            var text = f.toString();
            socket.emit('load_text', text);
        });
    });

    socket.on('GFL', function (filter) {
        // sendFilteredLines(filter);
        console.log('GFL was called');
    });

    socket.on('GGL', function (filter) {
        console.log('GGL => LGL');
        socket.emit('LGL', getFilteredLines(filter).green_lines);
    });

    socket.on('GYL', function (filter) {
        console.log('GYL => LYL');
        socket.emit('LYL', getFilteredLines(filter).yellow_lines);
    });

    socket.on('GRL', function (filter) {
        console.log('GRL => LRL');
        socket.emit('LRL', getFilteredLines(filter).red_lines);
    });

    socket.on('request_airports', function () {
        socket.emit('load_airports', airports);
    });
});

require('./config/passport')(passport);

require('./app/routes.js')(app, passport);

app.get('/', function(req, res){
    res.sendFile(path.join(__dirname, '/public/index.html'));
});

http.listen(31415, function () {
   console.log('listening on 31415');
});

// server.listen(8080);