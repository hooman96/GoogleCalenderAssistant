var Alexa = require('alexa-sdk');
var ical = require('ical');
var http = require('http');
var utils = require('util');

var fs = require('fs');
var readline = require('readline');
var google = require('googleapis');
var googleAuth = require('google-auth-library');

var SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
var TOKEN_DIR = './';
var TOKEN_PATH = TOKEN_DIR + 'calendar-nodejs-quickstart.json';

var states = {
    SEARCHMODE: '_SEARCHMODE',
    DESCRIPTION: '_DESKMODE',
};
// local variable holding reference to the Alexa SDK object
var alexa;

//OPTIONAL: replace with "amzn1.ask.skill.[your-unique-value-here]";
var APP_ID = undefined;

// URL to get the .ics from, in this instance we are getting from Stanford however this can be changed
var URL = "http://events.stanford.edu/eventlist.ics";

// Skills name
var skillName = "Google Calendar Assistant";

// Message when the skill is first called
var welcomeMessage = "You can ask for the events today. Search for events by date. or say help. What would you like? ";

// Message for help intent
var HelpMessage = "Here are some things you can say: Is there an event today? Is there an event on the 18th of July? What are the events next week? Are there any events tomorrow?  What would you like to know?";

var descriptionStateHelpMessage = "Here are some things you can say: Tell me about event one";

// Used when there is no data within a time period
var NoDataMessage = "Sorry there aren't any events scheduled. Would you like to search again?";

// Used to tell user skill is closing
var shutdownMessage = "Ok see you again soon.";

// Message used when only 1 event is found allowing for difference in punctuation
var oneEventMessage = "There is 1 event ";

// Message used when more than 1 event is found allowing for difference in punctuation
var multipleEventMessage = "There are %d events ";

// text used after the number of events has been said
var scheduledEventMessage = "scheduled for this time frame. I've sent the details to your Alexa app: ";

var firstThreeMessage = "Here are the first %d. ";

// the values within the {} are swapped out for variables
var eventSummary = "The %s event is, %s at %s on %s ";

// Only used for the card on the companion app
var cardContentSummary = "%s at %s on %s ";

// More info text
var haveEventsRepromt = "Give me an event number to hear more information.";

// Error if a date is out of range
var dateOutOfRange = "Date is out of range please choose another date";

// Error if a event number is out of range
var eventOutOfRange = "Event number is out of range please choose another event";

// Used when an event is asked for
var descriptionMessage = "Here's the description ";

// Used when an event is asked for
var killSkillMessage = "Ok, great, see you next time.";

var eventNumberMoreInfoText = "You can say the event number for more information.";

// used for title on companion app
var cardTitle = "Events";

// output for Alexa
var output = "";

// stores events that are found to be in our date range
var relevantEvents = [];

// Adding session handlers
var newSessionHandlers = {
    'LaunchRequest': function () {
        this.handler.state = states.SEARCHMODE;
        this.emit(':ask', skillName + " " + welcomeMessage, welcomeMessage);
    },

    'Unhandled': function () {
        this.emit(':ask', HelpMessage, HelpMessage);
    }
};

