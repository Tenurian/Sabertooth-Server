var express = require('express');
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var path = require('path');
var textract = require('textract');
var fs = require('fs');

/**/
var airports = require('./public/airports.js').filter(function(el) {
    return el.name !== "" && el.name !== null
});
var lines = require('./public/lines');

var filePath = 'public/DOC_FLIGHT_AUG17_ordCRJp.txt';
/**/

function getMarkedDates(line, color, textColor){
    textColor = (textColor === undefined)? '#000' : textColor;
    var out = {};
    line.work_days.map(function(wd, i, a) {
        var date_id = ''+new Date().getFullYear()+'-'+('000'+(parseInt(new Date().getMonth()+2)+((a.length-i<7 && wd.date <7)?1:0))).substr(-2)+'-'+('0000'+wd.date).substr(-2);
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
    return parseInt(l.sequences[l.sequences.length-1].days[l.sequences[l.sequences.length-1].days.length-1].day_end) >= start_time;
});
};
Array.prototype.diff = function(a) {
    return this.filter(function(i) {return a.indexOf(i) < 0;});
};

io.on('connection', function(socket){
    console.log('user with id '+socket.id+' connection');

    function sendFilteredLines(filter) {
        var filtered_lines = {};
        filtered_lines.green_lines=(lines.filterLinesByOffDays(filter.days_off)).filterLinesByStartTime(filter.start_time);
        filtered_lines.yellow_lines=lines.filterLinesByOffDays(filter.days_off).concat(lines.filterLinesByStartTime(filter.start_time)).unique().diff(filtered_lines.green_lines);
        filtered_lines.red_lines=lines.diff(filtered_lines.green_lines.concat(filtered_lines.yellow_lines).unique());
        filtered_lines.green_days = {};
        filtered_lines.green_lines.map(function(line){
            filtered_lines.green_days[line.id] = getMarkedDates(line, '#009900');
        });
        filtered_lines.yellow_days = {};
        filtered_lines.yellow_lines.map(function(line){
            filtered_lines.yellow_days[line.id] = getMarkedDates(line, '#ffee00')
        });
        filtered_lines.red_days = {};
        filtered_lines.red_lines.map(function(line){
            filtered_lines.red_days[line.id] = getMarkedDates(line, '#b71a1e', '#eeeeee');
        });
        console.log('sending filtered lines...', JSON.stringify(filtered_lines).length);
        socket.emit('LFL', filtered_lines);
        console.log('Sent!');
    }


    // socket.emit('load_lines', lines);

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
        sendFilteredLines(filter);
    });

    socket.on('request_airports', function () {
        socket.emit('load_airports', airports);
    });
    /* KEEP OLD CODE TO READ DATA FROM OTHER FILES LATER */

