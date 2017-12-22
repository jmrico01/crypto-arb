const fs = require("fs");
const crypto = require("crypto");
const WebSocket = require("ws");

const ordHash = require("./ordered-hash");

const key = "cHZ8E9ieHTwLcdCeXjMy7JZ20wo";
const secret = fs.readFileSync("keys/cex", "utf8").trim();

const host = "wss://ws.cex.io/ws";

function Print(msg)
{
    console.log("(CEX) " + msg);
}

function CompareFloats(f1, f2)
{
    if (f1 < f2)        return -1;
    else if (f1 > f2)   return 1;
    else                return 0;
}

var asks = ordHash.Create(CompareFloats);
var bids = ordHash.Create(CompareFloats);

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

    var REBUILD_ORDER_BOOK_TIME = 15; // secs
    var rebuildOrderBookInterval = null;

    var RECEIVED_IDS_MAX = 4;
    var receivedIDs = [];

    function WebSocketSend(data)
    {
        if (ws !== null && ws.readyState === WebSocket.OPEN) {
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

        receivedIDs = [];
        asks.clear();
        bids.clear();
    }

    function AddMarketData(data)
    {
        // Check received IDs for missing data
        receivedIDs.push(data.id);
        receivedIDs.sort();
        if (receivedIDs.length > RECEIVED_IDS_MAX) {
            receivedIDs = receivedIDs.slice(1, RECEIVED_IDS_MAX + 1);
        }
        if (receivedIDs.length == RECEIVED_IDS_MAX) {
            if (receivedIDs[1] - receivedIDs[0] !== 1) {
                Print("missed market data frame, closing");
                Close();
            }
        }
    
        var time = data.time;
        for (var i = 0; i < data.asks.length; i++) {
            //var price = data.asks[i][0].toFixed(DECIMALS);
            //var volume = data.asks[i][1].toFixed(DECIMALS);
            var price = data.asks[i][0];
            var volume = data.asks[i][1];
    
            if (asks.exists(price)) {
                if (volume === 0) {
                    asks.delete(price);
                }
                else {
                    asks.set(price, [volume, time]);
                }
            }
            else {
                asks.insert(price, [volume, time]);
            }
            break;
        }
        for (var i = 0; i < data.bids.length; i++) {
            //var price = data.bids[i][0].toFixed(DECIMALS);
            //var volume = data.bids[i][1].toFixed(DECIMALS);
            var price = data.bids[i][0];
            var volume = data.bids[i][1];
    
            if (bids.exists(price)) {
                if (volume === 0) {
                    bids.delete(price);
                }
                else {
                    bids.set(price, [volume, time]);
                }
            }
            else {
                bids.insert(price, [volume, time]);
            }
            break;
        }
    }
    
    function HandleOrderBookSubscribe(msg)
    {
        if (msg.hasOwnProperty("ok")) {
            if (msg.ok !== "ok") {
                Print("order book subscribe not OK");
                return;
            }
        }
    
        // NOTE: for some reason, this first msg sends time in seconds
        msg.data.time = msg.data.timestamp * 1000;
        AddMarketData(msg.data);
    }
    
    function HandleOrderBookUnsubscribe(msg)
    {
        if (msg.hasOwnProperty("ok")) {
            if (msg.ok !== "ok") {
                Print("order book unsubscribe not OK");
                return;
            }
        }

        asks.clear();
        bids.clear();
        receivedIDs = [];
    
        //Print((new Date(Date.now())).toTimeString() + ": Rebuilding order book");
        var orderBookSub = {
            "e": "order-book-subscribe",
            "data": {
                "pair": [
                    "BTC",
                    "USD"
                ],
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
        /*var getBalance = {
            e: "get-balance",
            data: {},
            oid: "0"
        };
        ws.send(JSON.stringify(getBalance));*/
        var orderBookSub = {
            "e": "order-book-subscribe",
            "data": {
                "pair": [
                    "BTC",
                    "USD"
                ],
                "subscribe": true,
                "depth": 0
            },
            "oid": "0"
        };
        WebSocketSend(orderBookSub);
    
        rebuildOrderBookInterval = setInterval(function() {
            //Print((new Date(Date.now())).toTimeString() + ": Requesting to rebuild order book");
            var unsub = {
                e: "order-book-unsubscribe",
                data: {
                    pair: [ "BTC", "USD" ]
                },
                oid: "0"
            };
            WebSocketSend(unsub);
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

    ws = new WebSocket(host);
    ws.on("message", OnIncoming);
    ws.on("open", function() {
        //Print("Client: connected");
    });
    ws.on("close", function(code, reason) {
        Print("connection closed, code " + code);
        Print(reason);

        // Restart connection globally here.
        Print("restarting conection");
        connection = CreateConnection();
    });

    checkConnInterval = setInterval(CheckConnection, CHECK_CONN_TIME * 1000);
}

connection = CreateConnection();

exports.asks = asks;
exports.bids = bids;