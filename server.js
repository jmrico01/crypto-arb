const fs = require("fs");
const cex = require("./cex");
const okcoin = require("./okcoin");

const path = require("path");
const express = require("express");
const app = express();

app.set("port", 8080);
app.use(express.static(path.join(__dirname, "public")));
app.listen(app.get("port"));

setInterval(function() {
    const frontEndPath = "public/data/";
    const sites = [
        {
            name: "OKCoin",
            module: okcoin,
            entryParser: function(entry) {
                return entry;
            },
            frontEndFile: "depth-okcoin.json"
        },
        {
            name: "CEX",
            module: cex,
            entryParser: function(entry) {
                const DECIMALS = 4;
                return [
                    entry[0].toFixed(DECIMALS),
                    [ entry[1][0].toFixed(DECIMALS), entry[1][1] ]
                ];
            },
            frontEndFile: "depth-cex.json"
        }
    ];
    for (var s = 0; s < sites.length; s++) {
        //console.log("Writing data for " + sites[s].name);
        var depth = {
            asks: [],
            bids: []
        };
        var keys;

        keys = sites[s].module.asks.keys();
        for (var i = 0; i < keys.length; i++) {
            var entry = [keys[i], sites[s].module.asks.val(keys[i])];
            depth.asks.push(sites[s].entryParser(entry));
        }
        keys = sites[s].module.bids.keys();
        for (var i = 0; i < keys.length; i++) {
            var entry = [keys[i], sites[s].module.bids.val(keys[i])];
            depth.bids.push(sites[s].entryParser(entry));
        }

        fs.writeFile(frontEndPath + sites[s].frontEndFile,
            JSON.stringify(depth), "utf8", function(err) {
                if (err) {
                    console.error(err);
                }
        });
    }
}, 1000);