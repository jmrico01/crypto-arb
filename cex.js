const fs = require("fs");
const crypto = require("crypto");
const ordHash = require("./ordered-hash");
const WebSocket = require("ws");

const key = "cHZ8E9ieHTwLcdCeXjMy7JZ20wo";
const secret = fs.readFileSync("keys/cex", "utf8").trim();

const host = "wss://ws.cex.io/ws";

const ws = new WebSocket(host);
ws.on("message", OnIncoming);
ws.on("open", function() {
    console.log("Client: connected");
});
ws.on("close", function(code, reason) {
    console.log("Client: connection closed, code " + code);
    console.log(reason);
});
  

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

    return JSON.stringify(args)
}

function CompareFloatStrings(s1, s2)
{
    var f1 = parseFloat(s1);
    var f2 = parseFloat(s2);
    if (f1 < f2)    return -1;
    if (f1 > f2)    return 1;
    else            return 0;
}

const DECIMALS = 10;
var asks = ordHash.Create(CompareFloatStrings);
var bids = ordHash.Create(CompareFloatStrings);

function AddMarketData(data)
{
    //console.log(data);
    // TODO check id field for missed messages, re-build if missed.
    var time = data.time;
    for (var i = 0; i < data.asks.length; i++) {
        var price = data.asks[i][0].toFixed(DECIMALS);
        var volume = data.asks[i][1].toFixed(DECIMALS);

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
        var price = data.bids[i][0].toFixed(DECIMALS);
        var volume = data.bids[i][1].toFixed(DECIMALS);

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

    msg.data.time = msg.data.timestamp;
    AddMarketData(msg.data);
}

function MsgIsMarketUpdate(msg)
{
    return msg.e === "md_update";
}

function MsgIsOrderBookSubscribe(msg)
{
    return msg.e === "order-book-subscribe";
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

function MsgIsDisconnect(msg)
{
    return msg.e === "disconnecting";
}

function MsgIsPing(msg)
{
    return msg.e === "ping";
}

function MsgIsAuthError(msg)
{
    if (msg.e === "auth") {
        if (msg.hasOwnProperty("ok")) {
            if (msg.ok === "error") {
                return true;
            }
        }
    }

    return false;
}

function MsgIsAuthOK(msg)
{
    if (msg.e === "auth") {
        if (msg.hasOwnProperty("ok")) {
            if (msg.ok === "ok") {
                return true;
            }
        }
    }

    return false;
}

function MsgIsConnected(msg)
{
    return msg.e === "connected";
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
    ws.send(JSON.stringify(orderBookSub));
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
    if (!msg.hasOwnProperty("e")) {
        console.log("Malformed msg:");
        console.log(msg);
        return;
    }
    
    if (MsgIsConnected(msg)) {
        console.log("Server: connected");
        ws.send(CreateAuthRequest(key, secret));
    }
    else if (MsgIsAuthOK(msg)) {
        console.log("Server: authenticated");
        OnAuthenticated();
    }
    else if (MsgIsAuthError(msg)) {
        console.log("Server: authentication failed");
        console.log("(" + msg.data.error + ")");
    }
    else if (MsgIsPing(msg)) {
        console.log("Server: ping");
        ws.send(JSON.stringify({ e: "pong" }));
    }
    else if (MsgIsDisconnect(msg)) {
        console.log("Server: disconnect (" + msg.reason + ")");
    }
    else if (MsgIsRateLimit(msg)) {
        console.log("Server: rate limit exceeded");
    }
    else if (MsgIsOrderBookSubscribe(msg)) {
        HandleOrderBookSubscribe(msg);
    }
    else if (MsgIsMarketUpdate(msg)) {
        AddMarketData(msg.data);
    }
    else {
        console.log("Unhandled message:");
        console.log(msg);
    }
}

exports.asks = asks;
exports.bids = bids;