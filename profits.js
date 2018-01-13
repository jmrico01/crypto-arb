const UPDATE_TIME = 0.2;
const MIN_WRITE_TIME = 0.5;
const PROFIT_PATHS_PROGRAM = "build/profit_paths";
const PROFIT_GRAPH_FILE = "temp/profit-graph.data";
const PROFIT_PATHS_FILE = "temp/profit-paths.json";
const PROFIT_CYCLES_FILE = "temp/profit-cycles.json";

const fs = require("fs");
const childProcess = require("child_process");
const fees = require("./sites/fees");
const ordHash = require("./ordered-hash")
const Queue = require("./queue");

// See server.js "sites" variable
var sites = {};

var nodes = {};
var links = {};

var profitCycles = [];

function IsFiat(currency)
{
    var fiats = [
        "USD",
        "EUR",
        "GBP",
        "CAD"
    ];

    return fiats.indexOf(currency) !== -1;
}

// Returns a boolean value indicating whether the given site
// supports the exchange of the given currency pair.
function SiteExchangesPair(site, curr1, curr2)
{
    var pair1 = curr1 + "-" + curr2;
    var pair2 = curr2 + "-" + curr1;

    return sites[site].module.data.hasOwnProperty(pair1)
        || sites[site].module.data.hasOwnProperty(pair2);
}

function CurrenciesToPair(site, curr1, curr2)
{
    var pair = curr1 + "-" + curr2;
    if (!sites[site].module.data.hasOwnProperty(pair)) {
        pair = curr2 + "-" + curr1;
    }

    return pair;
}

function GetExchangeRate(site, curr1, curr2)
{
    var pair = curr1 + "-" + curr2;
    if (sites[site].module.data.hasOwnProperty(pair)) {
        var lenBids = sites[site].module.data[pair].bids.length();
        return sites[site].module.data[pair].bids.entryByIndex(lenBids - 1)[0];
    }
    else {
        pair = curr2 + "-" + curr1;
        return 1.0 / sites[site].module.data[pair].asks.entryByIndex(0)[0];
    }
}

function GetMaxProfitPaths(type, k, order, invest)
{
    var paths = [];

    if (type === "paths") {
        return [];
    }
    else if (type === "cycles") {
        paths = profitCycles;
    }
    else {
        console.assert(false, "Wrong path request type");
        return [];
    }

    /*try {
        paths = JSON.parse(fs.readFileSync(pathsFile));
    }
    catch (err) {
        return [];
    }*/

    if (order === "invest") {
        paths.sort(function(path1, path2) {
            var out1 = invest * path1[0][0] - path1[0][1];
            var out2 = invest * path2[0][0] - path2[0][1];

            if (out1 > out2) return -1;
            else if (out1 < out2) return 1;
            else return 0;
        });
    }

    k = Math.min(k, paths.length);
    return paths.slice(0, k);
    return [];
}

function CalcPathProfit(path)
{
    var profit = [1.0, 0.00, 0.0];
    for (var i = 1; i < path.length; i++) {
        var link = links[path[i-1]][path[i]];
        profit[0] *= link[0];
        profit[1] = profit[1] * link[0] + link[1];
        profit[2] += link[2];
    }

    return profit;
}

function CalcCycleProfit(cycle)
{
    var profit = CalcPathProfit(cycle);

    var link = links[cycle[cycle.length-1]][cycle[0]];
    profit[0] *= link[0];
    profit[1] = profit[1] * link[0] + link[1];
    profit[2] += link[2];

    return profit;
}

function AnalyzeProfitCycles()
{
    for (var i = 0; i < profitCycles.length; i++) {
        if (profitCycles[i][0][2] === 0.0) {
            var profit = CalcCycleProfit(profitCycles[i][1]);
            //console.log("INSTANT PROFIT! (supposedly)");
            if (profit[0] > 1.0 && profit[2] === 0.0) {
                var string = "INSTANT PROFIT!\n";
                string += profit.toString();
                string += profitCycles[i][1].toString();
                fs.appendFile("cycle-log", string);
                
                console.log("INSTANT PROFIT!");
                console.log(profit);
                console.log(profitCycles[i][1]);
            }
        }
    }
}

