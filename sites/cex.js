const fs = require("fs");
const crypto = require("crypto");
const WebSocket = require("ws");

const ordHash = require("./ordered-hash");

const key = "cHZ8E9ieHTwLcdCeXjMy7JZ20wo";
const secret = fs.readFileSync("keys/cex", "utf8").trim();

const host = "wss://ws.cex.io/ws";

var sendCount = 0;
var startTime = Date.now() * 1000.0;

function Print(msg)
{
    console.log("(CEX) " + msg);
}

var mktData = {
    // Example entry
    // 
    // "BTC-USD": {
    //     asks: ordHash.Create(...),
    //     bids: ordHash.Create(...)
    // }
};

var connection = null;

function CreateAuthRequest(apiKey, apiSecret)
{
    // Convert timestamp from milliseconds to integer seconds
    var timestamp = Math.floor(Date.now() / 1000);
    var signatureHash = crypto.createHmac("sha256", apiSecret);
    signatureHash.update(timestamp + apiKey);
    var args = {
        e: "auth",
        auth: {
            key: apiKey,
            signature: signatureHash.digest("hex"),
            timestamp: timestamp
        }
    };

    return args;
}

function CreateConnection()
{
    var ws = null;

    var checkConnInterval = null;
    var CHECK_CONN_TIME = 5; // secs
    var lastTickerOID = null;

    var REBUILD_ORDER_BOOK_TIME = 20; // secs
    var rebuildOrderBookInterval = null;

    var RECEIVED_IDS_MAX = 4;
    var receivedIDs = {};
    for (var pair in mktData) {
        receivedIDs[pair] = [];
    }

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
            sendCount = sendCount + 1;
            var sendRate = sendCount / (Date.now() * 1000.0 - startTime);
            if (sendRate > 1.0) {
                Print("WARNING: rate limit above 1 per sec");
            }
            ws.send(JSON.stringify(data));
        } 
    }

    function CheckConnection()
    {
        if (lastTickerOID !== null) {
            Print("server didn't respond ticker, closing");
            Close();
            return;
        }

        lastTickerOID = "check_conn_" + Date.now().toString();
        var ticker = {
            e: "ticker",
            data: [ "BTC", "USD" ],
            oid: lastTickerOID
        }
        WebSocketSend(ticker);
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
        if (checkConnInterval !== null) {
            clearInterval(checkConnInterval);
            checkConnInterval = null;
        }
        if (rebuildOrderBookInterval !== null) {
            clearInterval(rebuildOrderBookInterval);
            rebuildOrderBookInterval = null;
        }
        lastTickerOID = null;

        ClearData();
    }
    
    function RequestRebuild(pair)
    {
        //Print((new Date(Date.now())).toTimeString() + ": Request rebuild for " + pair);
        if (pair === undefined || pair === null) {
            for (var p in mktData) {
                var unsub = {
                    e: "order-book-unsubscribe",
                    data: {
                        pair: p.split("-")
                    },
                    oid: "0"
                };
                WebSocketSend(unsub);
            }
        }
        else {
            var unsub = {
                e: "order-book-unsubscribe",
                data: {
                    pair: pair.split("-")
                },
                oid: "0"
            };
            WebSocketSend(unsub);
        }
    }

    function AddMarketData(data)
    {
        var pair = data.pair.replace(":", "-");

        // Check received IDs for missing data
        receivedIDs[pair].push(data.id);
        receivedIDs[pair].sort();
        if (receivedIDs[pair].length > RECEIVED_IDS_MAX) {
            receivedIDs[pair] = receivedIDs[pair].slice(1, RECEIVED_IDS_MAX + 1);
        }
        if (receivedIDs[pair].length === RECEIVED_IDS_MAX) {
            if (receivedIDs[pair][1] - receivedIDs[pair][0] !== 1) {
                // TODO untested
                Print("missed market data frame for " + pair + ", rebuilding");
                RequestRebuild(pair);
                //Close();
            }
        }
    
        var time = data.time;
        for (var i = 0; i < data.asks.length; i++) {
            var price = data.asks[i][0];
            var volume = data.asks[i][1];
    
            if (mktData[pair].asks.exists(price)) {
                if (volume === 0) {
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
        for (var i = 0; i < data.bids.length; i++) {
            var price = data.bids[i][0];
            var volume = data.bids[i][1];
    
            if (mktData[pair].bids.exists(price)) {
                if (volume === 0) {
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
    
    function HandleOrderBookSubscribe(msg)
    {
        if (msg.hasOwnProperty("ok")) {
            if (msg.ok !== "ok") {
                Print("order book subscribe not OK");
                if (msg.hasOwnProperty("data")) {
                    if (msg.data.hasOwnProperty("error")) {
                        Print("(" + msg.data.error + ")");
                    }
                }
                return;
            }
        }
    
        // NOTE: for some reason, this first msg sends time in seconds
        msg.data.time = msg.data.timestamp * 1000;
        AddMarketData(msg.data);
    }
    
    function HandleOrderBookUnsubscribe(msg)
    {
        // TODO handle this reset more gracefully.
        // Don't clear the data out & rewrite, but instead
        // wait to receive it and then edit our version to match
        // the server's.
        if (msg.hasOwnProperty("ok")) {
            if (msg.ok !== "ok") {
                Print("order book unsubscribe not OK");
                return;
            }
        }
        
        //Print((new Date(Date.now())).toTimeString() + ": Cleared order book for " + msg.data.pair);
        ClearData(msg.data.pair.replace(":", "-"));
    
        //Print((new Date(Date.now())).toTimeString() + ": Resubscribing for " + msg.data.pair);
        var orderBookSub = {
            "e": "order-book-subscribe",
            "data": {
                "pair": msg.data.pair.split(":"),
                "subscribe": true,
                "depth": 0
            },
            "oid": "0"
        };
        WebSocketSend(orderBookSub);
    }
    
    function MsgIsRateLimit(msg)
    {
        if (msg.hasOwnProperty("data")) {
            if (msg.data.hasOwnProperty("error")) {
                if (msg.data.error === "Rate limit exceeded") {
                    return true;
                }
            }
        }
    
        return false;
    }
    
    function HandleTicker(msg)
    {
        if (msg.oid === lastTickerOID) {
            if (msg.ok === "ok") {
                lastTickerOID = null;
            }
            else {
                Print("ticker not OK, closing");
                Close();
            }
        }
        else {
            Print("mismatched ticker message, closing");
            Close();
        }
    }
    
    function OnAuthenticated()
    {
        for (var pair in mktData) {
            var orderBookSub = {
                "e": "order-book-subscribe",
                "data": {
                    "pair": pair.split("-"),
                    "subscribe": true,
                    "depth": 0
                },
                "oid": "0"
            };
            WebSocketSend(orderBookSub);
        }
    
        checkConnInterval = setInterval(CheckConnection, CHECK_CONN_TIME * 1000);

        rebuildOrderBookInterval = setInterval(function() {
            RequestRebuild(null);
        }, REBUILD_ORDER_BOOK_TIME * 1000);
    }
    
    function OnIncoming(msg)
    {
        if (ws === null) {
            // Connection has been closed, drop messages.
            return;
        }
    
        try {
            msg = JSON.parse(msg);
        }
        catch (err) {
            Print("unparsable msg:");
            Print(msg);
            return;
        }
        if (!msg.hasOwnProperty("e")) {
            Print("malformed msg:");
            Print(msg);
            return;
        }
        
        if (msg.e === "connected") {
            //Print("Server: connected");
            WebSocketSend(CreateAuthRequest(key, secret));
        }
        else if (msg.e === "auth") {
            if (msg.ok === "ok") {
                Print("authenticated");
                OnAuthenticated();
            }
            else {
                Print("authentication failed");
                if (msg.hasOwnProperty("data") && msg.data.hasOwnProperty("error")) {
                    Print("(" + msg.data.error + ")");
                }
                Close();
            }
        }
        else if (msg.e === "ping") {
            //Print("Server: ping");
            WebSocketSend({ e: "pong" });
        }
        else if (msg.e === "disconnecting") {
            Print("served disconnected (" + msg.reason + ")");
            Close();
            //CloseConnection();
            //CreateConnection();
        }
        else if (MsgIsRateLimit(msg)) {
            Print("rate limit exceeded");
        }
        else if (msg.e === "ticker") {
            HandleTicker(msg);
        }
        else if (msg.e === "order-book-subscribe") {
            HandleOrderBookSubscribe(msg);
        }
        else if (msg.e === "order-book-unsubscribe") {
            HandleOrderBookUnsubscribe(msg);
        }
        else if (msg.e === "md_update") {
            AddMarketData(msg.data);
        }
        else {
            Print("unhandled message:");
            Print(msg);
        }
    }

    var serverDown = false;
    ws = new WebSocket(host);
    ws.on("message", OnIncoming);
    ws.on("open", function() {
        //Print("Client: connected");
    });
    ws.on("error", function(err) {
        Print(err);
        if (err.toString().indexOf("521") !== -1) {
            serverDown = true;
        }
    });
    ws.on("close", function(code, reason) {
        Print("connection closed, code " + code);
        Print(reason);
        if (serverDown) {
            Print("server is down, restart crypto-arb app")
            return;
        }

        // Restart connection globally here.
        Print("restarting conection");
        connection = CreateConnection();
    });
}

function CompareFloats(f1, f2)
{
    if (f1 < f2)        return -1;
    else if (f1 > f2)   return 1;
    else                return 0;
}

function Start(pairs, callback)
{
    var supportedCryptos = [
        "BTC",
        "ETH",
        "BCH",
        "BTG",
        "DASH",
        "XRP",
        "ZEC",
        "GHS"
    ];
    var supportedFiats = [
        "USD",
        "EUR",
        "GBP"
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
                asks: ordHash.Create(CompareFloats),
                bids: ordHash.Create(CompareFloats)
            };
        }
    }

    connection = CreateConnection();
    callback();
}

exports.Start = Start;
exports.data = mktData;