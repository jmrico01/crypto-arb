const fs = require("fs");
const crypto = require("crypto");
const https = require("https");
const WebSocket = require("ws");

const ordHash = require("./../ordered-hash");

const user = "up114824136";
const key = "cHZ8E9ieHTwLcdCeXjMy7JZ20wo";
const secret = fs.readFileSync("keys/cex", "utf8").trim();

const host = "wss://ws.cex.io/ws";

function Print(msg)
{
    console.log("(CEX) " + msg);
}

var mktData = {};

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

    // TODO I changed this!
    var RATE_LIMIT_MIN_TIME = 0.05; // secs

    var checkConnInterval = null;
    var CHECK_CONN_TIME = 10; // secs
    var lastTickerOID = null;
    var lastMarketUpdate = {};
    var MARKET_UPDATE_ELAPSED_WARN = 30; // secs

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
        timeouts.clear();

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
                Print("missed market data frame for " + pair + ", rebuilding");
                Rebuild(pair);
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

        lastMarketUpdate[pair] = Date.now();
    }

    function Rebuild(pair)
    {
        var orderBookUnsub = {
            "e": "order-book-unsubscribe",
            "data": {
                "pair": pair.split("-")
            },
            "oid": "0"
        };
        WebSocketSend(orderBookUnsub);
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
    
        var pair = msg.data.pair.replace(":", "-");
        ClearData(pair);
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

        var now = Date.now();
        for (var pair in lastMarketUpdate) {
            var elapsed = now - lastMarketUpdate[pair];
            if (elapsed > MARKET_UPDATE_ELAPSED_WARN * 1000.0) {
                //Print("Warning: no updates in last "
                //    + MARKET_UPDATE_ELAPSED_WARN + "secs for " + pair);
            }
        }
    }
    
    function SchedulePairSubscription(pairs, i)
    {
        timeouts.push(setTimeout(function() {
            //Print("subscribing to " + pairs[i]);
            var orderBookSub = {
                "e": "order-book-subscribe",
                "data": {
                    "pair": pairs[i].split("-"),
                    "subscribe": true,
                    "depth": 0
                },
                "oid": "0"
            };
            WebSocketSend(orderBookSub);
        }, i * RATE_LIMIT_MIN_TIME * 1000));
    }
    
    function OnAuthenticated()
    {
        var pairs = Object.keys(mktData);

        for (var i = 0; i < pairs.length; i++) {
            SchedulePairSubscription(pairs, i);
        }
    
        checkConnInterval = setInterval(
            CheckConnection, CHECK_CONN_TIME * 1000);

        timeouts.push(setTimeout(function() {
            //Print("scheduling rebuilds");
            rebuildOrderBookInterval = setInterval(function() {
                var pair = pairs[nextPair];
                //Print("Rebuilding " + pair);
                nextPair = (nextPair + 1) % pairs.length;
                Rebuild(pair);
            }, REBUILD_ORDER_BOOK_TIME * 1000);
        }, pairs.length * RATE_LIMIT_MIN_TIME * 1000));
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
            //Print("unhandled message:");
            //console.log(msg);
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
            Print("server is down, restart crypto-arb app");
            ClearData();
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

function Start(callback)
{
    const url = "https://cex.io/api/currency_limits";
    https.get(url, function(res) {
        if (res.statusCode !== 200) {
            Print("currency limits returned " + res.statusCode);
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
                Print("currency limits JSON parse error " + err);
                return;
            }

            if (data["ok"] !== "ok") {
                Print("currency limits not ok");
                return;
            }

            var pairs = data.data.pairs;
            for (var i = 0; i < pairs.length; i++) {
                if (pairs[i].symbol1 === "GHS" || pairs[i].symbol2 === "GHS") {
                    // TODO unsupported for now
                    continue;
                }

                var pair = pairs[i].symbol1 + "-" + pairs[i].symbol2;
                mktData[pair] = {
                    asks: ordHash.Create(CompareFloats),
                    bids: ordHash.Create(CompareFloats)
                };
            }

            connection = CreateConnection();
            callback();
        });
    });
}

exports.Start = Start;
exports.data = mktData;

// ==================== REST API ====================

function GenerateIncreasingNonce()
{
    // Set the nonce to the number of milliseconds
    // that have passed since the reference date below.
    // This will always increase if called at > 1ms intervals.
    var refDate = new Date("December 20, 2017");
    var nonce = Math.floor(Date.now() - refDate.getTime());

    return nonce;
}

