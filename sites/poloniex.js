const WebSocket = require("ws");
const https = require("https");

const ordHash = require("./../ordered-hash");

const host = "wss://api2.poloniex.com";

function Print(msg)
{
    console.log("(Poloniex) " + msg.toString());
}

var mktData = {};
var connection = null;

function StdPairToPoloniex(pair)
{
    var pairSplit = pair.split("-");
    for (var i = 0; i < 2; i++) {
        if (pairSplit[i] === "XLM") {
            pairSplit[i] = "STR";
        }
    }

    return pairSplit[0] + "_" + pairSplit[1];
}
function PoloniexPairToStd(pPair)
{
    var pairSplit = pPair.split("_");
    for (var i = 0; i < 2; i++) {
        if (pairSplit[i] === "STR") {
            pairSplit[i] = "XLM";
        }
    }

    return pairSplit[0] + "-" + pairSplit[1];
}

var stdToID = {};
var idToStd = {};
function RegisterPairID(stdPair, id)
{
    stdToID[stdPair] = id;
    idToStd[id] = stdPair;
}
function IDToStdPair(id)
{
    if (!idToStd.hasOwnProperty(id)) {
        Print("ERROR: looked up unregistered pair ID");
        Print("       ( " + id + " )")
        return null;
    }
    return idToStd[id];
}
function StdPairToID(pair)
{
    if (!stdToID.hasOwnProperty(pair)) {
        Print("ERROR: looked up unregistered std pair");
        return null;
    }
    return stdToID[pair];
}

