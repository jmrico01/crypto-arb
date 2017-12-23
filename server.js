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
        enabled: false,
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
    "USDT",
    "XMR",
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

const frontEndPath = "public/data/";

function InitFrontEnd()
{
    var enabledSites = [];
    for (var site in sites) {
        if (sites[site].enabled) {
            enabledSites.push(site);
        }
    }
    fs.writeFileSync(frontEndPath + "enabled",
        JSON.stringify({
            sites: enabledSites,
            cryptos: enabledCryptos,
            fiats: enabledFiats
        })
    );

    app.set("port", 8080);
    app.use(express.static(path.join(__dirname, "public")));
    app.listen(app.get("port"));

    setInterval(function() {
        for (var site in sites) {
            if (!sites[site].enabled) continue;
    
            //console.log("Writing data for " + site);
            for (var pair in sites[site].module.data) {
                //console.log(site + ": reading data for " + pair);
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
    
                var fileName = "depth-" + site + "-" + pair;
                fs.writeFile(frontEndPath + fileName, JSON.stringify(depth), "utf8",
                    function(err) {
                        if (err) {
                            console.log("Write failed for " + fileName);
                            return;
                        }
                    }
                );
            }
        }
    }, 1000);
}

function DeleteFolderRecursiveSync(path) {
    if (fs.existsSync(path)) {
        fs.readdirSync(path).forEach(function(file, index) {
            var curPath = path + "/" + file;
            if (fs.lstatSync(curPath).isDirectory()) {
                // recurse
                DeleteFolderRecursiveSync(curPath);
            }
            else {
                // delete file
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(path);
    }
}
/*DeleteFolderRecursiveSync(frontEndPath);
fs.mkdir(frontEndPath, function(err) {
    if (err) {
        console.log("Make dir failed for " + frontEndPath);
        return;
    }
});*/
InitFrontEnd();