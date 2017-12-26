const WebSocket = require("ws");

const ordHash = require("./ordered-hash");

const key = "17de37be-57ff-4575-b12d-d4e1428dbf5a";
const host = "wss://real.okcoin.com:10440/websocket/okcoinapi";

// TODO this connection isn't being checked for and restarted.

function Print(msg)
{
    console.log("(OKCoin) " + msg);
}

function StdPairToOKC(pair)
{
    return pair.toLowerCase().split("-").join("_");
}

function OKCPairToStd(pair)
{
    return pair.toUpperCase().split("_").join("-");
}

var mktData = {};

var connection = null;

function CreateConnection()
{
    var ws = null;

    // OKCoin expects heartbeat pings every ~30secs (see API)
    var heartbeatInterval = null;
    var HEARTBEAT_TIME = 10; // secs

    // Reset connection and reload data every so often.
    var RESET_CONN_TIME = 40; // secs

    function ClearData(pair)
    {
        if (pair === undefined || pair === null) {
            for (var p in mktData) {
                mktData[p].asks.clear();
                mktData[p].bids.clear();
            }
        }
        else {
            mktData[pair].asks.clear();
            mktData[pair].bids.clear();
        }
    }

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
        if (heartbeatInterval !== null) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
        }

        ClearData();
    }

    function ProcessIncDepthMessage(data, pair)
    {
        var timestamp = data.timestamp;
        if (data.asks !== undefined) {
            for (var i = 0; i < data.asks.length; i++) {
                var price = data.asks[i][0];
                var volume = data.asks[i][1];

                if (mktData[pair].asks.exists(price)) {
                    if (parseFloat(volume) === 0.0) {
                        mktData[pair].asks.delete(price);
                    }
                    else {
                        mktData[pair].asks.set(price, [volume, timestamp]);
                    }
                }
                else {
                    mktData[pair].asks.insert(price, [volume, timestamp]);
                }
            }
        }
        if (data.bids !== undefined) {
            for (var i = 0; i < data.bids.length; i++) {
                var price = data.bids[i][0];
                var volume = data.bids[i][1];
                
                if (mktData[pair].bids.exists(price)) {
                    if (parseFloat(volume) === 0.0) {
                        mktData[pair].bids.delete(price);
                    }
                    else {
                        mktData[pair].bids.set(price, [volume, timestamp]);
                    }
                }
                else {
                    mktData[pair].bids.insert(price, [volume, timestamp]);
                }
            }
        }
    }

    function MsgChannelIsDepth(msg)
    {
        if (msg.channel.length === 25) {
            return (msg.channel.substring(0, 12) === "ok_sub_spot_")
                && (msg.channel.substring(19, 25) === "_depth");
        }

        return false;
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
                if (MsgChannelIsDepth(msg)) {
                    var pairOKC = msg.channel.substring(12, 19);
                    ProcessIncDepthMessage(msg.data, OKCPairToStd(pairOKC));
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
        for (var pair in mktData) {
            var req = {
                event: "addChannel",
                channel: "ok_sub_spot_" + StdPairToOKC(pair) + "_depth"
            };
            WebSocketSend(req);
        }

        // Send heartbeats
        heartbeatInterval = setInterval(function() {
            WebSocketSend({ event: "ping" });
        }, HEARTBEAT_TIME * 1000)

        setTimeout(function() {
            Close();
        }, RESET_CONN_TIME * 1000);
    });
    ws.on("close", function(code, reason) {
        Print("connection closed, code " + code);
        Print(reason);

        // Restart connection globally here.
        Print("restarting conection");
        connection = CreateConnection();
    });
}

function CompareFloatStrings(s1, s2)
{
    var f1 = parseFloat(s1);
    var f2 = parseFloat(s2);
    if (f1 < f2)    return -1;
    if (f1 > f2)    return 1;
    else            return 0;
}

function Start(pairs)
{
    var supportedCryptos = [
        "BTC",
        "LTC",
        "ETH",
        "ETC",
        "BCH"
    ];
    var supportedFiats = [
        "USD"
    ];

    var supportedPairs = [];
    for (var i = 0; i < supportedFiats.length; i++) {
        for (var j = 0; j < supportedCryptos.length; j++) {
            supportedPairs.push(supportedCryptos[j] + "-" + supportedFiats[i]);
        }
    }

    for (var i = 0; i < pairs.length; i++) {
        if (supportedPairs.indexOf(pairs[i]) >= 0) {
            mktData[pairs[i]] = {
                asks: ordHash.Create(CompareFloatStrings),
                bids: ordHash.Create(CompareFloatStrings)
            };
        }
    }

    connection = CreateConnection();
}

exports.data = mktData;
//exports.asks = asks;
//exports.bids = bids;
exports.Start = Start;