const fs = require("fs");
const cex = require("./cex");
const okcoin = require("./okcoin");
const kraken = require("./kraken");

const path = require("path");
const express = require("express");
const app = express();

const sites = {
    "OKCoin": {
        enabled: true,
        module: okcoin,
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
    }
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

for (var site in sites) {
    if (!sites[site].enabled) continue;

    console.log("starting " + site);
    sites[site].module.Start(pairs);
}

function InitFrontEnd()
{
    app.set("port", 8080);
    app.use(express.static(path.join(__dirname, "public")));
    app.listen(app.get("port"));

    // Serve enabled sites & currencies
    app.get("/enabled", function(req, res) {
        var enabledSites = [];
        for (var site in sites) {
            if (sites[site].enabled) {
                enabledSites.push(site);
            }
        }
        res.send({
            sites: enabledSites,
            cryptos: enabledCryptos,
            fiats: enabledFiats
        });
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
}

InitFrontEnd();