//     fs.readFile(filePath, function (err, f) {
//         if(err) throw err;
//         var data = {lines: undefined, sequences: undefined};
//         var splitter = '+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++';
//         var src = text.split(splitter);
//         // var src2 = [];
//         var lines = src[0];
//         var sequences = src[1];
//         var line_splitter = '---------------------------------------------------------------------------------------------------------------------------------------';
//         var seq_splitter = '========================================================================';
//         // src2.push(text.substr(text.indexOf(line_splitter), text.lastIndexOf(line_splitter)));
//         // src2.push(text.substr(text.indexOf(seq_splitter), text.lastIndexOf(seq_splitter)));
//         // lines = src2[0];
//         // sequences = src2[1];
//         var makeSequences = function(src){
//             var temp = src.split(seq_splitter);
//             return temp.map(function(e) {
//                 if(e!==''){
//                     var sequence = {
//                         days: [],
//                         id: undefined,
//                         base_report_time: undefined,
//                         bulk: undefined,
//                         deadhead: undefined,
//                         trip_rig: undefined,
//                         credit: undefined,
//                         TAFB: undefined,
//                         LDGS: undefined
//                     };
//                     e = e.replace(/\r/g, '');
//                     var lns = e.split('\n');
//                     if(lns[0].charAt(0) !== " "){
//                         lns.shift();
//                     }
//                     sequence.id = /[0-9]{5}/.exec(e)[0];
//                     //console.log('sequence id: ',sequence.id);
//                     var previous_flight_day = undefined;
//                     var day_schedule = {
//                         day: undefined,
//                         date: undefined,
//                         final_destination: undefined,
//                         day_end: undefined,
//                         total_flight_time: undefined,
//                         deadhead_time: undefined,
//                         time_off_ground: undefined,
//                         FDP: undefined,
//                         REPT: undefined,
//                         hotel: undefined,
//                         FDPLim: undefined,
//                         off_duty_period: undefined,
//                         flights: []
//                     };
//                     for(var i = 0; i < lns.length; i++){
//                         //console.log(lns[i]);
//                         var first_line_regex = /([0-9]{5}) *BASE REPT: ([0-9]*)L/;
//                         var flight_regex = / ([ 0-9]{2}|SA|SU|MO|TU|WE|TH|FR) {2}(DH|[ ]{2}) ([0-9]{4}) ([A-Z]{3})-([A-Z]{3}) ([0-9]{4}) ([0-9]{4}) {2}([0-9]{3}) {2}([ 0-9]{3}) ([0-9A-Z]{3})( {8}((--|[0-9]{2})?( -{2}|[0-9]{2})?( -{2}|[0-9]{2})?( -{2}|[0-9]{2})?( -{2}|[0-9]{2})?( -{2}|[0-9]{2})?( -{2}|[0-9]{2})?( -{2}|[0-9]{2})?))?( {5}([0-9]{3}) {2}([ 0-9]{3}) {2}([0-9]{3}) ([ 0-9]{4})( ([0-9]{4}))?)?/;
//                         var day_end_regex = /D-END: ([0-9]*L) *(REPT: ([0-9]*L))? *FDP: ([0-9]*) FDPLim: ([0-9]*)/;
//                         var totals_regex = /TOTALS BLK *([0-9]*) *DHD *([0-9]*) *TRIP RIG: *([0-9]*) *CDT *([0-9]*) T\.A\.F\.B\. *([0-9]*) *LDGS: *([0-9]*)/;
//                         var matches;
//                         if(first_line_regex.test(lns[i]))
//                         {
//                             matches = first_line_regex.exec(lns[i]);
//                             sequence.id = parseInt(matches[1]);
//                             // sequence.id = matches[1];
//                             sequence.base_report_time = parseInt(matches[2]);
//                         }
//                         else if(flight_regex.test(lns[i]))
//                         {
//                             matches = flight_regex.exec(lns[i]);
//                             if(day_schedule.day === undefined)
//                                 day_schedule.day = matches[1];
//                             var deadhead = matches[2] === 'DH';
//                             var flight_number = parseInt(matches[3]);
//                             var take_off_port = matches[4];
//                             var destination = matches[5];
//                             var take_off_time = parseInt(matches[6]);
//                             var landing_time = parseInt(matches[7]);
//                             var flight_time = parseInt(matches[8]);
//                             var ground_time = parseInt(matches[9]);
//                             var equipment = matches[10];
//                             var flight = {
//                                 deadhead: deadhead,
//                                 flight_number: flight_number,
//                                 take_off_port: take_off_port,
//                                 destination: destination,
//                                 take_off_time: take_off_time,
//                                 landing_time: landing_time,
//                                 flight_time: flight_time,
//                                 ground_time: ground_time,
//                                 equipment: equipment
//                             };
//
// //                                    console.log(flight);
//                             day_schedule.flights.push(flight);
//
//                             if(matches[11]){
//                                 // console.warn('add same-line calendar excess to outer calendar variable');
//                                 //grab the calendar data and add it to the previous lines of data for splitting
//                             } else if(matches[21]){
//                                 //flight is the last of the day
//                                 //flight/piloting time
//                                 day_schedule.total_flight_time = parseInt(matches[22]);
//                                 //deadhead
//                                 day_schedule.deadhead_time = parseInt(matches[23]);
//                                 //time off ground
//                                 day_schedule.time_off_ground = parseInt(matches[24]);
//                                 //fdp
//                                 day_schedule.FDP = parseInt(matches[25]);
//                                 if(matches[26]){
//                                     //off-duty-period
// //                                            console.log('\n\toff-duty-period; last flight of day\n\t');
//                                     day_schedule.off_duty_period = matches[27];
//                                     previous_flight_day = flight.day;
//                                     sequence.days.push(day_schedule);
//                                     day_schedule = {
//                                         // day: undefined,
//                                         final_destination: undefined,
//                                         day_end: undefined,
//                                         total_flight_time: undefined,
//                                         deadhead_time: undefined,
//                                         time_off_ground: undefined,
//                                         FDP: undefined,
//                                         FDPLim: undefined,
//                                         off_duty_period: undefined,
//                                         flights: [],
//                                         hotel: undefined
//                                     };
//                                 } else {
// //                                            console.warn('last flight of sequence');
//                                     day_schedule.off_duty_period = false;
//                                     previous_flight_day = undefined;
//                                     sequence.days.push(day_schedule);
//                                 }
//                             }
//                         }
//                         else if(day_end_regex.test(lns[i]))
//                         {
//                             matches = day_end_regex.exec(lns[i]);
//                             day_schedule.day_end = matches[1];
//                             if(matches[2] !== undefined){
//                                 day_schedule.REPT = matches[3];
//                                 day_schedule.hotel = / *([\S\- ]*)/.exec(lns[i+1])[1];
//                             }
//                             day_schedule.FDP = matches[4];
//                             day_schedule.FDPLim = matches[5];
//                         }
//                         else if(totals_regex.test(lns[i])){
//                             matches = totals_regex.exec(lns[i]);
//                             sequence.bulk = parseInt(matches[1]);
//                             sequence.deadhead = parseInt(matches[2]);
//                             sequence.trip_rig = parseInt(matches[3]);
//                             sequence.credit = parseInt(matches[4]);
//                             sequence.TAFB = parseInt(matches[5]);
//                             sequence.LDGS = parseInt(matches[6]);
//                         }
//                     }
//                     return sequence;
//                 }
//             }).filter(function(e){
//                 return e !== undefined;
//             }); //removes the last undefined sequence
//         };
//         data.sequences = makeSequences(sequences);
//
//         var makeLines = function(src) {
//             var temp = src.split(line_splitter);
//             return temp.map(function(e){
//                 e = e.replace(/\r/g, '');
//                 var lns = e.split('\n');
//                 var space_over = true;
//                 if(lns[0].charAt(0) !== " "){
//                     lns.shift();
//                 }
//                 // console.log(lns.length);
//                 // console.log(/(S-[0-9]|RLF|CMP|RSV)/.exec(lns[0]));
//                 return Object.assign({}, {
//                     dts: lns[0].substr(lns[0].indexOf(' ') + (space_over?1:0)).match(/.{1,3}/g),                            //dates
//                     dys: lns[1].substr(lns[1].indexOf(' ') + (space_over?1:0)).match(/.{1,3}/g),                            //days
//                     /**************************************************************************************************************/
//                     seq: lns[2].substr(lns[2].indexOf(' ') + (space_over?1:0), lns[2].indexOf('BLK')-1).match(/.{1,3}/g),   //sequence
//                     ovn: lns[3].substr(lns[3].indexOf(' ') + (space_over?1:0), lns[3].indexOf('CRD')-1).match(/.{1,3}/g),   //overnight locations
//                     // ovn2: (lns[3].substr(lns[3].indexOf(' ') + (space_over?1:0), lns[3].indexOf('CRD')-1).split(/ [:X] /)=== null
//                     // || lns[3].substr(lns[3].indexOf(' ') + (space_over?1:0), lns[3].indexOf('CRD')-1).split(/ [:X] /)=== undefined)
//                     //     ?null
//                     //     :lns[3].substr(lns[3].indexOf(' ') + (space_over?1:0), lns[3].indexOf('CRD')-1).split(/ [:X] /).map(function (sq) {
//                     //     return sq.match(/[A-Z]{1,3}/g);
//                     // }).filter(function (e) {
//                     //     return e !== null
//                     // }),   //overnight locations
//                     seq_data: lns[4].substr(lns[4].indexOf(' '), lns[4].indexOf('TAFB')-1).trim(),                          //sequence data
//                     misc: [                                                                                                  //other misc data
//                         lns[2].substr(
//                             lns[2].indexOf('BLK'),
//                             lns[2].indexOf(' DYS') - lns[2].indexOf('BLK')),
//                         lns[2].substr(lns[2].indexOf('DYS')),
//                         lns[3].substr(
//                             lns[3].indexOf('CRD'),
//                             lns[3].indexOf(' BLK') - lns[3].indexOf('CRD')),
//                         lns[3].substr(lns[3].indexOf('BLK')),
//                         lns[4].substr(
//                             lns[4].indexOf('TAFB'),
//                             lns[4].indexOf(' C/O') - lns[4].indexOf('TAFB')),
//                         lns[4].substr(lns[4].indexOf('C/O'))
//                     ],
//                     raw: e
//                 });
//             }).map(function(d){
//                 var sequence_numbers = d.seq.filter(function(sn) {
//                     return /[0-9]{3}/.test(sn);
//                 });
//                 /*will be used later... need to ask BC about the sequence data again*/
//                 // var sequence_data = d.seq_data.substr(0, d.seq_data.lastIndexOf(';')).split(';');
//                 var sequences = sequence_numbers.map(function(seq_id) {
//                     return data.sequences.filter(function(s) {
//                         return s.id % 1000 === parseInt(seq_id);
//                     })[0];
//                 });
//                 return Object.assign(d, {sequences: sequences, sequence_numbers: sequence_numbers});
//             }).map(function(final){
//                 var out = Object.assign({}, final);
//                 var overnights = [];
//                 for(var i = 0; i < final.ovn.length; i++){
//                     if(/[A-Z]{3}/.test(final.ovn[i])){
//                         var seq_id = '   ', j=0;
//                         while(seq_id === '   '){
//                             seq_id = final.seq[i-j];
//                             j++;
//                         }
//                         overnights.push({
//                             sequence: seq_id,
//                             airport: final.ovn[i],
//                             hotel: 'Hotel: ',// +sequence.days[day_number].hotel,
//                             day: final.dys[i],
//                             date: final.dts[i]
//                         });
//                     }
//                 }
//
//                 var days = final.dys;
//                 var dates = final.dts;
//                 var blk_no = final.misc[0].substr(final.misc[0].lastIndexOf(' ')+1);
//                 var credits = final.misc[2].substr(final.misc[2].lastIndexOf(' ')+1);
//                 var bulk = final.misc[3].substr(final.misc[3].lastIndexOf(' ')+1);
//                 var TAFB = final.misc[4].substr(final.misc[4].lastIndexOf(' ')+1);
//                 var carryover = final.misc[5].substr(final.misc[5].lastIndexOf(' ')+1);
//
//                 out.id = parseInt(blk_no);
//                 out.credits = parseFloat(credits);
//                 out.bulk = parseFloat(bulk);
//                 out.TAFB = parseFloat(TAFB);
//                 out.carryover = parseFloat(carryover);
//
//                 out.work_days = final.ovn.map(function (t, i, a) {
//                     if(!/ [X: ] /.exec(t)){
//                         // console.log('BLK NO. ',blk_no, t, i, days[i], dates[i]);
//                         return {
//                             date: parseInt(dates[i]),
//                             day: days[i].trim()
//                         };
//                     }
//                 }).filter(function (t, i, a) {
//                     // console.log(t, t===null);
//                     return t !== null && t!==undefined;
//                 });
//
//                 delete out.seq;
//                 delete out.ovn;
//                 delete out.ovn2;
//                 delete out.dys;
//                 delete out.dts;
//                 delete out.raw;
//                 delete out.ovn;
//                 delete out.misc;
//                 delete out.sequence_numbers;
//                 delete out.seq_data;
//                 return out;
//             });
//         };
//         data.lines = makeLines(lines);
//         console.log('attempting to emit data...');
//         // var out = {airports: airports, lines: data.lines};
//         console.log('out.length:', JSON.stringify(data.lines).length);
//     });
});

app.use('/', function(req, res){
    res.sendFile(path.join(__dirname, '/public/index.html'));
});

http.listen(31415, function () {
   console.log('listening on 31415');
});

// server.listen(8080);