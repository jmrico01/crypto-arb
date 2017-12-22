const WebSocket = require("ws");

const ordHash = require("./ordered-hash");

const key = "17de37be-57ff-4575-b12d-d4e1428dbf5a";
const host = "wss://real.okcoin.com:10440/websocket/okcoinapi";

// TODO this connection isn't being checked for and restarted.

function Print(msg)
{
    console.log("(OKCoin) " + msg);
}

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

var connection = null;

function CreateConnection()
{
    var ws = null;

    var checkConnInterval = null;
    var CHECK_CONN_TIME = 5; // secs

    function WebSocketSend(data)
    {
        if (ws !== null && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(data));
        } 
    }

    function Close()
    {
        Print("call to Close()");

        if (ws !== null) {
            ws.on("message", function() {});
            if (ws.readyState === WebSocket.OPEN) {
                //ws.close();
                ws.terminate();
            }
            ws = null;
        }

        asks.clear();
        bids.clear();
    }

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
            Print("unparsable msg:");
            Print(msg);
            return;
        }
        
        if (Array.isArray(msg)) {
            if (msg.length > 1) {
                Print("message is array with length: " + msg.length);
                Print("possible loss of data...");
            }

            msg = msg[0];
            if (msg.hasOwnProperty("channel")) {
                if (msg.channel === "ok_sub_spot_btc_usd_depth") {
                    ProcessIncDepthMessage(msg.data);
                }
                else if (msg.channel === "addChannel") {
                }
                else {
                    Print("message from unhandled channel:")
                    Print(msg);
                }
            }
            else {
                Print("unhandled array message:");
                Print(msg);
            }
        }
        else {
            if (msg.hasOwnProperty("event")) {
                if (msg.event === "pong") {
                    //Print("pong!");
                }
            }
            else {
                Print("unhandled message:");
                Print(msg);
            }
        }
    }

    ws = new WebSocket(host);
    ws.on("message", OnIncoming);
    ws.on("open", function() {
        Print("connection opened");
        var req = {
            event: "addChannel",
            channel: "ok_sub_spot_btc_usd_depth"
        };
        WebSocketSend(req);

        // Send heartbeats
        setInterval(function() {
            WebSocketSend({ event: "ping" });
        }, 10 * 1000)
    });
    ws.on("close", function(code, reason) {
        Print("connection closed, code " + code);
        Print(reason);

        // Restart connection globally here.
        Print("restarting conection");
        connection = CreateConnection();
    });
}

connection = CreateConnection();

exports.asks = asks;
exports.bids = bids;