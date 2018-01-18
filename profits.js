const UPDATE_TIME = 0.2;
const MIN_WRITE_TIME = 0.5;
const PROFIT_PATHS_PROGRAM = "build/profit_paths";
const PROFIT_GRAPH_FILE = "temp/profit-graph.data";
const PROFIT_PATHS_FILE = "temp/profit-paths.json";
const PROFIT_CYCLES_FILE = "temp/profit-cycles.json";

const cycleLog = require("./logger").cycle;
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
    // From server.js
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

    return currencies.hasOwnProperty(currency);
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

function GetExchangeRate(site, curr1, curr2, depth = 0)
{
    var pair = curr1 + "-" + curr2;
    if (sites[site].module.data.hasOwnProperty(pair)) {
        var lenBids = sites[site].module.data[pair].bids.length();
        return sites[site].module.data[pair].bids
            .entryByIndex(lenBids - 1 - depth)[0];
    }
    else {
        pair = curr2 + "-" + curr1;
        return 1.0 / sites[site].module.data[pair].asks.entryByIndex(depth)[0];
    }
}

// Taking into account the entire market depth, how much
// of curr2 will I get if I put in "invest" amount of curr1?
function GetTradeAmount(site, curr1, curr2, invest)
{
    /*console.log("GetTradeAmount, site " + site + ", "
        + curr1 + "-" + curr2 + ", invest " + invest);*/
    var pair = curr1 + "-" + curr2;
    var isBid;
    var startIdx;
    if (sites[site].module.data.hasOwnProperty(pair)) {
        isBid = true;
        startIdx = sites[site].module.data[pair].bids.length() - 1;
    }
    else {
        pair = curr2 + "-" + curr1;
        isBid = false;
        startIdx = 0;
    }

    var output = 0.0;
    var depth = 0;
    while (true) {
        //console.log("depth " + depth);
        var exchangeRate = GetExchangeRate(site, curr1, curr2, depth);
        var feeExchange = fees.Exchange(site, curr1, curr2);
        var link = [
            exchangeRate * (1.0 - feeExchange[0]),
            feeExchange[1],
            0.0
        ];
        //console.log("link: " + link);

        // Amount of first currency in "pair" that is available to trade
        // at the previous exchange rate / link rate
        var available;
        if (isBid) {
            if (depth >= sites[site].module.data[pair].bids.length()) {
                return null;
            }
            available = sites[site].module.data[pair].bids
                .entryByIndex(startIdx - depth)[1][0];
        }
        else {
            if (depth >= sites[site].module.data[pair].asks.length()) {
                return null;
            }
            available = sites[site].module.data[pair].asks
                .entryByIndex(startIdx + depth)[1][0];
        }
        //console.log("available: " + available);

        // Get the amount for comparison with "invest"
        var compare;
        if (isBid) {
            compare = available;
        }
        else {
            compare = (available + link[1]) / link[0];
        }

        //console.log("compare: " + compare);
        if (compare > invest) {
            output += invest * link[0] - link[1];
            //console.log("done!");
            break;
        }
        else {
            output += compare * link[0] - link[1];
            invest -= compare;
            //console.log("not done\ninvest: " + invest + ", output: " + output);
        }

        depth++;
    }

    return output;
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

function AddProfits(p1, p2)
{
    return [
        p1[0] * p2[0],
        p1[1] * p2[0] + p2[1],
        p1[2] + p2[2]
    ]
}

function CalcPathProfit(path)
{
    var profit = [1.0, 0.00, 0.0];
    for (var i = 1; i < path.length; i++) {
        profit = AddProfits(profit, links[path[i-1]][path[i]]);
    }

    return profit;
}

function CalcCycleProfit(cycle)
{
    var profit = CalcPathProfit(cycle);
    return AddProfits(profit, links[cycle[cycle.length-1]][cycle[0]]);
}

function SimulateCycle(cycle, invest)
{
    var site = cycle[0].split("-")[0];
    var output = invest;
    for (var i = 0; i < cycle.length; i++) {
        var curr1 = cycle[i].split("-")[1];
        var curr2 = cycle[(i+1) % cycle.length].split("-")[1];
        output = GetTradeAmount(site, curr1, curr2, output);
        if (output === null) {
            console.log("WARNING: simulation failed, possibly missing data");
            return null;
        }
    }

    return output;
}

// TODO ?!@?!?
var balance = {
    // this gets updated at start
};
const USD_MIN_INVEST = 30.00;

function TrimFloat(float, characters)
{
    var str = float.toString();
    var chars = Math.min(characters, str.length);
    return parseFloat(str.substring(0, chars));
}

// WARNING dangerous function, can execute trades!
function Trade(site, curr1, curr2, curr1Amount, callback)
{
    var pair = [curr1, curr2];
    var action = "sell";
    if (!sites[site].module.data.hasOwnProperty(curr1 + "-" + curr2)) {
        pair = [curr2, curr1];
        action = "buy";
    }
    var exchangeFee = fees.Exchange(site, curr1, curr2);

    sites[site].module.GetPrices(pair, function(prices) {
        var relevantPrices = prices.bids;
        if (action === "buy") {
            relevantPrices = prices.asks;
        }

        var price = relevantPrices[0][0];
        var amount = curr1Amount;
        if (action === "buy") {
            amount = curr1Amount / price / (1.0 + exchangeFee[0]);
            amount = TrimFloat(amount, 8);
        }

        //cycleLog.info(prices);
        cycleLog.info("-> " + action + " " + amount + " "
            + pair[0] + "-" + pair[1] + " for " + price);

        // TEST
        sites[site].module.GetBalance(function(ignore) {
            // dummy API call for rate limit and stuff
            cycleLog.info("Order executed (DUMMY)!!")
            sites[site].module.GetBalance(function(ignoreThisBalance) {
                // GetBalance dummy API call. ignore the result
                var newBalance = JSON.parse(JSON.stringify(balance[site]));
                if (action === "buy") {
                    newBalance[curr1] = parseFloat(newBalance[curr1])
                        - amount * price * (1.0 - exchangeFee[0]);
                    newBalance[curr2] = parseFloat(newBalance[curr2]) + amount;
                }
                else {
                    newBalance[curr1] = parseFloat(newBalance[curr1]) - amount;
                    newBalance[curr2] = parseFloat(newBalance[curr2])
                        + amount * price;
                }
                var curr2Delta = parseFloat(newBalance[curr2])
                    - parseFloat(balance[site][curr2]);
                balance[site] = newBalance
                cycleLog.info(balance[site]);
                cycleLog.info("made " + curr2Delta + " " + curr2);
                callback(curr2Delta);
            });
        })
        /*sites[site].module.PlaceOrder(pair, action, price, amount,
            function(price, amount, err) {
                if (err) {
                    cycleLog.info(err);
                    return;
                }

                cycleLog.info("Order executed!!");
                cycleLog.info(amount + " " + pair.toString() + " for " + price);
                sites[site].module.GetBalance(function(newBalance) {
                    var curr2Delta = parseFloat(newBalance[curr2])
                        - parseFloat(balance[site][curr2]);
                    balance[site] = newBalance;
                    cycleLog.info("made " + curr2Delta + " " + curr2);
                    callback(curr2Delta);
                });
            }
        );*/
    });
}

function TradeCycleRecursive(site, cycle, invest, i, callback)
{
    if (i >= cycle.length) {
        callback();
        return;
    }

    Trade(site, cycle[i].split("-")[1],
        cycle[(i+1) % cycle.length].split("-")[1], invest, function(output) {
            TradeCycleRecursive(site, cycle, output, i + 1, callback);
        }
    );
}

var executingCycle = false;
function ExecuteCycle(cycle, invest, callback)
{
    if (executingCycle) {
        return;
    }
    executingCycle = true;
    cycleLog.info("Executing cycle with investment " + invest);

    var site = cycle[0].split("-")[0];
    TradeCycleRecursive(site, cycle, invest, 0, function() {
        executingCycle = false;
        callback();
    });
}

function ShiftCycleToStartCurrency(cycle, currency)
{
    var start = -1;
    for (var i = 0; i < cycle.length; i++) {
        if (cycle[i].split("-")[1] === currency) {
            start = i;
            break;
        }
    }
    if (start === -1) {
        return null;
    }

    var shifted = [];
    for (var i = 0; i < cycle.length; i++) {
        var ind = (i + start) % cycle.length;
        shifted.push(cycle[ind]);
    }

    return shifted;
}

function CalcTradeDepthBudget(site, curr1, curr2, depth)
{
    /*console.log("CalcTradeDepthBudget, site " + site + ", "
        + curr1 + "-" + curr2 + ", depth " + depth);*/
    var pair = curr1 + "-" + curr2;
    var isBid;
    var startIdx;
    if (sites[site].module.data.hasOwnProperty(pair)) {
        isBid = true;
        startIdx = sites[site].module.data[pair].bids.length() - 1;
    }
    else {
        pair = curr2 + "-" + curr1;
        isBid = false;
        startIdx = 0;
    }

    var mdEntry;
    if (isBid) {
        if (depth >= sites[site].module.data[pair].bids.length()) {
            return null;
        }
        mdEntry = sites[site].module.data[pair].bids
            .entryByIndex(startIdx - depth);
    }
    else {
        if (depth >= sites[site].module.data[pair].asks.length()) {
            return null;
        }
        mdEntry = sites[site].module.data[pair].asks
            .entryByIndex(startIdx + depth);
    }
    //console.log("mdEntry: " + mdEntry);

    var budget;
    if (isBid) {
        budget = mdEntry[1][0];
    }
    else {
        budget = mdEntry[1][0] * mdEntry[0];
    }

    if (depth === 0) {
        return budget;
    }
    else {
        var prevBudget = CalcTradeDepthBudget(site, curr1, curr2, depth - 1);
        if (prevBudget === null) {
            return null;
        }
        return budget + prevBudget;
    }
}

function CalcCycleDepthBudget(cycle, depth)
{
    var site = cycle[0].split("-")[0];
    var link = [ 1.00, 0.00, 0.0 ];
    var depthBudget = Number.POSITIVE_INFINITY;
    for (var i = 0; i < cycle.length; i++) {
        var curr1 = cycle[i].split("-")[1];
        var curr2 = cycle[(i+1) % cycle.length].split("-")[1];
        var budget = CalcTradeDepthBudget(site, curr1, curr2, depth);
        if (budget === null) {
            console.log("WARNING: depth budget failed, possibly missing data");
            return null;
        }
        budget = (budget + link[1]) / link[0];
        link = AddProfits(link, links[cycle[i]][cycle[(i+1) % cycle.length]]);
        //console.log(curr1 + "-" + curr2 + " budget: " + budget);
        if (budget < depthBudget) {
            depthBudget = budget;
        }
    }

    return depthBudget;
}

function GetCycleMinTrade(cycle)
{
    var site = cycle[0].split("-")[0];
    var link = [ 1.00, 0.00, 0.0 ];
    var cycleMinTrade = 0.0;
    for (var i = 0; i < cycle.length; i++) {
        var curr1 = cycle[i].split("-")[1];
        var curr2 = cycle[(i+1) % cycle.length].split("-")[1];
        var pair = [curr1, curr2];
        if (!sites[site].module.data.hasOwnProperty(pair.join("-"))) {
            pair = [curr2, curr1];
        }
        var minTrade = fees.MinTrade(site, pair[0], pair[1]);
        if (minTrade === null) {
            console.log("WARNING: " + site
                + " missing minTrade for " + pair.join("-"));
            return null;
        }
        if (pair[minTrade[1]] === curr1) {
            minTrade[0] = (minTrade[0] + link[1]) / link[0];
        }
        link = AddProfits(link, links[cycle[i]][cycle[(i+1) % cycle.length]]);
        if (pair[minTrade[1]] === curr2) {
            minTrade[0] = (minTrade[0] + link[1]) / link[0];
        }
        if (minTrade[0] > cycleMinTrade) {
            cycleMinTrade = minTrade[0];
        }
    }

    return cycleMinTrade;
}

function HandleInstantCycles(cycles)
{
    var maxMinTradeProfit = 0.0;
    var maxMinTradeOut = 0.0;
    var maxMinTrade = 0.0;
    var maxCycle = null;
    for (var i = 0; i < cycles.length; i++) {
        cycleLog.verbose("===> Cycle " + i);
        cycleLog.verbose(cycles[i]);
        var cycle = cycles[i];
        var cycle = ShiftCycleToStartCurrency(cycles[i], "USD");
        if (cycle === null) {
            cycleLog.verbose("=> Instant cycle without USD");
            continue;
        }
        cycleLog.verbose(cycle);
        cycleLog.verbose("=> Theoretical output: "
            + (100.0 * CalcCycleProfit(cycle)[0]).toFixed(4) + " %");

        var minTrade = GetCycleMinTrade(cycle);
        if (minTrade === null) {
            cycleLog.verbose("=> Minimum trade failed");
            continue;
        }
        else {
            minTrade = Math.ceil(minTrade);
            cycleLog.verbose("=> Minimum trade (ceil): "
                + minTrade.toFixed(2) + " USD");
            var minTradeOut = SimulateCycle(cycle, minTrade);
            if (minTradeOut === null) {
                cycleLog.verbose("=> Minimum trade simulation failed");
                continue;
            }
            else {
                var minTradeProfit = minTradeOut / minTrade;
                cycleLog.verbose("   Minimum trade output: "
                    + minTradeOut.toFixed(2) + " USD ("
                    + (100.0 * minTradeProfit).toFixed(4) + "%)");
                
                // Profit is not possible from this cycle
                if (minTradeProfit > 1.0) {
                    maxMinTradeProfit = minTradeProfit;
                    maxMinTradeOut = minTradeOut;
                    maxMinTrade = minTrade;
                    maxCycle = cycle;
                    // TODO temporary
                    continue;
                }
                else {
                    if (cycle[0].split("-")[0] === "CEX") {
                    maxMinTradeProfit = minTradeProfit;
                    maxMinTradeOut = minTradeOut;
                    maxMinTrade = minTrade;
                    maxCycle = cycle;
                    }
                    continue;
                }
            }
        }

        // Depth viability analysis
        var maxDepthBudget0 = CalcCycleDepthBudget(cycle, 0);
        var sim0 = SimulateCycle(cycle, maxDepthBudget0);
        var maxDepthBudget1 = CalcCycleDepthBudget(cycle, 1);
        var sim1 = SimulateCycle(cycle, maxDepthBudget1);
        if (maxDepthBudget0 !== null && sim0 !== null) {
            cycleLog.verbose("=> 0-depth budget: "
                + maxDepthBudget0.toFixed(2) + " USD");
            cycleLog.verbose("   0-depth output: " + sim0.toFixed(2) + " USD ("
                + (100.0 * sim0 / maxDepthBudget0).toFixed(4) + " %)");
        }
        else {
            cycleLog.verbose("=> 0-depth budget calculation failed");
        }
        if (maxDepthBudget1 !== null && sim1 !== null) {
            cycleLog.verbose("=> 1-depth budget: "
                + maxDepthBudget1.toFixed(2) + " USD");
            cycleLog.verbose("   1-depth output: " + sim1.toFixed(2) + " USD ("
                + (100.0 * sim1 / maxDepthBudget1).toFixed(4) + " %)");
        }
        else {
            cycleLog.verbose("=> 1-depth budget calculation failed");
        }
    }

    if (!executingCycle && maxMinTradeProfit > 1.0) {
    //if (!executingCycle && maxCycle !== null) {
        // Check that we're making actual money
        // (probably make this higher later)
        var site = maxCycle[0].split("-")[0];
        //if (site === "CEX") {
        if (site === "CEX" && maxMinTradeOut - maxMinTrade >= 0.01) {
            cycleLog.info("========== LEGIT CYCLE ==========");
            cycleLog.info(maxCycle);
            cycleLog.info("minTrade (ceil): " + maxMinTrade    + " USD");
            cycleLog.info("minTradeOut:     " + maxMinTradeOut + " USD"
                + " ( " + (100.0 * maxMinTradeProfit).toFixed(4) + " % )");
            ExecuteCycle(maxCycle, maxMinTrade, function() {
                cycleLog.info("DONE! With " + site + " balance:");
                cycleLog.info(balance);
            });
        }
    }
}

function AnalyzeProfitCycles()
{
    var instantCycles = [];
    for (var i = 0; i < profitCycles.length; i++) {
        if (profitCycles[i][0][2] === 0.0) {
            var profit = CalcCycleProfit(profitCycles[i][1]);
            if (profit[0] > 1.0 && profit[2] === 0.0) {
                instantCycles.push(profitCycles[i][1]);
            }
        }
    }

    /*{ // TEST
        if (links["CEX-XRP"]["CEX-EUR"] !== null) {
            var cycle;
            var profit;

            cycle = ["CEX-XRP", "CEX-EUR", "CEX-ZEC", "CEX-USD"];
            profit = CalcCycleProfit(cycle);
            instantCycles.push(cycle);
            cycle = ["CEX-EUR", "CEX-ETH", "CEX-BTC", "CEX-USD", "CEX-BTG"];
            profit = CalcCycleProfit(cycle);
            instantCycles.push(cycle);
            cycle = ["Bitstamp-LTC", "Bitstamp-USD", "Bitstamp-BTC"];
            profit = CalcCycleProfit(cycle);
            instantCycles.push(cycle);
            cycle = ["Bitstamp-LTC", "Bitstamp-USD", "Bitstamp-BTC", "Bitstamp-EUR"];
            profit = CalcCycleProfit(cycle);
            instantCycles.push(cycle);
            //if (instantCycles.length === 1) {
            //    instantCycles.push(
            //        ['CEX-BTC', 'CEX-XRP', 'CEX-EUR', 'CEX-BCH']);
            //}
        }
    }*/
    if (instantCycles.length > 0) {
        var date = new Date(Date.now());
        var oldLog = console.log;
        console.log = cycleLog.verbose;

        cycleLog.verbose("");
        cycleLog.verbose(instantCycles.length + " instant cycle(s) detected");
        HandleInstantCycles(instantCycles);

        console.log = oldLog;
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
        if (site === "CEX" && depositMethod[site] === "card") {
            feeWithdraw = [3.00 / 100.0, 10.00]; // Tested
        }
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

    sites["CEX"].module.GetBalance(function(b) {
        balance["CEX"] = b;
    });
}

exports.Start = Start;
exports.GetMaxProfitPaths = GetMaxProfitPaths;