// Create a new handler with a SEARCH state
var startSearchHandlers = Alexa.CreateStateHandler(states.SEARCHMODE, {
    'AMAZON.YesIntent': function () {
        output = welcomeMessage;
        alexa.emit(':ask', output, welcomeMessage);
    },

    'AMAZON.NoIntent': function () {
        this.emit(':tell', shutdownMessage);
    },

    'AMAZON.RepeatIntent': function () {
        this.emit(':ask', output, HelpMessage);
    },

    'searchIntent': function () {
        // Declare variables
        var eventList = [];
        var slotValue = this.event.request.intent.slots.date.value;
        var parent = this;

        // Using the iCal library I pass the URL of where we want to get the data from.
        ical.fromURL(URL, {}, function (err, data) {
            // Loop through all iCal data found
            for (var k in data) {
                if (data.hasOwnProperty(k)) {
                    var ev = data[k];
                    // Pick out the data relevant to us and create an object to hold it.
                    var eventData = {
                        summary: removeTags(ev.summary),
                        location: removeTags(ev.location),
                        description: removeTags(ev.description),
                        start: ev.start
                    };
                    // add the newly created object to an array for use later.
                    eventList.push(eventData);
                }
            }
            // Check we have data
            if (eventList.length > 0) {
                // Read slot data and parse out a usable date
                var eventDate = getDateFromSlot(slotValue);
                // Check we have both a start and end date
                if (eventDate.startDate && eventDate.endDate) {
                    // initiate a new array, and this time fill it with events that fit between the two dates
                    relevantEvents = getEventsBeweenDates(eventDate.startDate, eventDate.endDate, eventList);

                    if (relevantEvents.length > 0) {
                        // change state to description
                        parent.handler.state = states.DESCRIPTION;

                        // Create output for both Alexa and the content card
                        var cardContent = "";
                        output = oneEventMessage;
                        if (relevantEvents.length > 1) {
                            output = utils.format(multipleEventMessage, relevantEvents.length);
                        }

                        output += scheduledEventMessage;

                        if (relevantEvents.length > 1) {
                            output += utils.format(firstThreeMessage, relevantEvents.length > 3 ? 3 : relevantEvents.length);
                        }

                        if (relevantEvents[0] != null) {
                            var date = new Date(relevantEvents[0].start);
                            output += utils.format(eventSummary, "First", removeTags(relevantEvents[0].summary), relevantEvents[0].location, date.toDateString() + ".");
                        }
                        if (relevantEvents[1]) {
                            var date = new Date(relevantEvents[1].start);
                            output += utils.format(eventSummary, "Second", removeTags(relevantEvents[1].summary), relevantEvents[1].location, date.toDateString() + ".");
                        }
                        if (relevantEvents[2]) {
                            var date = new Date(relevantEvents[2].start);
                            output += utils.format(eventSummary, "Third", removeTags(relevantEvents[2].summary), relevantEvents[2].location, date.toDateString() + ".");
                        }

                        for (var i = 0; i < relevantEvents.length; i++) {
                            var date = new Date(relevantEvents[i].start);
                            cardContent += utils.format(cardContentSummary, removeTags(relevantEvents[i].summary), removeTags(relevantEvents[i].location), date.toDateString()+ "\n\n");
                        }

                        output += eventNumberMoreInfoText;
                        alexa.emit(':askWithCard', output, haveEventsRepromt, cardTitle, cardContent);
                    } else {
                        output = NoDataMessage;
                        alexa.emit(':ask', output, output);
                    }
                }
                else {
                    output = NoDataMessage;
                    alexa.emit(':ask', output, output);
                }
            } else {
                output = NoDataMessage;
                alexa.emit(':ask', output, output);
            }
        });
    },
    
    'calendarIntent' : function() {
        var eventList = [];
        var slotValue = this.event.request.intent.slots.task.value;
        var parent = this;
    
        fs.readFile('client_secret.json', function processClientSecrets(err, content) {
            if (err) {
                alexa.emit(':tell', 'Error loading client secret file ' + err, 'Error loading client secret file ' + err);
                return;
            }
            // Authorize a client with the loaded credentials, then call the
            // Google Calendar API.
            authorize(JSON.parse(content), slotValue, listEvents);
        });
    },

    'AMAZON.HelpIntent': function () {
        output = HelpMessage;
        this.emit(':ask', output, output);
    },

    'AMAZON.StopIntent': function () {
        this.emit(':tell', killSkillMessage);
    },

    'AMAZON.CancelIntent': function () {
        this.emit(':tell', killSkillMessage);
    },

    'SessionEndedRequest': function () {
        this.emit('AMAZON.StopIntent');
    },

    'Unhandled': function () {
        this.emit(':ask', HelpMessage, HelpMessage);
    }
});