function WriteProfitGraph(filePath, callback)
{
    var dataStr = "";

    // Write nodes
    var nodeArray = Object.keys(nodes);
    dataStr += nodeArray.length.toString() + "\n";
    for (var i = 0; i < nodeArray.length; i++) {
        dataStr += nodeArray[i] + ","
    }
    dataStr = dataStr.substring(0, dataStr.length - 1) + "\n";

    // Write links
    for (var i = 0; i < nodeArray.length; i++) {
        for (var j = 0; j < nodeArray.length; j++) {
            if (links.hasOwnProperty(nodeArray[i])) {
                if (links[nodeArray[i]].hasOwnProperty(nodeArray[j])) {
                    if (links[nodeArray[i]][nodeArray[j]] !== null) {
                        dataStr += 
                            "["
                            + links[nodeArray[i]][nodeArray[j]].toString()
                            + "]";
                    }
                }
            }
            dataStr += ",";
        }
        dataStr = dataStr.substring(0, dataStr.length - 1) + "\n";
    }
    dataStr = dataStr.substring(0, dataStr.length - 1);

    //console.log(dataStr);
    fs.writeFile(filePath, dataStr, callback);
}

function UpdateExchangeLinks()
{
    for (var node1 in links) {
        for (var node2 in links[node1]) {
            // Link node1 -> node2
            var site = node1.split("-")[0];
            var curr1 = node1.split("-")[1];
            var curr2 = node2.split("-")[1];

            if (site !== node2.split("-")[0]) {
                continue;
            }
            var pair = CurrenciesToPair(site, curr1, curr2);
            if (sites[site].module.data[pair].asks.length() === 0
            || sites[site].module.data[pair].bids.length() === 0) {
                continue;
            }

            var exchangeRate = GetExchangeRate(site, curr1, curr2);
            var feeExchange = fees.Exchange(site, curr1, curr2);

            links[node1][node2] = [
                exchangeRate * (1.0 - feeExchange[0]),
                feeExchange[1],
                0.0 // TODO instant for now
            ];
        }
    }
}

