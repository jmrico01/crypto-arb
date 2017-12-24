const UPDATE_TIME = 1; // seconds

var sites = {};
var pairs = [];
var sitePairs = [];

var buyMatrix = {};
var sellMatrix = {};

var fracProfit = {};
var flatFees = {};
var reliable = {}; // are all fees present?

// Format: [fractionalFee, flatFee]
var fees = {
    "OKCoin": {
        deposit: {
            // NO FIAT DEPOSITS :(
        },
        withdraw: {
            "BTC": [0.0, 0.02],
            "LTC": [0.0, 0.005],
            "ETH": [0.0, 0.01],
            "ETC": [0.0, 0.01],
            "BTH": [0.0, 0.002]
        },
        taker: [0.20 / 100.0, 0.0],
        maker: [0.20 / 100.0, 0.0]
    },
    "CEX": {
        deposit: {
            "USD": [3.5 / 100.0, 0.25]
        },
        withdraw: {
            "USD": [0.0, 3.8],
        },
        taker: [0.25 / 100.0, 0.0],
        maker: [0.16 / 100.0, 0.0]
    },
    "Kraken": {
        deposit: {
            "USD": [0.0, 5.00] // either $5 or $10...
        },
        withdraw: {
            "USD": [0.0, 5.00], // or maybe $50...

            "BTC": [0.0, 0.001],
            "ETH": [0.0, 0.005],
            "XRP": [0.0, 0.02],
            "XLM": [0.0, 0.00002],
            "LTC": [0.0, 0.02],
            "XDG": [0.0, 2.00],
            "ZEC": [0.0, 0.0001],
            "ICN": [0.0, 0.2],
            "REP": [0.0, 0.01],
            "ETC": [0.0, 0.005],
            "MLN": [0.0, 0.003],
            "XMR": [0.0, 0.05],
            "DASH": [0.0, 0.005],
            "GNO": [0.0, 0.01],
            "USDT": [0.0, 5.00],
            "EOS": [0.0, 0.5],
            "BCH": [0.0, 0.001]
        },
        taker: [0.26 / 100.0, 0.0],
        maker: [0.16 / 100.0, 0.0]
    }
}

