// Format: [fractionalFee, flatFee]
//
// TODO factor in wire transfer fees
const fees = {
    "Bitstamp": {
        deposit: {
            "USD": [0.0, 7.50],

            default: [0.0, 0.00]
        },
        withdraw: {
            // This depends on stuff
            // Check https://www.bitstamp.net/fee_schedule/
            "USD": [0.0, 10.00],

            // No withdrawal fees! :O
            default: [0.0, 0.00]
        },
        taker: [0.25 / 100.0, 0.0],
        maker: [0.25 / 100.0, 0.0]
    },
    "CEX": {
        deposit: {
            "USD": [3.5 / 100.0, 0.25],

            default: [0.0, 0.00]
        },
        withdraw: {
            "USD": [0.0, 3.8],

            "BTC": [0.0, 0.001],
            "BCH": [0.0, 0.001],
            "BTG": [0.0, 0.001],
            "ETH": [0.0, 0.01],
            "LTC": [0.0, 0.001],
            "NMC": [0.0, 0.001],
            "XDG": [0.0, 1.0],
            "DASH": [0.0, 0.01],
            "ZEC": [0.0, 0.001]
        },
        taker: [0.25 / 100.0, 0.0],
        maker: [0.16 / 100.0, 0.0]
    },
    "Kraken": {
        deposit: {
            // Either $5 or $10...
            "USD": [0.0, 5.00],

            default: [0.0, 0.00]
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
    },
    "OKCoin": {
        deposit: {
            // NO FIAT DEPOSITS :(
            "USD": [null, null],

            default: [0.0, 0.00]
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
    "Poloniex": {
        // TODO deposit/withdrawal fees...
        deposit: {
        },
        withdrawal: {
        },
        taker: [0.25 / 100.0, 0.0],
        maker: [0.15 / 100.0, 0.0]
    },

    // In process...
    "QUOINEX": {
        // https://quoine.zendesk.com/hc/en-us/articles/115011281488-Fees
        deposit: {
            default: [0.0, 0.00]
        },
        withdraw: {
            "JPY": [0.0, 500.00],
            "USD": [0.0, 5.00],
            "SGD": [0.0, 5.00],
            "EUR": [0.0, 5.00],
            "AUD": [0.0, 5.00],
            "HKD": [0.0, 40.00],
            "INR": [0.0, 325.00],
            "IDR": [0.01 / 100.0, 0.00], // Minimum 25k flat
            "PHP": [0.0, 225.00],

            // No withdrawal fees either?!
            default: [0.0, 0.00]
        },
        // Actually 0.1% for ETH pairs
        taker: [0.25 / 100.0, 0.0],
        maker: [0.25 / 100.0, 0.0]
    }
}

function Deposit(site, curr)
{
    if (!fees.hasOwnProperty(site)) {
        return null;
    }
    if (!fees[site].hasOwnProperty("deposit")) {
        return null;
    }
    if (!fees[site].deposit.hasOwnProperty(curr)) {
        if (fees[site].deposit.hasOwnProperty("default")) {
            return fees[site].deposit.default;
        }

        return null;
    }

    return fees[site].deposit[curr];
}

function Withdraw(site, curr)
{
    if (!fees.hasOwnProperty(site)) {
        return null;
    }
    if (!fees[site].hasOwnProperty("withdraw")) {
        return null;
    }
    if (!fees[site].withdraw.hasOwnProperty(curr)) {
        if (fees[site].withdraw.hasOwnProperty("default")) {
            return fees[site].withdraw.default;
        }

        return null;
    }

    return fees[site].withdraw[curr];
}

function Exchange(site, curr1, curr2)
{
    if (!fees.hasOwnProperty(site)) {
        return null;
    }
    if (!fees[site].hasOwnProperty("taker")) {
        return null;
    }
    // Forward support for currency-dependent taker fees here.

    return fees[site].taker;
}

exports.fees = fees;
exports.Deposit = Deposit;
exports.Withdraw = Withdraw;
exports.Exchange = Exchange;