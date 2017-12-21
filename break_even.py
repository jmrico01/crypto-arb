import sys

if len(sys.argv) != 3:
    print("Expected 2 args")

DEP = 0
WIT = 1

PERC = 0
FLAT = 1

commissions = {
    "cex": [
        [ # Deposit
            3.5,    # %
            0.25    # flat
        ],
        [ # Withdrawal
            1.2,    # %
            3.80    # flat
        ]
    ]
}

if sys.argv[1] not in commissions:
    print("Unrecognized site: " + sys.argv[1])

site = sys.argv[1]
amount = int(sys.argv[2])

paid = amount * (1.0 + commissions[site][DEP][PERC] / 100.0) \
    + commissions[site][DEP][FLAT]

# This is the balance in the site such that, after a withdrawal,
# you will obtain exactly "paid" fiat currency and break even
reqBalance = (paid + commissions[site][WIT][FLAT]) \
    / (1.0 - commissions[site][WIT][PERC] / 100.0)

print("Required balance: %.2f" % (reqBalance))

print("Need to make %.2f ( %.4f %% )" \
    % (reqBalance - amount, (reqBalance - amount) / amount * 100.0))