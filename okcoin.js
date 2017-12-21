const WebSocket = require("ws");
const ordHash = require("./ordered-hash");

const key = "17de37be-57ff-4575-b12d-d4e1428dbf5a";
const host = "wss://real.okcoin.com:10440/websocket/okcoinapi";

const ws = new WebSocket(host);
ws.on("message", OnIncoming);
ws.on("open", function open() {
    console.log("Client: Connected");

    var req = {
        event: "addChannel",
        channel: "ok_sub_spot_btc_usd_depth"
    };
    ws.send(JSON.stringify(req));

    // Send heartbeats
    setInterval(function() {
        console.log()
        ws.send(JSON.stringify({ event: "ping" }));
    }, 10 * 1000)
});

function CompareFloatStrings(s1, s2)
{
    var f1 = parseFloat(s1);
    var f2 = parseFloat(s2);
    if (f1 < f2)    return -1;
    if (f1 > f2)    return 1;
    else            return 0;
}

var asks = ordHash.Create(CompareFloatStrings);
var bids = ordHash.Create(CompareFloatStrings);

function ProcessIncDepthMessage(data)
{
    var timestamp = data.timestamp;
    if (data.asks !== undefined) {
        for (var i = 0; i < data.asks.length; i++) {
            var price = data.asks[i][0];
            var volume = data.asks[i][1];

            if (asks.exists(price)) {
                if (parseFloat(volume) === 0.0) {
                    asks.delete(price);
                }
                else {
                    asks.set(price, [volume, timestamp]);
                }
            }
            else {
                asks.insert(price, [volume, timestamp]);
            }
        }
    }
    if (data.bids !== undefined) {
        for (var i = 0; i < data.bids.length; i++) {
            var price = data.bids[i][0];
            var volume = data.bids[i][1];
            
            if (bids.exists(price)) {
                if (parseFloat(volume) === 0.0) {
                    bids.delete(price);
                }
                else {
                    bids.set(price, [volume, timestamp]);
                }
            }
            else {
                bids.insert(price, [volume, timestamp]);
            }
        }
    }
}

function OnIncoming(msg)
{
    try {
        msg = JSON.parse(msg);
    }
    catch (err) {
        console.log("Unparsable msg:");
        console.log(msg);
        return;
    }
    
    if (Array.isArray(msg)) {
        if (msg.length > 1) {
            console.log("Message is array with length: " + msg.length);
            console.log("Possible loss of data...");
        }

        msg = msg[0];
        if (msg.hasOwnProperty("channel")) {
            if (msg.channel === "ok_sub_spot_btc_usd_depth") {
                ProcessIncDepthMessage(msg.data);
            }
            else {
                console.log("Message from unhandled channel:")
                console.log(msg);
            }
        }
        else {
            console.log("Unhandled array message:");
            console.log(msg);
        }
    }
    else {
        if (msg.hasOwnProperty("event")) {
            if (msg.event === "pong") {
                console.log("pong!");
            }
        }
        else {
            console.log("Unhandled message:");
            console.log(msg);
        }
    }
}

exports.asks = asks;
exports.bids = bids;