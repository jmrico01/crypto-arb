const UPDATE_TIME = 2.0; // seconds

const fees = require("./sites/fees");
const ordHash = require("./ordered-hash")
const Queue = require("./queue");
const paths = require("./build/Release/addon");

// See server.js "sites" variable
var sites = {};

var nodes = {};
var links = {};

var profitPaths = ordHash.Create(function(profit1, profit2) {
    if (profit1[0] > profit2[0]) return -1;
    else if (profit1[0] < profit2[0]) return 1;
    else return 0;
});

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

function CompareLinkProfit(p1, p2)
{
    if (p1[0] < p2[0]) return -1;
    else if (p1[0] > p2[0]) return 1;
    else return 0;

    if (p1[0] <= 1.0) {
        if (p2[0] <= 1.0) {
            if (p1[0] < p2[0]) return -1;
            else if (p1[0] > p2[0]) return 1;
            else return 0;
        }

        return -1;
    }
    else if (p2[0] <= 1.0) {
        return 1;
    }
    
    var breakEven1 = p1[1] / (p1[0] - 1.0);
    var breakEven2 = p2[1] / (p2[0] - 1.0);
    if (breakEven1 > breakEven2) return -1;
    else if (breakEven1 < breakEven2) return 1;
    else return 0;
}

function AddLinkProfit(p1, p2)
{
    return [
        p1[0] * p2[0],
        p1[1] * p2[0] + p2[1],
        p1[2] + p2[2]
    ];
}

function MaxProfitPath(investment)
{
    //var profit = {};
    var output = {};
    var prev = {};

    for (var node in nodes) {
        //profit[node] = [0.0, 0.00, 0.0];
        output[node] = Number.NEGATIVE_INFINITY;
        prev[node] = null;
    }
    //profit["start"] = [1.0, 0.00, 0.0];
    output["start"] = investment;

    var numNodes = Object.keys(nodes).length;
    for (var i = 1; i < numNodes; i++) {
        for (var node1 in links) {
            for (var node2 in links[node1]) {
                if (links[node1][node2] === null) {
                    // Exchange rates haven't been initialized
                    continue;
                }

                /*var newProfit = AddLinkProfit(profit[node1],
                    links[node1][node2]);
                if (CompareLinkProfit(newProfit, profit[node2]) > 0) {*/
                var link = links[node1][node2];
                var newOutput = output[node1] * link[0] - link[1];
                if (newOutput > output[node2]) {
                    //profit[node2] = newProfit;
                    output[node2] = newOutput;
                    prev[node2] = node1;
                }
            }
        }
        //console.log(profit);
        //console.log(output);
    }

    for (var node1 in links) {
        for (var node2 in links[node1]) {
            if (links[node1][node2] === null) {
                // Exchange rates haven't been initialized
                continue;
            }

            /*var newProfit = AddLinkProfit(profit[node1],
                links[node1][node2]);
            if (CompareLinkProfit(newProfit, profit[node2]) > 0) {*/
            var link = links[node1][node2];
            var newOutput = output[node1] * link[0] - link[1];
            if (newOutput > output[node2]) {
                console.log("Increasing profit cycle");
            }
        }
    }

    /*var path = [];
    current = "end";
    while (prev[current] !== null) {
        //console.log(current);
        path.unshift(current);
        current = prev[current];
    }
    path.unshift("start");*/

    //console.log(path);

    console.log(output);
}

function CalcPathProfit(path)
{
    if (path.length < 2) {
        return null;
    }
    if (path[0] !== "start" || path[path.length - 1] !== "end") {
        return null;
    }

    var profit = [1.0, 0.00, 0.0];
    for (var i = 1; i < path.length; i++) {
        profit = AddLinkProfit(profit, links[path[i-1]][path[i]]);
    }

    return profit;
}

