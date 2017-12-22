const fs = require("fs");
const crypto = require("crypto");
const WebSocket = require("ws");

const ordHash = require("./ordered-hash");

const key = "cHZ8E9ieHTwLcdCeXjMy7JZ20wo";
const secret = fs.readFileSync("keys/cex", "utf8").trim();

const host = "wss://ws.cex.io/ws";

var ws = null;
var lastTickerOID = null;
var checkConnInterval = null;
var REBUILD_ORDER_BOOK_TIME = 15; // seconds
var rebuildOrderBookInterval = null;

function WebSocketSend(data)
{
    if (ws !== null && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

function CreateConnection()
{
    if (ws !== null || checkConnInterval !== null) {
        console.assert(false, "CreateConection without close");
    }

    ws = new WebSocket(host);
    ws.on("message", OnIncoming);
    ws.on("open", function() {
        //console.log("Client: connected");
    });
    ws.on("close", function(code, reason) {
        console.log("Client: connection closed, code " + code);
        console.log(reason);
        ws = null;
        CloseConnection();
        CreateConnection();
    });

    checkConnInterval = setInterval(function() {
        if (lastTickerOID !== null) {
            console.log("Client: server didn't respond ticker, restarting");
            CloseConnection();
            CreateConnection();
            return;
        }

        lastTickerOID = "check_conn_" + Date.now().toString();
        var ticker = {
            e: "ticker",
            data: [ "BTC", "USD" ],
            oid: lastTickerOID
        }
        WebSocketSend(ticker);
    }, 5000);
}
CreateConnection();

function CloseConnection()
{
    if (ws !== null) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.close();
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
    asks.clear();
    bids.clear();
    receivedIDs = [];
}

function CreateSignature(timestamp, apiKey, apiSecret)
{
    var hash = crypto.createHmac("sha256", apiSecret)
    hash.update(timestamp + apiKey)
    return hash.digest("hex")
}

function CreateAuthRequest(apiKey, apiSecret)
{
    // Convert timestamp from milliseconds to integer seconds
    var timestamp = Math.floor(Date.now() / 1000);
    var args = {
        e: "auth",
        auth: {
            key: apiKey,
            signature: CreateSignature(timestamp, apiKey, apiSecret),
            timestamp: timestamp
        }
    };

    return args;
}

function CompareFloats(f1, f2)
{
    if (f1 < f2)        return -1;
    else if (f1 > f2)   return 1;
    else                return 0;
}
function CompareFloatStrings(s1, s2)
{
    var f1 = parseFloat(s1);
    var f2 = parseFloat(s2);
    if (f1 < f2)    return -1;
    if (f1 > f2)    return 1;
    else            return 0;
}

//const DECIMALS = 10;
//var asks = ordHash.Create(CompareFloatStrings);
//var bids = ordHash.Create(CompareFloatStrings);
var asks = ordHash.Create(CompareFloats);
var bids = ordHash.Create(CompareFloats);
var RECEIVED_IDS_MAX = 4;
var receivedIDs = [];

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
            console.log("Missed market data frame, restarting");
            CloseConnection();
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
            console.log("Order book subscription not OK");
            return;
        }
    }

    // NOTE: for some reason, this sends time in seconds
    msg.data.time = msg.data.timestamp * 1000;
    AddMarketData(msg.data);
}

function HandleOrderBookUnsubscribe(msg)
{
    if (msg.hasOwnProperty("ok")) {
        if (msg.ok !== "ok") {
            console.log("Order book unsubscribe not OK");
            return;
        }
    }

    asks.clear();
    bids.clear();
    receivedIDs = [];

    console.log((new Date(Date.now())).toTimeString() + ": Rebuilding order book");
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
        "oid": "1435927928274_3_order-book-subscribe"
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
            console.log("Server: ticker not OK, restarting")
            CloseConnection();
            CreateConnection();
        }
    }
    else {
        console.log("Server: mismatched ticker message, restarting");
        CloseConnection();
        CreateConnection();
    }
}

function OnAuthenticated()
{
    /*var ticker = {
        e: "ticker",
        data: [
            "BTC", "USD"
        ],
        oid: "0"
    };
    ws.send(JSON.stringify(ticker));*/
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
        "oid": "1435927928274_3_order-book-subscribe"
    };
    WebSocketSend(orderBookSub);

    rebuildOrderBookInterval = setInterval(function() {
        console.log((new Date(Date.now())).toTimeString() + ": Requesting to rebuild order book");
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
        // Connection has been closed, don't handle this.
        return;
    }

    try {
        msg = JSON.parse(msg);
    }
    catch (err) {
        console.log("Unparsable msg:");
        console.log(msg);
        return;
    }
    if (!msg.hasOwnProperty("e")) {
        console.log("Malformed msg:");
        console.log(msg);
        return;
    }
    
    if (msg.e === "connected") {
        //console.log("Server: connected");
        WebSocketSend(CreateAuthRequest(key, secret));
    }
    else if (msg.e === "auth") {
        if (msg.ok === "ok") {
            console.log("Server: authenticated");
            OnAuthenticated();
        }
        else {
            console.log("Server: authentication failed");
            if (msg.hasOwnProperty("data") && msg.data.hasOwnProperty("error")) {
                console.log("(" + msg.data.error + ")");
            }
            CloseConnection();
        }
    }
    else if (msg.e === "ping") {
        //console.log("Server: ping");
        WebSocketSend({ e: "pong" });
    }
    else if (msg.e === "disconnecting") {
        console.log("Server: disconnect (" + msg.reason + ")");
        CloseConnection();
        CreateConnection();
    }
    else if (MsgIsRateLimit(msg)) {
        console.log("Server: rate limit exceeded");
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
        console.log("Unhandled message:");
        console.log(msg);
    }
}

exports.asks = asks;
exports.bids = bids;