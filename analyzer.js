const UPDATE_TIME = 1; // seconds

var sites = {};
var pairs = [];
var sitePairs = [];

var buyMatrix = {};
var sellMatrix = {};

var fracProfit = {};
var flatProfit = {};

// Return a list, sorted by fracProfit. An entry looks like this:
// [
//     fracProfit, flatProfit,
//     currencyPair
//     siteBuy, siteBuyPrice,
//     siteSell, siteSellPrice
// ]
function ProfitsPastThreshold(thresholdFrac)
{
    var pastThreshold = [];
    for (var i = 0; i < pairs.length; i++) {
        for (var j = 0; j < sitePairs.length; j++) {
            var fracProf = fracProfit[pairs[i]][sitePairs[j]];
            if (fracProf >= thresholdFrac) {
                var sitesSplit = sitePairs[j].split("->");

                var entry = [
                    fracProf, flatProfit[pairs[i]][sitePairs[j]],
                    pairs[i],
                    sitesSplit[0], buyMatrix[pairs[i]][sitesSplit[0]],
                    sitesSplit[1], sellMatrix[pairs[i]][sitesSplit[1]]
                ];
                pastThreshold.push(entry);
            }
        }
    }

    pastThreshold.sort(function(a, b) {
        // Sort descending
        if (a[0] < b[0])        return 1;
        else if (a[0] > b[0])   return -1;
        else                    return 0;
    });

    return pastThreshold;
    //console.log(fracProfit["ETH-USD"]);
    //console.log(flatProfit["ETH-USD"]);

    console.log("Differentials past " + thresholdFrac * 100.0 + "%:");
    for (var i = 0; i < pastThreshold.length; i++) {
        var currencyPair = pairs[pastThreshold[i][0]];
        var sitePair = sitePairs[pastThreshold[i][1]];
        var percentage = fracProfit[currencyPair][sitePair] * 100.0;
        console.log("Trade " + currencyPair + " thru sites " + sitePair);
        console.log("    ( " + percentage.toFixed(4) + " % )");
    }
}

// This function updates buyMatrix, sellMatrix, fracProfit, and flatProfit
function Analyze()
{
    for (var site in sites) {
        if (!sites[site].enabled) {
            continue;
        }

        for (var pair in sites[site].module.data) {
            // Use minAsk & maxBid for buy & sell prices, respectively
            // Might want to change this, take volume into account
            var pairData = sites[site].module.data[pair];
            if (pairData.asks.length() > 0) {
                var minAskEntry = pairData.asks.entryByIndex(0);
                minAskEntry = sites[site].entryParser(minAskEntry);
                buyMatrix[pair][site] = parseFloat(minAskEntry[0]);
            }
            else {
                buyMatrix[pair][site] = null;
            }
            if (pairData.bids.length() > 0) {
                var maxBidEntry = pairData.bids.entryByIndex(pairData.bids.length() - 1);
                maxBidEntry = sites[site].entryParser(maxBidEntry);
                sellMatrix[pair][site] = parseFloat(maxBidEntry[0]);
            }
            else {
                sellMatrix[pair][site] = null;
            }
        }
    }

    for (var i = 0; i < pairs.length; i++) {
        // For each currency pair
        var pairBuy = buyMatrix[pairs[i]];
        var pairSell = sellMatrix[pairs[i]];
        for (var j = 0; j < sitePairs.length; j++) {
            // For each site pair
            var sitePair = sitePairs[j].split("->");
            // What we care about is BUYING from site1, SELLING on site2
            // Is there a profit there? How much?
            var pairBuy1 = pairBuy[sitePair[0]];
            var pairSell2 = pairSell[sitePair[1]];
            if (pairBuy1 === null || pairSell2 === null) {
                continue;
            }
            fracProfit[pairs[i]][sitePairs[j]] = (pairSell2 - pairBuy1) / pairBuy1;
            flatProfit[pairs[i]][sitePairs[j]] = pairSell2 - pairBuy1;
        }
    }
}

function Start(sitesIn, pairsIn)
{
    sites = sitesIn;
    pairs = pairsIn;

    // Initialize matrices to null to detect unavailable data
    for (var i = 0; i < pairs.length; i++) {
        buyMatrix[pairs[i]] = {};
        sellMatrix[pairs[i]] = {};
        for (var site in sites) {
            buyMatrix[pairs[i]][site] = null;
            sellMatrix[pairs[i]][site] = null;
        }
    }
    
    for (var site1 in sites) {
        for (var site2 in sites) {
            if (site1 === site2) {
                continue;
            }
            sitePairs.push(site1 + "->" + site2);
        }
    }
    
    for (var i = 0; i < pairs.length; i++) {
        fracProfit[pairs[i]] = {};
        flatProfit[pairs[i]] = {};
        for (var j = 0; j < sitePairs.length; j++) {
            fracProfit[pairs[i]][sitePairs[j]] = null;
            flatProfit[pairs[i]][sitePairs[j]] = null;
        }
    }

    setInterval(Analyze, UPDATE_TIME * 1000);
}

exports.Start = Start;
exports.fracProfit = fracProfit;
exports.flatProfit = flatProfit;
exports.PastThreshold = ProfitsPastThreshold;