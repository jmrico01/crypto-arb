const fs = require("fs");
const winston = require("winston");
const logDir = "public/logs";
const logFileLong = "outputLong.log";
const logFileTrades = "outputTrades.log";

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
            level: "info"
        }),
        new (winston.transports.File)({
            json: false,
            name: "long",
            filename: logDir + "/" + logFileLong,
            timestamp: GetTimestamp,
            level: "debug"
        })
    ]
});
const cycleTradeLogger = new (winston.Logger)({
    transports: [
        new (winston.transports.File)({
            json: false,
            name: "trades",
            filename: logDir + "/" + logFileTrades,
            timestamp: GetTimestamp,
            level: "info"
        })
    ]
})

cycleLogger.info = cycleTradeLogger.info;
exports.cycle = cycleLogger;