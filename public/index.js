const N_PROFITS = 6;
const PROFIT_THRESHOLD = 0.0;

function ClearPlot()
{
    d3.select("svg").remove();
}

function Plot(datasets, xMin, xMax)
{
    /*var xMin = 100000000000.0;
    for (var i = 0; i < datasets.length; i++) {
        var localMin = d3.min(datasets[i], function(d) { return d[0] });
        if (xMin > localMin) {
            xMin = localMin;
        }
    }
    var xMax = 0.0;
    for (var i = 0; i < datasets.length; i++) {
        var localMax = d3.max(datasets[i], function(d) { return d[0] });
        if (xMax < localMax) {
            xMax = localMax;
        }
    }*/
    var yMax = 0.0;
    for (var i = 0; i < datasets.length; i++) {
        var localMax = d3.max(datasets[i], function(d) { return d[1] });
        if (yMax < localMax) {
            yMax = localMax;
        }
    }

    var margin = {top: 20, right: 60, bottom: 20, left: 60};
    var width = 900 - margin.left - margin.right;
    var height = 400 - margin.top - margin.bottom;
    
    var xScale = d3.scale.linear()
        .domain([xMin, xMax])
        .range([0, width]);

    var yScale = d3.scale.linear()
        .domain([0, yMax])
        .range([height, 0]);

    var xAxis = d3.svg.axis()
        .scale(xScale)
        .orient("bottom")
        .innerTickSize(-height)
        .outerTickSize(0)
        .tickPadding(10);

    var yAxis = d3.svg.axis()
        .scale(yScale)
        .orient("left")
        .innerTickSize(-width)
        .outerTickSize(0)
        .tickPadding(10);

    var line = d3.svg.line()
        .x(function(d) { return xScale(d[0]); })
        .y(function(d) { return yScale(d[1]); });

    var svg = d3.select("body").append("svg")
        .attr("class", "depthPlot")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    svg.append("g")
        .attr("class", "x axis")
        .attr("transform", "translate(0," + height + ")")
        .call(xAxis)

    svg.append("g")
        .attr("class", "y axis")
        .call(yAxis)

    // Asks
    svg.append("path")
        .data([datasets[0]])
        .attr("class", "lineRed")
        .attr("d", line);
    // Bids
    svg.append("path")
        .data([datasets[1]])
        .attr("class", "lineGreen")
        .attr("d", line);
}

function SetAskBidDisplay(depth)
{
    if (depth === null) {
        $("#minAsk").html("N/A");
        $("#maxBid").html("N/A");
        $("#minAskAge").html("0");
        $("#maxBidAge").html("0");
        return;
    }

    var minAskInd = 0;
    var maxBidInd = depth.bids.length - 1;
    $("#minAsk").html(depth.asks[minAskInd][0]);
    $("#maxBid").html(depth.bids[maxBidInd][0]);
    
    var minAskDate = new Date(depth.asks[minAskInd][1][1]).getTime();
    var minAskAge = (Date.now() - minAskDate) / 1000.0;
    $("#minAskAge").html(minAskAge.toString());
    var maxBidDate = new Date(depth.bids[maxBidInd][1][1]).getTime();
    var maxBidAge = (Date.now() - maxBidDate) / 1000.0;
    $("#maxBidAge").html(maxBidAge.toString());
}

