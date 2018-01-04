const fs = require("fs");
const path = require("path");
const express = require("express");
const app = express();

const bitstamp = require("./sites/bitstamp");
const cex = require("./sites/cex");
const kraken = require("./sites/kraken");
const okcoin = require("./sites/okcoin");

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
        enabled: true,
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
};

const enabledCryptos = [
    "BCH",
    "BTC",
    "BTG",
    "DASH",
    "ETC",
    "ETH",
    "LTC",
    //"USDT",
    //"XMR",
    "XRP",
    "ZEC"
];
const enabledFiats = [
    "USD"
];

var pairs = [];
for (var i = 0; i < enabledFiats.length; i++) {
    for (var j = 0; j < enabledCryptos.length; j++) {
        pairs.push(enabledCryptos[j] + "-" + enabledFiats[i]);
    }
}

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

    console.log("starting " + site);
    sites[site].module.Start(pairs, function() {
        if (idx + 1 < siteNames.length) {
            StartSiteRecursive(idx + 1, callback);
        }
        else {
            callback();
        }
    });
}

StartSiteRecursive(0, function() {
    console.log("All sites started");

    // Start the analyzer
    analyzer.Start(sites, pairs);
    
    // Start analyzer v2
    //profits.Start(sites);
});

//mongoose.connect("")

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
    res.send(analyzer.PastThreshold(threshold));
});