function CreateConnection()
{
    var ws = null;

    var SUBSCRIBE_TIME = 0.5; // secs

    var CHANNEL_HEARTBEAT = 1010;
    var checkConnInterval = null;
    var CHECK_CONN_TIME = 20; // secs
    // If we don't get a heartbeat response back in this time,
    // reset the entire connection.
    var receivedHeartbeat = true;
    var HEARTBEAT_WAIT_TIME = 5; // secs

    // How often an order book is rebuilt
    // It takes (REBUILD_ORDER_BOOK_TIME * numPairs)
    // for one order book to be rebuilt
    var REBUILD_ORDER_BOOK_TIME = 5; // secs
    var rebuildOrderBookInterval = null;
    var nextPair = 0;

    var RECEIVED_IDS_MAX = 5;
    var receivedIDs = {};
    for (var pair in mktData) {
        receivedIDs[pair] = [];
    }

    // General list of timeouts to clear on close
    var timeouts = [];

    function ClearData(pair)
    {
        if (pair === undefined || pair === null) {
            for (var p in mktData) {
                mktData[p].asks.clear();
                mktData[p].bids.clear();
                receivedIDs[p] = [];
            }
        }
        else {
            mktData[pair].asks.clear();
            mktData[pair].bids.clear();
            receivedIDs[pair] = [];
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

        for (var i = 0; i < timeouts.length; i++) {
            clearTimeout(timeouts[i]);
        }
        timeouts = [];

        if (ws !== null) {
            ws.on("message", function() {});
            if (ws.readyState === WebSocket.OPEN) {
                //ws.close();
                ws.terminate();
            }
            ws = null;
        }
        if (keepAliveInterval !== null) {
            clearInterval(keepAliveInterval);
            keepAliveInterval = null;
        }
        if (rebuildOrderBookInterval !== null) {
            clearInterval(rebuildOrderBookInterval);
            rebuildOrderBookInterval = null;
        }

        ClearData();
    }

    function Rebuild(pair)
    {
        var unsubscribe = {
            command: "unsubscribe",
            channel: StdPairToID(pair)
        };
        WebSocketSend(unsubscribe);
    }

    function AddMarketData(pair, counter, data)
    {
        // Check received IDs for missing data
        receivedIDs[pair].push(counter);
        receivedIDs[pair].sort();
        if (receivedIDs[pair].length > RECEIVED_IDS_MAX) {
            receivedIDs[pair] =
                receivedIDs[pair].slice(1, RECEIVED_IDS_MAX + 1);
        }
        if (receivedIDs[pair].length === RECEIVED_IDS_MAX) {
            if (receivedIDs[pair][1] - receivedIDs[pair][0] !== 1) {
                Print("missed market data frame for " + pair + ", rebuilding");
                Rebuild(pair);
            }
        }
    
        var time = Date.now();
        for (var price in data[0]) {
        //for (var i = 0; i < data.asks.length; i++) {
            //var price = data.asks[i][0];
            var volume = data[0][price];
    
            if (mktData[pair].asks.exists(price)) {
                if (parseFloat(volume) === 0.0) {
                    mktData[pair].asks.delete(price);
                }
                else {
                    mktData[pair].asks.set(price, [volume, time]);
                }
            }
            else {
                mktData[pair].asks.insert(price, [volume, time]);
            }
        }
        for (var price in data[1]) {
        //for (var i = 0; i < data.bids.length; i++) {
            //var price = data.bids[i][0];
            var volume = data[1][price];
    
            if (mktData[pair].bids.exists(price)) {
                if (parseFloat(volume) === 0.0) {
                    mktData[pair].bids.delete(price);
                }
                else {
                    mktData[pair].bids.set(price, [volume, time]);
                }
            }
            else {
                mktData[pair].bids.insert(price, [volume, time]);
            }
        }
    }

    function OnIncoming(msg)
    {
        if (!msg.hasOwnProperty("length")) {
            Print("error: empty message");
            return;
        }
        if (msg.length === 0) {
            Print("error: empty message");
            return;
        }

        try {
            msg = JSON.parse(msg);
        }
        catch (err) {
            Print("error: couldn't parse message as JSON");
            console.log(msg);
        }

        var channel = parseInt(msg[0]);
        if (channel === CHANNEL_HEARTBEAT) {
            if (!receivedHeartbeat) {
                receivedHeartbeat = true;
            }
            return;
        }

        var pair = IDToStdPair(channel);
        if (pair === null) {
            // Unrecognized channel
            return;
        }
        if (msg[1] === 0) {
            // Unsubscribe message (rebuild)
            var subscribe = {
                command: "subscribe",
                channel: channel
            };
            WebSocketSend(subscribe);
            return;
        }
        var counter = msg[1];
        var data = msg[2];
        var marketData = null;
        for (var i = 0; i < data.length; i++) {
            if (data[i][0] === "i") {
                ClearData(pair);
                AddMarketData(pair, counter, data[i][1].orderBook);
            }
            else if (data[i][0] === "o") {
                if (marketData === null) {
                    marketData = [ {}, {} ];
                }
                marketData[data[i][1]][data[i][2]] = data[i][3];
            }
        }
        if (marketData !== null) {
            AddMarketData(pair, counter, marketData);
        }
    }
    
    function SchedulePairSubscription(pairs, i)
    {
        timeouts.push(setTimeout(function() {
            var subscribe = {
                command: "subscribe",
                channel: StdPairToID(pairs[i])
            };
            WebSocketSend(subscribe);
        }, i * SUBSCRIBE_TIME * 1000));
    }
    
    ws = new WebSocket(host);
    ws.on("message", OnIncoming);
    ws.on("open", function() {
        Print("connection opened");

        var pairs = Object.keys(mktData);
        for (var i = 0; i < pairs.length; i++) {
            SchedulePairSubscription(pairs, i);
        }

        keepAliveInterval = setInterval(function() {
            WebSocketSend({
                command: "subscribe",
                channel: CHANNEL_HEARTBEAT
            });

            receivedHeartbeat = false;
            timeouts.push(setTimeout(function() {
                if (!receivedHeartbeat) {
                    // Restart connection
                    Print("no heartbeat response. restarting")
                    Close();
                }
            }, HEARTBEAT_WAIT_TIME * 1000));
        }, CHECK_CONN_TIME * 1000);

        timeouts.push(setTimeout(function() {
            //Print("scheduling rebuilds");
            rebuildOrderBookInterval = setInterval(function() {
                var pair = pairs[nextPair];
                //Print("rebuilding " + pair);
                nextPair = (nextPair + 1) % pairs.length;
                Rebuild(pair);
            }, REBUILD_ORDER_BOOK_TIME * 1000);
        }, pairs.length * SUBSCRIBE_TIME * 1000));
    });
    ws.on("error", function(err) {
        Print(err);
    });
    ws.on("close", function(code, reason) {
        Close();
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

function Start(callback)
{
    const url = "https://poloniex.com/public?command=returnTicker";
    https.get(url, function(res) {
        if (res.statusCode !== 200) {
            Print("ticker request returned " + res.statusCode);
            return;
        }
    
        res.setEncoding("utf8");
        var data = "";
        res.on("data", function(chunk) {
            data += chunk;
        });
        res.on("end", function() {
            try {
                data = JSON.parse(data);
            }
            catch (err) {
                Print("ticker JSON parse error " + err);
                return;
            }

            for (var pPair in data) {
                var pair = PoloniexPairToStd(pPair);
                RegisterPairID(pair, data[pPair].id);

                mktData[pair] = {
                    asks: ordHash.Create(CompareFloatStrings),
                    bids: ordHash.Create(CompareFloatStrings)
                };
            }

            connection = CreateConnection();
            callback();
        });
    });
}

exports.data = mktData;
exports.Start = Start;