// Create a new handler object for description state
var descriptionHandlers = Alexa.CreateStateHandler(states.DESCRIPTION, {
    'eventIntent': function () {

        var repromt = " Would you like to hear another event?";
        var slotValue = this.event.request.intent.slots.number.value;

        // parse slot value
        var index = parseInt(slotValue) - 1;

        if (relevantEvents[index]) {

            // use the slot value as an index to retrieve description from our relevant array
            output = descriptionMessage + removeTags(relevantEvents[index].description);

            output += repromt;

            this.emit(':askWithCard', output, repromt, relevantEvents[index].summary, output);
        } else {
            this.emit(':tell', eventOutOfRange);
        }
    },

    'AMAZON.HelpIntent': function () {
        this.emit(':ask', descriptionStateHelpMessage, descriptionStateHelpMessage);
    },

    'AMAZON.StopIntent': function () {
        this.emit(':tell', killSkillMessage);
    },

    'AMAZON.CancelIntent': function () {
        this.emit(':tell', killSkillMessage);
    },

    'AMAZON.NoIntent': function () {
        this.emit(':tell', shutdownMessage);
    },

    'AMAZON.YesIntent': function () {
        output = welcomeMessage;
        alexa.emit(':ask', eventNumberMoreInfoText, eventNumberMoreInfoText);
    },

    'SessionEndedRequest': function () {
        this.emit('AMAZON.StopIntent');
    },

    'Unhandled': function () {
        this.emit(':ask', HelpMessage, HelpMessage);
    }
});

// register handlers
exports.handler = function (event, context, callback) {
    alexa = Alexa.handler(event, context);
    alexa.appId = APP_ID;
    alexa.registerHandlers(newSessionHandlers, startSearchHandlers, descriptionHandlers);
    alexa.execute();
};
//======== HELPER FUNCTIONS ==============

// Remove HTML tags from string
function removeTags(str) {
    if (str) {
        return str.replace(/<(?:.|\n)*?>/gm, '');
    }
}

// Given an AMAZON.DATE slot value parse out to usable JavaScript Date object
// Utterances that map to the weekend for a specific week (such as �this weekend�) convert to a date indicating the week number and weekend: 2015-W49-WE.
// Utterances that map to a month, but not a specific day (such as �next month�, or �December�) convert to a date with just the year and month: 2015-12.
// Utterances that map to a year (such as �next year�) convert to a date containing just the year: 2016.
// Utterances that map to a decade convert to a date indicating the decade: 201X.
// Utterances that map to a season (such as �next winter�) convert to a date with the year and a season indicator: winter: WI, spring: SP, summer: SU, fall: FA)
function getDateFromSlot(rawDate) {
    // try to parse data
    var date = new Date(Date.parse(rawDate));
    var result;
    // create an empty object to use later
    var eventDate = {

    };

    // if could not parse data must be one of the other formats
    if (isNaN(date)) {
        // to find out what type of date this is, we can split it and count how many parts we have see comments above.
        var res = rawDate.split("-");
        // if we have 2 bits that include a 'W' week number
        if (res.length === 2 && res[1].indexOf('W') > -1) {
            var dates = getWeekData(res);
            eventDate["startDate"] = new Date(dates.startDate);
            eventDate["endDate"] = new Date(dates.endDate);
            // if we have 3 bits, we could either have a valid date (which would have parsed already) or a weekend
        } else if (res.length === 3) {
            var dates = getWeekendData(res);
            eventDate["startDate"] = new Date(dates.startDate);
            eventDate["endDate"] = new Date(dates.endDate);
            // anything else would be out of range for this skill
        } else {
            eventDate["error"] = dateOutOfRange;
        }
        // original slot value was parsed correctly
    } else {
        eventDate["startDate"] = new Date(date).setUTCHours(0, 0, 0, 0);
        eventDate["endDate"] = new Date(date).setUTCHours(24, 0, 0, 0);
    }
    return eventDate;
}

