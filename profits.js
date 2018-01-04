const UPDATE_TIME = 1; // seconds

const fees = require("./sites/fees");

// See server.js "sites" variable
var sites = {};

var nodes = {};
var links = {};

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
        return sites[site].module.data[pair].bids.entryByIndex(lenBids - 1);
    }
    else {
        pair = curr2 + "-" + curr1;
        return sites[site].module.data[pair].asks.entryByIndex(0);
    }
}

function GetMaxBid(site, curr1, curr2)
{
    var pair = CurrenciesToPair(site, curr1, curr2);
    var lenBids = sites[site].module.data.bids.length();
    return sites[site].module.data.bids.entryByIndex(lenBids - 1);
}

function UpdateExchangeLinks()
{
    for (var node1 in nodes) {
        for (var node2 in nodes) {
            if (node1 === node2) {
                continue;
            }
            
            // Link node1 -> node2
            var site = node1.split("-")[0];
            var curr1 = node1.split("-")[1];
            var curr2 = node2.split("-")[1];

            if (site !== node2.split("-")[0]) {
                continue;
            }
            if (sites[site].module.data.asks.length() === 0
            || sites[site].module.data.bids.length() === 0) {
                continue;
            }

            var link = [0.0, 0.00, 0.0];
            var feeExchange = fees.Exchange(site, curr1, curr2);

            link[0] = feeExchange[0];
            link[1] = feeExchange[1];

            links[node1][node2] = link;
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

                link[0] = feeWithdraw1[0] * feeDeposit2[0];
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

    //console.log(links);
}

exports.Start = Start;