function CreateSignature(apiKey, apiSecret)
{
    var nonce = GenerateIncreasingNonce();
    var signatureHash = crypto.createHmac("sha256", apiSecret);
    signatureHash.update(nonce.toString() + user + apiKey, "utf8");

    return {
        key: apiKey,
        signature: signatureHash.digest("hex"),
        nonce: nonce
    };
}

function ArgsToQueryString(args)
{
    var str = "?";
    for (var key in args) {
        str += key + "=" + args[key] + "&";
    }

    return str.slice(0, -1);
}

function HandleResponse(res, callback)
{
    if (res.statusCode !== 200) {
        Print("request status code: " + res.statusCode);
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
            Print("JSON parse error: " + err);
            Print(data);
            return;
        }
        callback(data);
    });
}

function SubmitPublicRequest(type, args, callback)
{
    var options = {
        hostname: "cex.io",
        port: 443,
        path: "/api/" + type + "/" + ArgsToQueryString(args),
        method: "GET"
    };

    var req = https.request(options, function(res) {
        HandleResponse(res, callback);
    });
    req.on("error", function(err) {
        Print("Request error: " + err.message);
    });
    req.end();
}

function GetPrices(pair, callback)
{
    SubmitPublicRequest("order_book/" + pair[0] + "/" + pair[1],
        { depth: 5 }, function(data) {
            var prices = {
                asks: data.asks,
                bids: data.bids
            };

            callback(prices);
        }
    );
}

function SubmitPrivateRequest(type, data, callback)
{
    var postData = CreateSignature(key, secret);
    for (var k in data) {
        postData[k] = data[k];
    }

    var options = {
        hostname: "cex.io",
        port: 443,
        path: "/api/" + type + "/",
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        }
    };

    var req = https.request(options, function(res) {
        HandleResponse(res, callback);
    });
    req.on("error", function(err) {
        Print("Request error: " + err.message);
    });
    req.end(JSON.stringify(postData), "utf8");
}

function GetBalance(callback)
{
    SubmitPrivateRequest("balance", {}, function(data) {
        var balance = {};
        for (var currency in data) {
            if (currency === "timestamp" || currency === "username") {
                continue;
            }
            balance[currency] = data[currency].available;
        }

        callback(balance);
    });
}

function PlaceOrder(pair, action, price, amount, callback)
{
    /**
     * example:
     *     pair: "XRP-USD"
     *     type: "buy"
     *     price: 2.00
     *     amount: 100.00
     * 
     * You're requesting to buy 100.00 XRP, at a price of 2.00 USD per XRP.
     *    e.g. 200.00 USD => 100.00 XRP (minus fees)
     */

    if (!Array.isArray(pair)) {
        Print("pair not an array: " + pair);
        return;
    }
    if (!mktData.hasOwnProperty(pair.join("-"))) {
        Print("place order attempted on unsupported pair: " + pair.join("-"));
        return;
    }
    if (typeof(action) !== "string"
    || (action !== "buy" && action !== "sell")) {
        Print("invalid action: " + action);
        return;
    }
    if (Number.isNaN(amount)) {
        Print("amount not a number: " + amount);
        return;
    }
    if (Number.isNaN(price)) {
        Print("price not a number: " + price);
        return;
    }

    var pairReq = pair.join("/");
    SubmitPrivateRequest("place_order/" + pairReq, {
        type: action,
        amount: amount,
        price: price
    }, function(data) {
        if (data.hasOwnProperty("error")) {
            callback(null, null, data.error);
            return;
        }

        if (data.complete) {
            callback(data.price, data.amount, null);
            return;
        }

        var checks = 0;
        var id = data.id;
        var checkInt = setInterval(function() {
            SubmitPrivateRequest("get_order", { id: id }, function(data) {
                checks++;
                if (!data.hasOwnProperty("remains")) {
                    clearInterval(checkInt);
                    callback(data.price, data.amount, null);
                    return;
                }

                Print("order waiting for completion");
            });

            if (checks >= 6) {
                clearInterval(checkInt);
                SubmitPrivateRequest("cancel_order", { id: id },
                    function(data) {
                        if (!data) {
                            console.log("WARNING: Failed to cancel order");
                        }
                    }
                );
                callback(null, null, "Order timed out, cancelled");
            }
        }, 500);
    });
}

exports.GetPrices = GetPrices;
exports.GetBalance = GetBalance;
exports.PlaceOrder = PlaceOrder;