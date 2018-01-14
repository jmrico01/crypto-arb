const fs = require("fs");
const winston = require("winston");
const logDir = "public/logs";
const logName = "output2.log";

if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

function GetTimestamp()
{
    var date = new Date(Date.now());
    return date.toLocaleDateString("en-US", {
        timeZone: "America/New_York",
        year: "2-digit",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
}

const cycleLogger = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)({
            timestamp: GetTimestamp,
            level: "debug"
        }),
        new (winston.transports.File)({
            json: false,
            filename: logDir + "/" + logName,
            timestamp: GetTimestamp,
            level: "debug"
        })
    ]
});

exports.cycle = cycleLogger;