// Return a list, sorted by fracProfit. An entry looks like this:
// [
//     fracProfit, flatFees,
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
            if (fracProf === null) continue;

            if (fracProf >= thresholdFrac) {
                var sitesSplit = sitePairs[j].split("->");

                var entry = [
                    fracProf, flatFees[pairs[i]][sitePairs[j]],
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
}

// Start with "input" money, what do I get in return?
// Mostly a test function, for now.
function CalcOutput(input, pair, sitePair)
{
    var pairBuy1 = buyMatrix[pair][sitePair[0]];
    var pairSell2 = sellMatrix[pair][sitePair[1]];
    var siteBuy = sitePair[0];
    var siteSell = sitePair[1];
    var crypto = pair.split("-")[0];
    var fiat = pair.split("-")[1];

    var step1 = input * (1.0 - fees[siteBuy].deposit[fiat][0])
        - fees[siteBuy].deposit[fiat][1];
    var step2 = step1 / pairBuy1 * (1.0 - fees[siteBuy].taker[0])
        - fees[siteBuy].taker[1];
    var step3 = step2 * (1.0 - fees[siteBuy].withdraw[crypto][0])
        - fees[siteBuy].withdraw[crypto][1];
    var step4 = step3 * pairSell2 * (1.0 - fees[siteSell].taker[0])
        - fees[siteSell].taker[1];
    var step5 = step4 * (1.0 - fees[siteSell].withdraw[fiat][0])
        - fees[siteSell].withdraw[fiat][1];
    
    return step5;
}

// How much profit, including fees, will we obtain
// if we were to buy the first currency in "pair"
// at sitePair[0], and sell it at sitePair[1]?
// Returns [fractional, flatFees], or null on error
function CalcProfit(pair, sitePair)
{
    // What we care about is BUYING from site1, SELLING on site2
    // Is there a profit there? How much?
    var pairBuy1 = buyMatrix[pair][sitePair[0]];
    var pairSell2 = sellMatrix[pair][sitePair[1]];
    if (pairBuy1 === null || pairSell2 === null) {
        return [null, null];
    }

    var siteBuy = sitePair[0];
    var siteSell = sitePair[1];
    var crypto = pair.split("-")[0];
    var fiat = pair.split("-")[1];
    // Let's calculate the fees. Are you ready?
    //
    // Step 0: Get X amount of money in fiat.
    // Step 1: Deposit X into siteBuy.
    //         End up with Step1 = X * (1 - depFrac[siteBuy][fiat])
    //                             - depFlat[siteBuy][fiat]]
    // Step 2: Buy Step1 worth of crypto.
    //         End up with Step2 = Step1 / pairBuy1
    //                             * (1 - takerFrac[siteBuy]) 
    //                             - takerFlat[siteBuy]
    // Step 3: Transfer Step2 into siteSell.
    //         End up with Step3 = Step2 * (1 - withdraw[siteBuy][crypto])
    //                             - withdraw[siteBuy][crypto]
    // Step 4: Sell Step3 worth of crypto on siteSell.
    //         End up with Step4 = Step3 * pairSell2
    //                             * (1 - takerFrac[siteSell])
    //                             - takerFlat[siteSell]
    // Step 5: Withdraw Step4 from siteSell.
    //         End up with Step5 = Step4 * (1 - withFrac[siteSell][fiat])
    //                             - withFlat[siteSell][fiat]
    //
    // Now you have Step5 in fiat currency.
    // So you made (Step5 - X) / X profit.
    // Step5 will be of the form a*x + b
    //
    // In the end, the coefficient of X will be the ratio
    // pairSell2 / pairBuy1, times all of the fractional fees.

    var fracProf = 1.0;
    var fltFees = 0.0;
    var complete = false;
    if (fees[siteSell].withdraw.hasOwnProperty(fiat)) {
        // Step 5: withdraw
        fltFees += fees[siteSell].withdraw[fiat][1];
        var step5Frac = 1.0 - fees[siteSell].withdraw[fiat][0];
        fracProf *= step5Frac;

        // Step 4: sell
        fltFees += fees[siteSell].taker[1] * step5Frac;
        var step4Frac = pairSell2 * (1.0 - fees[siteSell].taker[0]);
        fracProf *= step4Frac;

        if (fees[siteBuy].withdraw.hasOwnProperty(crypto)) {
            // Step 3: transfer
            fltFees += fees[siteBuy].withdraw[crypto][1]
                * step4Frac * step5Frac;
            var step3Frac = 1.0 - fees[siteBuy].withdraw[crypto][0];
            fracProf *= step3Frac;

            // Step 2: buy
            fltFees += fees[siteBuy].taker[1]
                * step5Frac * step4Frac * step3Frac;
            var step2Frac = (1.0 / pairBuy1) * (1.0 - fees[siteBuy].taker[0]);
            fracProf *= step2Frac;

            if (fees[siteBuy].deposit.hasOwnProperty(fiat)) {
                // Step 1: deposit
                fltFees += fees[siteBuy].deposit[fiat][1]
                    * step5Frac * step4Frac * step3Frac * step2Frac;
                var step1Frac = (1.0 - fees[siteBuy].deposit[fiat][0]);
                fracProf *= step1Frac;

                complete = true;
            }
        }
    }
    fracProf -= 1.0;
    
    if (!complete) return [null, null];

    // test
    /*var inputs = [100.0, 1000.0, 10000.0];
    console.log(pair + " and " + sitePair + ":");
    for (var i = 0; i < inputs.length; i++) {
        var out1 = CalcOutput(inputs[i], pair, sitePair);
        var out2 = inputs[i] * (1.0 + fracProf) - fltFees;

        console.log(out1.toFixed(4) + " vs. " + out2.toFixed(4));
    }*/
    // PASSES THE TESTS! WOOHOO!!!

    return [fracProf, fltFees];
}

// This function updates buyMatrix, sellMatrix, fracProfit, and flatFees.
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
        for (var j = 0; j < sitePairs.length; j++) {
            var profit = CalcProfit(pairs[i], sitePairs[j].split("->"));

            // profit can be [null, null], which is good
            fracProfit[pairs[i]][sitePairs[j]] = profit[0];
            flatFees[pairs[i]][sitePairs[j]] = profit[1];
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
        flatFees[pairs[i]] = {};
        for (var j = 0; j < sitePairs.length; j++) {
            fracProfit[pairs[i]][sitePairs[j]] = null;
            flatFees[pairs[i]][sitePairs[j]] = null;
        }
    }

    setInterval(Analyze, UPDATE_TIME * 1000);
}

exports.Start = Start;
exports.PastThreshold = ProfitsPastThreshold;