// Given a week number return the dates for both weekend days
function getWeekendData(res) {
    if (res.length === 3) {
        var saturdayIndex = 5;
        var sundayIndex = 6;
        var weekNumber = res[1].substring(1);

        var weekStart = w2date(res[0], weekNumber, saturdayIndex);
        var weekEnd = w2date(res[0], weekNumber, sundayIndex);

        return Dates = {
            startDate: weekStart,
            endDate: weekEnd,
        };
    }
}

// Given a week number return the dates for both the start date and the end date
function getWeekData(res) {
    if (res.length === 2) {

        var mondayIndex = 0;
        var sundayIndex = 6;

        var weekNumber = res[1].substring(1);

        var weekStart = w2date(res[0], weekNumber, mondayIndex);
        var weekEnd = w2date(res[0], weekNumber, sundayIndex);

        return Dates = {
            startDate: weekStart,
            endDate: weekEnd,
        };
    }
}

// Used to work out the dates given week numbers
var w2date = function (year, wn, dayNb) {
    var day = 86400000;

    var j10 = new Date(year, 0, 10, 12, 0, 0),
        j4 = new Date(year, 0, 4, 12, 0, 0),
        mon1 = j4.getTime() - j10.getDay() * day;
    return new Date(mon1 + ((wn - 1) * 7 + dayNb) * day);
};

// Loops though the events from the iCal data, and checks which ones are between our start data and out end date
function getEventsBeweenDates(startDate, endDate, eventList) {

    var start = new Date(startDate);
    var end = new Date(endDate);

    var data = new Array();

    for (var i = 0; i < eventList.length; i++) {
        if (start <= eventList[i].start && end >= eventList[i].start) {
            data.push(eventList[i]);
        }
    }

    console.log("FOUND " + data.length + " events between those times");
    return data;
}

function authorize(credentials, slotValue, callback) {
    var clientSecret = credentials.installed.client_secret;
    var clientId = credentials.installed.client_id;
    var redirectUrl = credentials.installed.redirect_uris[0];
    
    var auth = new googleAuth();
    
    var oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, function(err, token) {
        if (err) {
            getNewToken(oauth2Client, slotValue, callback);
        } else {
            oauth2Client.credentials = JSON.parse(token);
            callback(oauth2Client, slotValue);
        }
    });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback to call with the authorized
 *     client.
 */
function getNewToken(oauth2Client, slotValue, callback) {
    var authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES
    });
    console.log('Authorize this app by visiting this url: ', authUrl);
    var rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    rl.question('Enter the code from that page here: ', function(code) {
        rl.close();
        oauth2Client.getToken(code, function(err, token) {
            if (err) {
                console.log('Error while trying to retrieve access token', err);
                return;
            }
            oauth2Client.credentials = token;
            storeToken(token);
            callback(oauth2Client, slotValue);
        });
    });
}

/**
 * Store token to disk be used in later program executions.
 *
 * @param {Object} token The token to store to disk.
 */
function storeToken(token) {
    try {
        fs.mkdirSync(TOKEN_DIR);
    } catch (err) {
        if (err.code != 'EEXIST') {
            throw err;
        }
    }
    fs.writeFile(TOKEN_PATH, JSON.stringify(token));
    console.log('Token stored to ' + TOKEN_PATH);
}

/**
 * Lists the next 10 events on the user's primary calendar.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function listEvents(auth, slotValue) {
    var calendar = google.calendar('v3');
    calendar.events.list({
        auth: auth,
        calendarId: 'primary',
        timeMin: (new Date()).toISOString(),
        maxResults: 100,
        singleEvents: true,
        orderBy: 'startTime'
    }, function(err, response) {
        if (err) {
            console.log('The API returned an error: ' + err);
            return;
        }
        var events = response.items;
        if (events.length == 0) {
            alexa.emit(':tell', 'No upcoming events found', 'No upcoming events found');
        } else {
            for (var i = 0, str = ""; i < events.length; i++) {
                
                str += events[i].summary;
            }
            
            alexa.emit(':tell', slotValue + "is" + str, slotValue + "is" + str);
        }
    });
}