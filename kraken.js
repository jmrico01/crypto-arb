const fs = require("fs");
const https = require("https");
const crypto = require("crypto");

const ordHash = require("./ordered-hash");

const key = "vF0cAyn3hjEphiQ7ljxE5nwEEF+zRTynHVMcuFHyhGDBauCgtvk+ogsR";
const secret = fs.readFileSync("keys/kraken", "utf8").trim();

const host = "api.kraken.com";

function Print(msg)
{
    console.log("(KRAKEN) " + msg);
}

var mktData = {
    // Example entry
    // 
    // "BTC-USD": {
    //     asks: ordHash.Create(...),
    //     bids: ordHash.Create(...)
    // }
};

function StdPairToKraken(pair)
{
    var p = pair.split("-");
    if (p[0] === "BCH" || p[0] === "DASH") {
        return p[0] + p[1];
    }
    if (p[0] === "USDT") {
        return p[0] + "Z" + p[1];
    }

    return "X" + p[0] + "Z" + p[1];
}

// return null on unrecognized/unsupported pair
function KrakenPairToStd(pair)
{
    if (pair.substring(0, 3) === "BCH") {
        return "BCH-" + pair.substring(3, pair.length);
    }
    if (pair.substring(0, 3) === "EOS") {
        return "EOS-" + pair.substring(3, pair.length);
    }
    if (pair.substring(0, 3) === "GNO") {
        return "GNO-" + pair.substring(3, pair.length);
    }
    if (pair.substring(0, 4) === "DASH") {
        return "DASH-" + pair.substring(4, pair.length);
    }
    if (pair.substring(0, 4) === "USDT") {
        return "USDT-" + pair.substring(5, pair.length);
    }

    if (pair.length === 8) {
        return pair.substring(1, 4) + "-" + pair.substring(5, 8);
    }
    if (pair.length === 10) {
        // the .d pairs
        return null;
    }

    Print("unhandled Kraken pair: " + pair);
    return null;
}

function ArgsToQueryString(args)
{
    var str = "?";
    for (var key in args) {
        str += key + "=" + args[key] + "&";
    }

    return str.slice(0, -1);
}

function GenerateIncreasingNonce()
{
    // Set the nonce to the hundredths of a second
    // that have passed since the reference date below.
    // This will always increase if called at > 10ms intervals.
    var refDate = new Date("December 20, 2017");
    var nonce = Math.floor(Date.now() / 10 - refDate.getTime() / 10);

    return nonce;
}

function CreateSignature(path, reqBody, nonce, apiKey, apiSecret)
{
    // API-Sign = Message signature using HMAC-SHA512 of
    // (URI path + SHA256(nonce + POST data))
    // and base64 decoded secret API key
    var secretBuf   = new Buffer(apiSecret, "base64");
    var hash        = crypto.createHash("sha256");
    var hmac        = crypto.createHmac("sha512", secretBuf);
    var hashDigest  = hash.update(nonce + reqBody).digest("binary");
    var hmacDigest  = hmac.update(path + hashDigest, "binary").digest("base64");
    
    return hmacDigest
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
            callback(data);
        }
        catch (err) {
            Print("JSON parse error: " + err);
        }
    });
}

function SubmitPrivateRequest(type, args, callback)
{
    const pvtPath = "/0/private/";

    var queryString = ArgsToQueryString(args);

    var nonce = GenerateIncreasingNonce();
    var postData = "nonce=" + nonce.toString();

    var path = pvtPath + type + queryString;
    var httpHeader = {
        "API-Key": key,
        "API-Sign": CreateSignature(path, postData, nonce, key, secret)
    }

    var options = {
        hostname: host,
        port: 443,
        path: path,
        method: "POST",
        headers: httpHeader
    };

    //Print("Submitting request: " + type);
    var req = https.request(options, function(res) {
        HandleResponse(res, callback);
    });

    req.on("error", function(err) {
        Print("Request error: " + err.message);
    });

    req.end(postData, "utf8");
}

function SubmitPublicRequest(type, args, callback)
{
    const publicPath = "/0/public/";

    var queryString = ArgsToQueryString(args);

    var options = {
        hostname: host,
        port: 443,
        path: publicPath + type + queryString
    };

    //Print("Submitting request: " + type);
    var req = https.get(options, function(res) {
        HandleResponse(res, callback);
    });

    req.on("error", function(err) {
        Print("Request error: " + err.message);
    });
}

/*SubmitPublicRequest("Time", {}, function(data) {
    Print(data)
});*/
/*SubmitPublicRequest("Ticker", {
    pair: "XXBTZUSD"
}, function(data) {
    Print(data);
});*/
/*SubmitPublicRequest("AssetPairs", {
    //pair: "XXBTZUSD"
}, function(data) {
    Print(data);
});*/
/*SubmitPublicRequest("Depth", {
    pair: "XXBTZUSD"
}, function(data) {
    Print(data.result.XXBTZUSD.asks)
});*/
/*SubmitPrivateRequest("Balance", {}, function(data) {
    Print(data);
});*/

var pollTickerInterval = null;
var POLL_TICKER_TIME = 2; // seconds

var pollDepthInterval = null;
// seconds it takes to refresh full market depth data for all currency pairs
var POLL_DEPTH_TIME = 15;

function ProcessTickerData(data) {
    for (var kPair in data) {
        var pair = KrakenPairToStd(kPair);
        if (pair === null) continue;

        

        if (mktData[pair].asks.length > 0) {
            while (true) {
                break;
                //if (parseFloat(mktData[pair].asks[0][0]) > )
            }
        }
        mktData[pair].asks;
        mktData[pair].bids;
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
