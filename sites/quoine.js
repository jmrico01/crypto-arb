const https = require("https");

const ordHash = require("./../ordered-hash");

const host = "https://api.qryptos.com";

function Print(msg)
{
    console.log("(QUOINE) " + msg.toString());
}

var mktData = {};

var toStdPair = {};
var toQuoineID = {};

var pollDepthInterval = null;
// seconds it takes to refresh full market depth data for all currency pairs
var POLL_DEPTH_TIME = 100.0;
var nextPair = 0;

function RegisterPair(data)
{
    if (data.base_currency + data.quoted_currency != data.currency_pair_code) {
        Print("currency pair " + data.currency_pair_code + "out of order");
    }
    if (data.base_currency === "VET") {
        data.base_currency = "VEN";
    }
    if (data.quoted_currency === "VET") {
        data.quoted_currency = "VEN";
    }

    var pair = data.base_currency + "-" + data.quoted_currency;
    toStdPair[data.id] = pair;
    toQuoineID[pair] = data.id;
}

function ClearData(pair)
{
    mktData[pair].asks.clear();
    mktData[pair].bids.clear();
}

function ProcessDepthData(data, pair)
{
    ClearData(pair);
    var asks = data.sell_price_levels;
    var bids = data.buy_price_levels;

    var time = Date.now();
    for (var i = 0; i < asks.length; i++) {
        var price = asks[i][0];
        var volume = asks[i][1];

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
    for (var i = 0; i < bids.length; i++) {
        var price = bids[i][0];
        var volume = bids[i][1];

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


function StartDataPoll()
{
    var pairs = Object.keys(mktData);
    pollDepthInterval = setInterval(function() {
        var pair = pairs[nextPair];
        var quoineID = toQuoineID[pair];
        nextPair = (nextPair + 1) % pairs.length;
        
        const url = host + "/products/" + quoineID + "/price_levels?full=1";
        var req = https.get(url, function(res) {
            if (res.statusCode !== 200) {
                if (res.statusCode === 429) {
                    Print("rate limit exceeded");
                }
                else {
                    Print("price levels request returned " + res.statusCode);
                }
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
                    Print("products JSON parse error " + err);
                    return;
                }

                ProcessDepthData(data, pair);
            });
        });
    }, POLL_DEPTH_TIME * 1000.0 / pairs.length);

    Print("started");
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
    const url = host + "/products";
    var req = https.get(url, function(res) {
        if (res.statusCode !== 200) {
            if (res.statusCode === 429) {
                Print("rate limit exceeded");
            }
            else {
                Print("products request returned " + res.statusCode);
            }
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
                Print("products JSON parse error " + err);
                return;
            }

            for (var i = 0; i < data.length; i++) {
                if (data[i].product_type != "CurrencyPair" || data[i].disabled) {
                    continue;
                }

                RegisterPair(data[i]);
                var pair = toStdPair[data[i].id];
                mktData[pair] = {
                    asks: ordHash.Create(CompareFloatStrings),
                    bids: ordHash.Create(CompareFloatStrings)
                }
            }

            StartDataPoll();
            callback();
        });
    });
}

exports.quoinex = {
    data: mktData,
    Start: Start
}
exports.qryptos = {
    data: mktData,
    Start: Start
}