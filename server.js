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
            frontEndFile: "depth-okcoin.json"
        },
        {
            name: "CEX",
            module: cex,
            frontEndFile: "depth-cex.json"
        }
    ];
    for (var s = 0; s < sites.length; s++) {
        console.log("Writing data for " + sites[s].name);
        var depth = {
            asks: [],
            bids: []
        };
        var keys;

        keys = sites[s].module.asks.keys();
        for (var i = 0; i < keys.length; i++) {
            depth.asks.push([keys[i], sites[s].module.asks.val(keys[i])]);
        }
        keys = sites[s].module.bids.keys();
        for (var i = 0; i < keys.length; i++) {
            depth.bids.push([keys[i], sites[s].module.bids.val(keys[i])]);
        }

        /*fs.writeFile(frontEndPath + sites[s].frontEndFile,
            JSON.stringify(depth), "utf8", function(err) {
                if (err) {
                    console.error(err);
                }
        });*/
    }
}, 1000);