function ProcessDepthData(depth)
{
    if (depth.asks.length === 0 || depth.bids.length === 0) {
        ClearPlot();
        SetAskBidDisplay(null);
        return;
    }

    SetAskBidDisplay(depth);

    var depthMargin = 0.1;
    var minAsk = parseFloat(depth.asks[0][0]);
    var maxBid = parseFloat(depth.bids[depth.bids.length - 1][0]);
    var avgPrice = (minAsk + maxBid) / 2.0;
    var depthPriceMin = avgPrice * (1.0 - depthMargin);
    var depthPriceMax = avgPrice * (1.0 + depthMargin);

    var asks = [];
    var bids = [];
    for (var i = 0; i < depth.asks.length; i++) {
        var price = parseFloat(depth.asks[i][0]);
        if (price < depthPriceMin || price > depthPriceMax) {
            continue;
        }
        var volume = parseFloat(depth.asks[i][1][0]);
        asks.push([price, volume]);
    }
    for (var i = 0; i < depth.bids.length; i++) {
        var price = parseFloat(depth.bids[i][0]);
        if (price < depthPriceMin || price > depthPriceMax) {
            continue;
        }
        var volume = parseFloat(depth.bids[i][1][0]);
        bids.push([price, volume]);
    }

    for (var i = 1; i < asks.length; i++) {
        asks[i][1] += asks[i-1][1];
    }
    for (var i = bids.length - 1; i > 0; i--) {
        bids[i-1][1] += bids[i][1];
    }

    ClearPlot();
    Plot([asks, bids], depthPriceMin, depthPriceMax);
}

var site = "";
var pair = "";
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
    for (var i = 0; i < N_PROFITS; i++) {
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
            console.log(pastThreshold);
            ProcessProfitData(pastThreshold);
        },
        error: function(req, status, err) {
            console.log("No profits data");
        }
    })
}

$(function() {
    // Generate buttons for sites, cryptos, fiats
    $.ajax({
        dataType: "json",
        url: "enabled",
        success: function(enabledInfo) {
            var initSite = "CEX";
            var initCrypto = "BTC";
            var initFiat = "USD";
            if (enabledInfo.sites.indexOf(initSite) === -1) {
                initSite = enabledInfo.sites[0];
            }

            var $bar2 = $("#bar2");
            for (var i = 0; i < enabledInfo.sites.length; i++) {
                var $new = $("<button class=\"site\">" 
                    + enabledInfo.sites[i] + "</button>");
                $bar2.append($new);

                if (enabledInfo.sites[i] === initSite) {
                    $new.addClass("buttonSelected");
                }
            }
            $bar2.append("<br><br>");
            for (var i = 0; i < enabledInfo.cryptos.length; i++) {
                var $new = $("<button class=\"crypto\">"
                    + enabledInfo.cryptos[i] + "</button>");
                $bar2.append($new);

                if (enabledInfo.cryptos[i] === initCrypto) {
                    $new.addClass("buttonSelected");
                }
            }
            $bar2.append("<br><br>");
            for (var i = 0; i < enabledInfo.fiats.length; i++) {
                var $new = $("<button class=\"fiat\">"
                    + enabledInfo.fiats[i] + "</button>");
                $bar2.append($new);

                if (enabledInfo.fiats[i] === initFiat) {
                    $new.addClass("buttonSelected");
                }
            }
            
            $(".site").click(function(event) {
                $(".site").removeClass("buttonSelected");
                var $target = $(event.target);
                $target.addClass("buttonSelected");
                site = $target.html();
                console.log("Selected site " + site);
                FetchData();
            });
            $(".crypto").click(function(event) {
                $(".crypto").removeClass("buttonSelected");
                var $target = $(event.target);
                $target.addClass("buttonSelected");
                pair = pair.split("-");
                pair[0] = $target.html();
                pair = pair.join("-");
                console.log("Selected currencies: " + pair);
                FetchData();
            });
            $(".fiat").click(function(event) {
                $(".fiat").removeClass("buttonSelected");
                var $target = $(event.target);
                $target.addClass("buttonSelected");
                pair = pair.split("-");
                pair[1] = $target.html();
                pair = pair.join("-");
                console.log("Selected currencies: " + pair);
                FetchData();
            });

            $("#testInput").change(function(event) {
                var $target = $(event.target);
                var newInput = $target.val();

                if (isNaN(newInput)) {
                    $target.val("");
                    return;
                }

                testInput = parseFloat(newInput);
            });

            site = initSite;
            pair = initCrypto + "-" + initFiat;
            FetchData();

            setInterval(function() {
                FetchData();
            }, 1000);
        },
        error: function(req, status, err) {
            console.log("Failed to get data/enabled info");
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
