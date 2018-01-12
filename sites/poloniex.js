const autobahn = require("autobahn");
const https = require("https");

const ordHash = require("./../ordered-hash");

const host = "wss://api.poloniex.com";

function Print(msg)
{
    console.log("(Poloniex) " + msg.toString());
}

var mktData = {};
var connection = null;

function StdPairToPoloniex(pair)
{
    var pairSplit = pair.split("-");
    for (var i = 0; i < 2; i++) {
        if (pairSplit[i] === "XLM") {
            pairSplit[i] = "STR";
        }
    }

    return pairSplit[0] + "_" + pairSplit[1];
}
function PoloniexPairToStd(pPair)
{
    var pairSplit = pPair.split("_");
    for (var i = 0; i < 2; i++) {
        if (pairSplit[i] === "STR") {
            pairSplit[i] = "XLM";
        }
    }

    return pairSplit[0] + "-" + pairSplit[1];
}

function CreateConnection()
{
    var wsConn = new autobahn.Connection({
        url: host,
        realm: "realm1"
    });

    wsConn.onopen = function(session) {
        session.subscribe("trollbox", function(args) {
            console.log("hello sailor");
        }).then(
            function(subscription) {
                Print("success");
            },
            function(error) {
                Print("error");
            }
        );

        Print("connected");
    };
    wsConn.onclose = function() {
        Print("connection closed");

        Print("restarting");
        connection = CreateConnection();
    };

    wsConn.open();
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
    const url = "https://poloniex.com/public?command=returnTicker";
    var req = https.get(url, function(res) {
        if (res.statusCode !== 200) {
            Print("ticker request returned " + res.statusCode);
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
                Print("ticker JSON parse error " + err);
                return;
            }

            for (var pPair in data) {
                var pair = PoloniexPairToStd(pPair);

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

exports.data = mktData;
exports.Start = Start;