const fs = require("fs");
const https = require("https");
const Pusher = require("pusher-js");

const ordHash = require("./../ordered-hash");

// Unused for now
const key = "";
const secret = fs.readFileSync("keys/bitstamp", "utf8").trim();

const pusherKey = "de504dc5763aeef9ff52";

function Print(msg)
{
    console.log("(BITSTAMP) " + msg);
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

function CreateConnection()
{
    var pusher = null;
    var channels = {};

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

    function Close()
    {
        Print("call to Close()");

        if (pusher !== null) {
            pusher.disconnect();
            pusher = null;
        }

        ClearData();
    }

    function AddMarketData(pair, data)
    {
        var time = parseInt(data.timestamp) * 1000;
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

    function SubscribeOrderBook(pair)
    {
        var pairBitstamp = pair.toLowerCase().replace("-", "");
        var channel = "diff_order_book_" + pairBitstamp;
        if (pair === "BTC-USD") {
            channel = "diff_order_book";
        }
        var sub = pusher.subscribe(channel);
        sub.bind("data", function(data) {
            AddMarketData(pair, data);
        });
    }

    pusher = new Pusher(pusherKey, {
        cluster: "mt1"
    });
    pusher.connection.bind("connected", function() {
        Print("connected");
    });
    pusher.connection.bind("error", function(err) {
        Print("connection error: " + err);
        Print("restarting");
        connection = CreateConnection();
    });
    pusher.connection.bind("disconnected", function() {
        Print("disconnected");
        Print("restarting");
        connection = CreateConnection();
    });

    for (var pair in mktData) {
        SubscribeOrderBook(pair);
    }

    setTimeout(function() {
        Close();
    }, RESET_CONN_TIME * 1000);
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
    const url = "https://www.bitstamp.net/api/v2/trading-pairs-info/";
    var req = https.get(url, function(res) {
        if (res.statusCode !== 200) {
            Print("pair info returned " + res.statusCode);
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
                Print("pair info JSON parse error " + err);
                return;
            }

            for (var i = 0; i < data.length; i++) {
                var pair = data[i].name.replace("/", "-");
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

exports.Start = Start;
exports.data = mktData;