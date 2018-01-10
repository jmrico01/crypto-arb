const N_PROFITS = 9;
const PROFIT_THRESHOLD = 0.0;

const NUM_PATHS = 5;
const NUM_CYCLES = 5;

var fetchDataInterval = null;
var site = null;
var pair = null;
var testInput = 1000.00;

// Entry format (from analyzer.js):
// [
//     fracProfit, flatFee,
//     currencyPair
//     siteBuy, siteBuyPrice,
//     siteSell, siteSellPrice
// ]
function ProcessProfitData(profits)
{
    var numProfits = Math.min(profits.length, N_PROFITS);
    for (var i = 0; i < numProfits; i++) {
        var $pEntry = $("#profit" + i);
        var profitPerc = profits[i][0] * 100.0;
        var crypto = profits[i][2].split("-")[0];
        $pEntry.find(".profitCrypto").html(crypto);
        $pEntry.find(".profitPerc").html(profitPerc.toFixed(2));
        $pEntry.find(".profitFlatFee").html(profits[i][1].toFixed(2));
        $pEntry.find(".profitSite1").html(profits[i][3]);
        $pEntry.find(".profitSite1Price").html(profits[i][4].toFixed(2));
        $pEntry.find(".profitSite2").html(profits[i][5]);
        $pEntry.find(".profitSite2Price").html(profits[i][6].toFixed(2));

        var testOutput = testInput * (1.0 + profits[i][0]) - profits[i][1];
        var testProfit = (testOutput - testInput) / testInput * 100.0;
        $pEntry.find(".testOutput").html(testOutput.toFixed(2));
        $pEntry.find(".testProfit").html(testProfit.toFixed(2));
    }
    for (var i = numProfits; i < N_PROFITS; i++) {
        var $pEntry = $("#profit" + i);
        $pEntry.find(".profitCrypto").html("???");
        $pEntry.find(".profitPerc").html("X");
        $pEntry.find(".profitFlatFee").html("X");
    }
}

function FetchData()
{
    // Get market depth data.
    $.ajax({
        dataType: "json",
        url: "depth?site=" + site + "&pair=" + pair,
        success: function(depth) {
            //console.log("Retrieved data for " + site + ", " + pair);
            //console.log("asks: " + depth.asks.length + ", bids: " + depth.bids.length);
            $("#site").html(site);
            $("#currencyPair").html(pair);
            ProcessDepthData(depth);
        },
        error: function(req, status, err) {
            console.log("No data for " + site + ", " + pair);
            $("#site").html(site);
            $("#currencyPair").html(pair);
            SetAskBidDisplay(null);
            ClearPlot();
        }
    });

    // Get best profits data.
    $.ajax({
        dataType: "json",
        url: "profits?threshold=" + PROFIT_THRESHOLD.toString(),
        success: function(pastThreshold) {
            ProcessProfitData(pastThreshold);
        },
        error: function(req, status, err) {
            console.log("No profits data");
        }
    })
    
    // Get profit paths
    var order = "order=absolute";
    if (!Number.isNaN(testInput)) {
        order = "order=invest&invest=" + testInput.toString();
    }
    $.ajax({
        dataType: "json",
        url: "profitPaths?k=" + NUM_PATHS.toString() + "&" + order,
        success: function(profitPaths) {
            //console.log(profitPaths);
            ClearProfitPaths("#profitPaths");
            DisplayProfitPaths("#profitPaths", profitPaths);
        },
        error: function(req, status, err) {
            console.log("No profit paths");
        }
    });
    // Get profit cycles
    $.ajax({
        dataType: "json",
        url: "profitCycles?k=" + NUM_CYCLES.toString() + "&" + order,
        success: function(profitCycles) {
            //console.log(profitCycles);
            ClearProfitPaths("#profitCycles");
            DisplayProfitPaths("#profitCycles", profitCycles);
        },
        error: function(req, status, err) {
            console.log("No profit cycles");
        }
    });
}

function SetEnabledCurrencyPairs(pairs)
{
    if (pairs.length === 0) {
        return;
    }

    var initPair = pair;
    if (initPair === null) {
        initPair = "BTC-USD";
    }
    if (pairs.indexOf(initPair) === -1) {
        initPair = pairs[0];
    }

    var $pairButtons = $("#pairButtons");
    $pairButtons.html("");
    for (var i = 0; i < pairs.length; i++) {
        var $new = $("<button class=\"pair\">"
            + pairs[i] + "</button>");
        $pairButtons.append($new);

        if (pairs[i] === initPair) {
            $new.addClass("buttonSelected");
        }
    }
    pair = initPair;

    $(".pair").click(function(event) {
        $(".pair").removeClass("buttonSelected");
        var $target = $(event.target);
        $target.addClass("buttonSelected");
        pair = $target.html();
        console.log("Selected currency pair: " + pair);
        FetchData();
    });
}

function ResetCurrencyPairs(newSite)
{
    $.ajax({
        dataType: "json",
        url: "enabledPairs?site=" + newSite,
        success: function(enabledPairs) {
            SetEnabledCurrencyPairs(enabledPairs);

            $(".site").click(function(event) {
                $(".site").removeClass("buttonSelected");
                var $target = $(event.target);
                $target.addClass("buttonSelected");
                site = $target.html();
                console.log("Selected site " + site);
                clearInterval(fetchDataInterval);
                $(".site").unbind("click");

                ResetCurrencyPairs(site);
            });

            $("#testInput").change(function(event) {
                var $target = $(event.target);
                var newInput = $target.val();

                if (isNaN(newInput)) {
                    $target.val("");
                    return;
                }

                testInput = parseFloat(newInput);
                console.log("test input changed: " + testInput);
                FetchData();
            });

            site = newSite;
            FetchData();

            fetchDataInterval = setInterval(function() {
                FetchData();
            }, 1000);
        },
        error: function(req, status, err) {
            console.log("Failed to get enabled pairs for " + site);
        }
    });
}

$(function() {
    // Generate buttons for sites, cryptos, fiats
    $.ajax({
        dataType: "json",
        url: "enabledSites",
        success: function(enabledSites) {
            var initSite = "CEX";
            if (enabledSites.indexOf(initSite) === -1) {
                initSite = enabledSites[0];
            }

            var $siteButtons = $("#siteButtons");
            for (var i = 0; i < enabledSites.length; i++) {
                var $new = $("<button class=\"site\">" 
                    + enabledSites[i] + "</button>");
                $siteButtons.append($new);

                if (enabledSites[i] === initSite) {
                    $new.addClass("buttonSelected");
                }
            }

            ResetCurrencyPairs(initSite);
        },
        error: function(req, status, err) {
            console.log("Failed to get enabled sites");
        }
    });

    // Generate profit fields
    var $profitProto = $("#profitProto");
    var profitEntry = $("#profitProto").html();
    var profitEntryClass = $profitProto.attr("class");
    $profitProto.remove();
    for (var i = 0; i < N_PROFITS; i++) {
        var barNum = (i % 3) + 1;
        $("#pBar" + barNum).append(
            "<div id=\"profit" + i + "\" class=\"" + profitEntryClass + "\">"
            + profitEntry
            + "</div>");
    }
});