function CalcMaxProfitPaths()
{
    var depthMarker = "!DEPTH!";
    var maxDepth = Object.keys(nodes).length - 1;
    //var maxDepth = Math.floor(Object.keys(nodes).length / 2);
    console.log("max depth: " + maxDepth);

    var paths = [ ["start"] ];
    var freeID = null;

    var toVisit = new Queue();
    var nodeInfo = new Queue();
    var depth = 0;

    //debug timing
    var time1 = 0.0;
    var time5 = 0.0;
    var time2 = 0.0;
    var time4 = 0.0;
    var time3 = 0.0;

    toVisit.Enqueue("start");
    nodeInfo.Enqueue({ pathID: 0 });
    toVisit.Enqueue(depthMarker);
    while (depth < maxDepth) {
        var t1 = Date.now();
        var node = toVisit.Dequeue();
        if (node === depthMarker) {
            depth++;
            toVisit.Enqueue(depthMarker);
            if (depth % 5 === 0) {
                console.log("===== depth: " + depth + " =====");
            }
            continue;
        }
        var info = nodeInfo.Dequeue();
        time1 += Date.now() - t1;

        var t5 = Date.now();
        if (node === "end") {
            var profit = CalcPathProfit(paths[info.pathID]);
            profitPaths.insert(profit, paths[info.pathID]);
            continue;
        }
        time5 += Date.now() - t5;

        for (var neighbor in links[node]) {
            var t2 = Date.now();
            if (neighbor === null || links[node][neighbor] === null) {
                continue;
            }
            if (paths[info.pathID].indexOf(neighbor) !== -1) {
                // Node already in path, will create a cycle.
                continue;
            }
            time2 += Date.now() - t2;

            var t4 = Date.now();
            var nodePath = paths[info.pathID];
            var newPath = new Array(nodePath.length);
            for (var i = 0; i < nodePath.length; i++) {
                newPath[i] = nodePath[i];
            }
            newPath.push(neighbor);
            time4 += Date.now() - t4;

            var t3 = Date.now();
            var pathID = freeID;
            if (pathID === null) {
                pathID = paths.length;
                paths.push(newPath);
            }
            else {
                paths[pathID] = newPath;
                freeID = null;
            }

            toVisit.Enqueue(neighbor);
            nodeInfo.Enqueue({ pathID: pathID });
            time3 += Date.now() - t3;
        }
        paths[info.pathID] = null;
        freeID = info.pathID;
    }

    console.log("Timing: ");
    console.log(time1 / 1000.0);
    console.log(time5 / 1000.0);
    console.log(time2 / 1000.0);
    console.log(time4 / 1000.0);
    console.log(time3 / 1000.0);
}

function GetMaxProfitPaths(numPaths)
{
    var paths = [];
    var k = Math.min(numPaths, profitPaths.length());
    for (var i = 0; i < k; i++) {
        paths.push(profitPaths.entryByIndex(i));
    }
    return paths;
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
                0.1
            ];
        }
    }

    CalcMaxProfitPaths();
    //console.log(paths.hello());
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
                link[2] = 1.0; // ...
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

    // Create and link start and end nodes
    // TODO this info should probably be in fees.js
    const FEE_BOFA_WIRE = [0.0, 45.00];
    const depositNodes = [
        "CEX-USD",
        "Kraken-USD"
    ];
    const depositMethod = {
        "CEX": "card",
        "Kraken": "wire"
    };
    const withdrawNodes = [
        "CEX-USD",
        "Kraken-USD"
    ];
    const withdrawMethod = {
        "CEX": "card",
        "Kraken": "wire"
    };
    nodes["start"] = [];
    links["start"] = {};
    for (var i = 0; i < depositNodes.length; i++) {
        var site = depositNodes[i].split("-")[0];
        var curr = depositNodes[i].split("-")[1];

        var feeWithdraw = [0.0, 0.00];
        if (depositMethod[site] === "wire") {
            feeWithdraw = FEE_BOFA_WIRE;
        }
        var feeDeposit = fees.Deposit(site, curr);

        links["start"][depositNodes[i]] = [
            (1.0 - feeWithdraw[0]) * (1.0 - feeDeposit[0]),
            feeWithdraw[1] * (1.0 - feeDeposit[0]),
            10.0
        ];
    }
    nodes["end"] = [];
    for (var i = 0; i < withdrawNodes.length; i++) {
        var site = withdrawNodes[i].split("-")[0];
        var curr = withdrawNodes[i].split("-")[1];

        var feeWithdraw = fees.Withdraw(site, curr);
        // unclear whether there will be deposit fees here
        var feeDeposit = [0.0, 0.00];

        if (!links.hasOwnProperty(withdrawNodes[i])) {
            links[withdrawNodes[i]] = {};
        }
        links[withdrawNodes[i]]["end"] = [
            (1.0 - feeWithdraw[0]) * (1.0 - feeDeposit[0]),
            feeWithdraw[1] * (1.0 - feeDeposit[0]),
            10.0
        ];
    }

    var nNodes = Object.keys(nodes).length;
    var nEdges = 0;
    for (var n1 in links) {
        for (var n2 in links) {
            nEdges++;
        }
    }
    console.log("profits.js graph created");
    console.log("Nodes: " + nNodes);
    console.log("Edges: " + nEdges);

    setInterval(UpdateExchangeLinks, UPDATE_TIME * 1000);
}

exports.Start = Start;
exports.GetMaxProfitPaths = GetMaxProfitPaths;