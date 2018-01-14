const fs = require("fs");
const https = require("https");
const path = require("path");
const express = require("express");
const app = express();

const bitstamp = require("./sites/bitstamp");
const cex = require("./sites/cex");
const kraken = require("./sites/kraken");
const okcoin = require("./sites/okcoin");
const poloniex = require("./sites/poloniex");
const quoine = require("./sites/quoine");

const analyzer = require("./analyzer");
const profits = require("./profits");

const sites = {
    "Bitstamp": {
        enabled: true,
        module: bitstamp,
        entryParser: function(entry) {
            return entry;
        }
    },
    "CEX": {
        enabled: true,
        module: cex,
        entryParser: function(entry) {
            const DECIMALS = 4;
            return [
                entry[0].toFixed(DECIMALS),
                [ entry[1][0].toFixed(DECIMALS), entry[1][1] ]
            ];
        }
    },
    "Kraken": {
        enabled: false,
        module: kraken,
        entryParser: function(entry) {
            return entry;
        }
    },
    "OKCoin": {
        enabled: true,
        module: okcoin,
        entryParser: function(entry) {
            return entry;
        }
    },
    "Poloniex": {
        enabled: false,
        module: poloniex,
        entryParser: function(entry) {
            return entry;
        }
    },
    "QUOINEX": {
        enabled: false,
        module: quoine.quoinex,
        entryParser: function(entry) {
            return entry;
        }
    },
    "QRYPTOS": {
        enabled: false,
        module: quoine.qryptos,
        entryParser: function(entry) {
            return entry;
        }
    }
};

// Start site modules, which pull in data from each API
var siteNames = Object.keys(sites);
function StartSiteRecursive(idx, callback)
{
    var site = siteNames[idx];
    if (!sites[site].enabled) {
        if (idx + 1 < siteNames.length) {
            StartSiteRecursive(idx + 1, callback);
        }
        else {
            callback();
        }
        return;
    }

    sites[site].module.Start(function() {
        for (var pair in sites[site].module.data) {
            var pairSplit = pair.split("-");
            for (var i = 0; i < 2; i++) {
                if (!currencies.hasOwnProperty(pairSplit[i])) {
                    console.log("WARNING: unrecognized currency");
                    console.log("    " + site + ": " + pairSplit[i]
                        + " in pair " + pairSplit);
                }
            }
        }
        if (idx + 1 < siteNames.length) {
            StartSiteRecursive(idx + 1, callback);
        }
        else {
            callback();
        }
    });
}

// Standardized currency symbols and info
var currencies = {
    "USD": { name: "US Dollar" },
    "CAD": { name: "Canadian Dollar" },
    "EUR": { name: "Euro" },
    "GBP": { name: "British Pound" },
    "RUB": { name: "Russian Ruble" },
    "INR": { name: "Indian Rupee" },
    "CNY": { name: "Chinese Yuan" },
    "JPY": { name: "Japanese Yen" },
    "HKD": { name: "Hong Kong Dollar" },
    "PHP": { name: "Philippine Piso" },
    "SGD": { name: "Singapore Dollar" },
    "IDR": { name: "Indonesian Rupiah" },
    "AUD": { name: "Australian Dollar" }
};
// Get cryptocurrencies from CoinMarketCap
//   https://coinmarketcap.com/
const coinMarketCapTicker = "https://api.coinmarketcap.com/v1/ticker/?limit=0";
https.get(coinMarketCapTicker, function(res) {
    if (res.statusCode !== 200) {
        Print("CoinMarketCap ticker returned " + res.statusCode);
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
            Print("CoinMarketCap ticker JSON parse error " + err);
            return;
        }

        for (var i = 0; i < data.length; i++) {
            currencies[data[i].symbol] = {
                name: data[i].name,
                marketCap: data[i].market_cap_usd,
                supply: data[i].total_supply,
                time: data[i].last_updated
            };
        }
        console.log("Received CoinMarketCap currency data");
        
        StartSiteRecursive(0, function() {
            console.log("All sites started");
        
            // Start the analyzer
            //analyzer.Start(sites, pairs);
            
            // Start analyzer v2
            profits.Start(sites);
        });
    });
});

app.set("port", 8080);
app.use(express.static(path.join(__dirname, "public")));
app.listen(app.get("port"));

// Serve enabled sites
app.get("/enabledSites", function(req, res) {
    var enabledSites = [];
    for (var site in sites) {
        if (sites[site].enabled) {
            enabledSites.push(site);
        }
    }
    res.send(enabledSites);
});

// Serve enabled pairs for the given site
app.get("/enabledPairs", function(req, res) {
    var site = req.query.site;

    if (!sites.hasOwnProperty(site)) {
        res.sendStatus(404);
        return;
    }
    if (!sites[site].enabled) {
        res.sendStatus(404);
        return;
    }

    var enabledPairs = [];
    for (var pair in sites[site].module.data) {
        enabledPairs.push(pair);
    }
    res.send(enabledPairs);
});

// Serve market depth data
app.get("/depth", function(req, res) {
    var site = req.query.site;
    var pair = req.query.pair;

    if (!sites.hasOwnProperty(site)) {
        res.sendStatus(404);
        return;
    }
    if (!sites[site].module.data.hasOwnProperty(pair)) {
        res.sendStatus(404);
        return;
    }

    var pairData = sites[site].module.data[pair];
    var depth = {
        asks: [],
        bids: []
    };
    var keys;

    keys = pairData.asks.keys();
    for (var i = 0; i < keys.length; i++) {
        var entry = pairData.asks.entry(keys[i]);
        depth.asks.push(sites[site].entryParser(entry));
    }
    keys = pairData.bids.keys();
    for (var i = 0; i < keys.length; i++) {
        var entry = pairData.bids.entry(keys[i]);
        depth.bids.push(sites[site].entryParser(entry));
    }
    
    res.send(depth);
});

app.get("/profits", function (req, res) {
    var threshold = parseFloat(req.query.threshold);
    if (isNaN(threshold)) {
        res.sendStatus(400);
    }
    res.send(analyzer.PastThreshold(threshold));
});

function HandlePathsRequest(type, req, res)
{
    var k = parseInt(req.query.k);
    var order = req.query.order;
    var invest = parseFloat(req.query.invest);
    if (isNaN(k)) {
        res.sendStatus(400);
        return;
    }
    if (order !== "absolute" && order !== "invest") {
        res.sendStatus(400);
        return;
    }
    if (order === "invest") {
        if (isNaN(invest)) {
            res.sendStatus(400);
            return;
        }
    }

    res.send(profits.GetMaxProfitPaths(type, k, order, invest));
}

app.get("/profitPaths", function(req, res) {
    HandlePathsRequest("paths", req, res);
});
app.get("/profitCycles", function(req, res) {
    HandlePathsRequest("cycles", req, res);
});