const fs = require("fs");
const https = require("https");
const crypto = require("crypto");

const key = "AkdAx165oc4HYJfjxjEONeRWpo3aYcH9Oq5/R77mv1CG+vM55HMY3Jfk";
const secret = fs.readFileSync("keys/kraken", "utf8").trim();

const host = "api.kraken.com";

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
    var refDate = new Date("December 1, 2017");
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
        console.log("Request status code: " + res.statusCode);
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
            console.log("JSON parse error: " + err);
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
        'API-Key': key,
        'API-Sign': CreateSignature(path, postData, nonce, key, secret)
    }

    var options = {
        hostname: host,
        port: 443,
        path: path,
        method: "POST",
        headers: httpHeader
    };

    console.log("Submitting request: " + type);
    var req = https.request(options, function(res) {
        HandleResponse(res, callback);
    });

    req.on("error", function(err) {
        console.log("Request error: " + err.message);
    });

    req.end(postData, "utf8");
}

function SubmitPublicRequest(type, args, callback)
{
    const publicPath = "/0/public/";

    var queryString = ArgsToQueryString(args);
    console.log(queryString);

    var options = {
        hostname: host,
        port: 443,
        path: publicPath + type + queryString,
        method: "GET"
    };
    console.log(options)

    console.log("Submitting request: " + type);
    var req = https.request(options, function(res) {
        HandleResponse(res, callback);
    });

    req.on("error", function(err) {
        console.log("Request error: " + err.message);
    });
}

//SubmitPublicRequest("Time");
/*SubmitPublicRequest("Assets", {
    asset: "BTC"
});*/
/*SubmitPublicRequest("AssetPairs", {
    pair: "XXBTZUSD"
});*/
/*SubmitPublicRequest("Depth", {
    pair: "XXBTZUSD"
}, function(data) {
    console.log(data.result.XXBTZUSD.asks)
});*/
SubmitPrivateRequest("Balance", {}, function(data) {
    console.log(data);
});