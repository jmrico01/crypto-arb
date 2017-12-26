const fs = require("fs");
const https = require("https");
const crypto = require("crypto");

const ordHash = require("./ordered-hash");

const key = "vF0cAyn3hjEphiQ7ljxE5nwEEF+zRTynHVMcuFHyhGDBauCgtvk+ogsR";
const secret = fs.readFileSync("keys/kraken", "utf8").trim();

const host = "api.kraken.com";

function Print(msg)
{
    console.log("(QUOINEX) " + msg);
}

var mktData = {
    // Example entry
    // 
    // "BTC-USD": {
    //     asks: ordHash.Create(...),
    //     bids: ordHash.Create(...)
    // }
};

var pollTickerInterval = null;
var POLL_TICKER_TIME = 0.2; // seconds

var pollDepthInterval = null;
// seconds it takes to refresh full market depth data for all currency pairs
var POLL_DEPTH_TIME = 5.0;
var nextPair = 0;

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
    const publicPath = "/0/public/";

    var queryString = ArgsToQueryString(args);

    var options = {
        hostname: host,
        port: 443,
        path: publicPath + type + queryString,
        headers: {
            "X-Quoine-API-Version": 2
        }
    };

    //Print("Submitting request: " + type);
    var req = https.get(options, function(res) {
        HandleResponse(res, callback);
    });

    req.on("error", function(err) {
        Print("Request error: " + err.message);
    });
}

function ClearData(pair)
{
    mktData[pair].asks.clear();
    mktData[pair].bids.clear();
}

function ProcessDepthData(data)
{
    // Should only be one pair, but loop anyway I guess...
    for (var kPair in data) {
        var pair = KrakenPairToStd(kPair);
        if (pair === null) continue;

        ClearData(pair);
        var asks = data[kPair].asks;
        var bids = data[kPair].bids;

        for (var i = 0; i < asks.length; i++) {
            var price = asks[i][0];
            var volume = asks[i][1];
            var time = asks[i][2];
    
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
            var time = bids[i][2];
    
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
}

function ProcessTickerData(data)
{
    for (var kPair in data) {
        var pair = KrakenPairToStd(kPair);
        if (pair === null) continue;

        var asks = mktData[pair].asks;
        var bids = mktData[pair].bids;

        var minAskPrice = data[kPair].a[0];
        var minAskVol = data[kPair].a[1];
        var maxBidPrice = data[kPair].b[0];
        var maxBidVol = data[kPair].b[1];

        while (asks.length() > 0) {
            var curMinAskPrice = asks.keys()[0];
            if (parseFloat(curMinAskPrice) < parseFloat(minAskPrice)) {
                asks.delete(curMinAskPrice);
            }
            else {
                break;
            }
        }
        if (asks.exists(minAskPrice)) {
            asks.set(minAskPrice, [minAskVol, Date.now()]);
        }
        else {
            asks.insert(minAskPrice, [minAskVol, Date.now()]);
        }
        while (bids.length() > 0) {
            var curMaxBidPrice = bids.keys()[bids.length() - 1];
            if (parseFloat(curMaxBidPrice) > parseFloat(maxBidPrice)) {
                bids.delete(curMaxBidPrice);
            }
            else {
                break;
            }
        }
        if (bids.exists(maxBidPrice)) {
            bids.set(maxBidPrice, [maxBidVol, Date.now()]);
        }
        else {
            bids.insert(maxBidPrice, [maxBidVol, Date.now()]);
        }
    }
}

function StartDataPoll()
{
    pollTickerInterval = setInterval(function() {
        var krakenPairs = [];
        for (var pair in mktData) {
            krakenPairs.push(StdPairToKraken(pair));
        }

        SubmitPublicRequest("Ticker", {
            pair: krakenPairs.join(",")
        }, function(data) {
            if (data.error.length > 0) {
                Print("ticker error");
                return;
            }

            ProcessTickerData(data.result);
        });
    }, POLL_TICKER_TIME * 1000);

    var numPairs = Object.keys(mktData).length;
    pollDepthInterval = setInterval(function() {
        var pair = Object.keys(mktData)[nextPair];
        nextPair = (nextPair + 1) % Object.keys(mktData).length;
        SubmitPublicRequest("Depth", {
            pair: StdPairToKraken(pair)
        }, function(data) {
            if (data.error.length > 0) {
                Print("depth error");
                return;
            }

            ProcessDepthData(data.result);
        });
    }, POLL_DEPTH_TIME * 1000.0 / numPairs);
}

function CompareFloatStrings(s1, s2)
{
    var f1 = parseFloat(s1);
    var f2 = parseFloat(s2);
    if (f1 < f2)    return -1;
    if (f1 > f2)    return 1;
    else            return 0;
}

function Stop()
{
    clearInterval(pollDepthInterval);
    clearInterval(pollTickerInterval);
}

function Start(pairs)
{
    SubmitPublicRequest("AssetPairs", {}, function(data) {
        if (data.error.length !== 0) {
            Print("couldn't retrieve asset pairs");
            return;
        }

        var supportedPairs = [];
        for (var kPair in data.result) {
            var pair = KrakenPairToStd(kPair);
            if (pair !== null) {
                supportedPairs.push(pair);
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
        
        StartDataPoll();
    });
}

exports.data = mktData;
exports.Start = Start;