function Start(sitesIn)
{
    sites = sitesIn;

    // Create nodes
    for (var site in sites) {
        if (!sites[site].enabled) {
            continue;
        }

        var currencies = [];
        for (var pair in sites[site].module.data) {
            pair = pair.split("-");
            if (currencies.indexOf(pair[0]) === -1) {
                currencies.push(pair[0]);
            }
            if (currencies.indexOf(pair[1]) === -1) {
                currencies.push(pair[1]);
            }
        }

        for (var i = 0; i < currencies.length; i++) {
            var nodeName = site + "-" + currencies[i];
            nodes[nodeName] = [];
        }
    }

    // Create links
    for (var node1 in nodes) {
        for (var node2 in nodes) {
            if (node1 === node2) {
                continue;
            }
            
            // Link node1 -> node2
            var site1 = node1.split("-")[0];
            var curr1 = node1.split("-")[1];
            var site2 = node2.split("-")[0];
            var curr2 = node2.split("-")[1];

            var link = [0.0, 0.00, 0.0];
            if (site1 === site2) {
                if (curr1 === curr2) {
                    console.assert(false, "Duplicate node");
                }

                if (!SiteExchangesPair(site1, curr1, curr2)) {
                    continue;
                }
                if (fees.Exchange(site1, curr1, curr2) === null) {
                    continue;
                }
                // Exchange links are updated separately, since they
                // depend on the exchange rates.
                // Initialize the link to null for now.
                link = null;
            }
            else if (curr1 === curr2) {
                if (IsFiat(curr1)) {
                    // Only analyze transfer of cryptocurrencies.
                    // Fiat transfer is left for the first and last steps
                    // of the arbitrage process.
                    continue;
                }
                var feeWithdraw1 = fees.Withdraw(site1, curr1);
                var feeDeposit2 = fees.Deposit(site2, curr1);
                if (feeWithdraw1 === null || feeDeposit2 === null) {
                    continue;
                }

                link[0] = (1.0 - feeWithdraw1[0]) * (1.0 - feeDeposit2[0]);
                link[1] = feeWithdraw1[1] * (1.0 - feeDeposit2[0])
                    + feeDeposit2[1];
                link[2] = 60.0 * 60.0; // TODO about an hour for now
                                       // Estimate deposit times here
            }
            else {
                // No can do
                continue;
            }

            if (!links.hasOwnProperty(node1)) {
                links[node1] = {};
            }
            links[node1][node2] = link;
        }
    }

    // Create and link BofA node
    // TODO this info should probably be in fees.js
    const FEE_BOFA_WIRE = [0.0, 45.00];
    const depositNodes = [
        "Bitstamp-USD",
        "CEX-USD",
        "Kraken-USD"
    ];
    const depositMethod = {
        "Bitstamp": "wire",
        "CEX": "card",
        "Kraken": "wire",
    };
    const withdrawNodes = [
        "Bitstamp-USD",
        "CEX-USD",
        "Kraken-USD"
    ];
    const withdrawMethod = {
        "Bitstamp": "wire",
        "CEX": "card",
        "Kraken": "wire"
    };
    nodes["BofA-USD"] = [];
    links["BofA-USD"] = {};
    for (var i = 0; i < depositNodes.length; i++) {
        var site = depositNodes[i].split("-")[0];
        var curr = depositNodes[i].split("-")[1];
        if (!sites[site].enabled) {
            continue;
        }

        var feeWithdraw = [0.0, 0.00];
        if (depositMethod[site] === "wire") {
            feeWithdraw = FEE_BOFA_WIRE;
        }
        var feeDeposit = fees.Deposit(site, curr);

        links["BofA-USD"][depositNodes[i]] = [
            (1.0 - feeWithdraw[0]) * (1.0 - feeDeposit[0]),
            feeWithdraw[1] * (1.0 - feeDeposit[0]),
            60.0 * 60.0 * 24.0 * 7.0 // one week
        ];
    }
    for (var i = 0; i < withdrawNodes.length; i++) {
        var site = withdrawNodes[i].split("-")[0];
        var curr = withdrawNodes[i].split("-")[1];
        if (!sites[site].enabled) {
            continue;
        }

        var feeWithdraw = fees.Withdraw(site, curr);
        // unclear whether there will be deposit fees here
        var feeDeposit = [0.0, 0.00];

        if (!links.hasOwnProperty(withdrawNodes[i])) {
            links[withdrawNodes[i]] = {};
        }
        links[withdrawNodes[i]]["BofA-USD"] = [
            (1.0 - feeWithdraw[0]) * (1.0 - feeDeposit[0]),
            feeWithdraw[1] * (1.0 - feeDeposit[0]),
            60.0 * 60.0 * 24.0 * 7.0 // one week
        ];
    }

    var nNodes = Object.keys(nodes).length;
    var nLinks = 0;
    for (var n1 in links) {
        for (var n2 in links) {
            nLinks++;
        }
    }
    console.log("profits graph created");
    console.log("  nodes: " + nNodes);
    console.log("  links: " + nLinks);

    setInterval(UpdateExchangeLinks, UPDATE_TIME * 1000);

    var lastWritten = Date.now();
    function WriteGraphCallback(err)
    {
        if (err) {
            console.log("Error writing profit graph");
            console.log(err);
            return;
        }

        //console.log("cpp");
        const profitPathsProc = childProcess.spawn(
            PROFIT_PATHS_PROGRAM,
            [
                PROFIT_GRAPH_FILE,
                PROFIT_PATHS_FILE,
                PROFIT_CYCLES_FILE
            ]
        );
        profitPathsProc.stdout.on("data", function(data) {
            process.stdout.write(data.toString());
        });
        profitPathsProc.stderr.on("data", function(data) {
            console.log(data.toString());
        });
        profitPathsProc.on("close", function(code) {
            //console.log("  cpp done");
            if (code !== 0) {
                console.log("profit paths process exited with code " + code);
            }

            fs.readFile(PROFIT_CYCLES_FILE, function(err, data) {
                if (err) {
                    console.log("Error reading profit cycles file: " + err);
                }

                try {
                    profitCycles = JSON.parse(data);
                }
                catch (err) {
                    console.log("Error parsing profit cycles: " + err);
                    return;
                }

                AnalyzeProfitCycles();
                var elapsed = Date.now() - lastWritten;
                lastWritten = Date.now();
                var wait = 0;
                if (elapsed < MIN_WRITE_TIME * 1000.0) {
                    wait = MIN_WRITE_TIME * 1000.0 - elapsed;
                }
                //console.log("elapsed: " + elapsed);
                //console.log("wait: " + wait);
                setTimeout(function() {
                    //console.log("write graph");
                    WriteProfitGraph(PROFIT_GRAPH_FILE, WriteGraphCallback);
                }, wait);
            });
        });
    }

    WriteProfitGraph(PROFIT_GRAPH_FILE, WriteGraphCallback);

    /*sites["CEX"].module.GetBalance(function(data) {
        var usdBalance = Math.floor(parseFloat(data["USD"]));
        var xrpPrice = 2.20;
        console.log(usdBalance);
        console.log(xrpPrice);
        console.log(usdBalance / xrpPrice);
        sites["CEX"].module.PlaceOrder("XRP-USD", "buy",
            usdBalance / xrpPrice, xrpPrice, function(data) {
                console.log(data);
            }
        );
    });*/
}

exports.Start = Start;
exports.GetMaxProfitPaths = GetMaxProfitPaths;