const fs = require("fs");
const Pusher = require("pusher-js");


const ordHash = require("./ordered-hash");

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
    pusher.connection.bind("error", function(err) {
        Print("connection error: " + err);
        Print("restarting");
        connection = CreateConnection();
    });
    pusher.connection.bind("disconnect", function() {
        Print("disconnected");
        Print("restarting");
        connection = CreateConnection();
    });

    for (var pair in mktData) {
        SubscribeOrderBook(pair);
    }
    /*ws.on("message", OnIncoming);
    ws.on("open", function() {
        //Print("Client: connected");
    });
    ws.on("close", function(code, reason) {
        Print("connection closed, code " + code);
        Print(reason);

        // Restart connection globally here.
        Print("restarting conection");
        connection = CreateConnection();
    });*/
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
        "XRP",
        "LTC",
        "ETH",
        "BCH",
    ];
    var supportedFiats = [
        "USD",
        "EUR",
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

exports.Start = Start;
exports.data = mktData;