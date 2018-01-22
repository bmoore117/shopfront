var p = require("bluebird");
const getBalancePromise = p.promisify(web3.eth.getBalance);
const getTransactionPromise = p.promisify(web3.eth.getTransaction);

const Shop = artifacts.require("./Shop.sol");

contract('Shop', function(accounts) {
    var instance;

    before("deploy new instance", function() {
        return Shop.new(true, {from: accounts[0]})
        .then(function(_instance) {
            instance = _instance;
        });
    });

    it("should be enabled with owner accounts[0]", function() {
        return instance.isServiceEnabled.call()
        .then(success => {
            assert.isTrue(success, "Shop not enabled");
            return instance.owner.call();
        }).then(result => {
            assert.strictEqual(result, accounts[0], "unknown account used to deploy, accounts[0] expected");
        });
    });

    it("should disallow adding addresses as administrators if not submitted by the owner", done => {
        instance.addAdministrator(accounts[1], {from: accounts[1]}).then(txInfo => {
            done(new Error("non-owner account attempted to add administrator and transaction succeeded"));
        }, err => {
            done();
        });
    });

	it("should allow adding addresses as administrators if submitted by the owner", done => {
        instance.addAdministrator(accounts[1], {from: accounts[0]}).then(txInfo => {
            logs = txInfo.logs[0];
            var eventType = logs.event;
            var address = logs.args.newAdmin;
                
            var result = eventType === 'LogAdministratorAdded' && address === accounts[1];
            assert.isTrue(result, 'accounts[1] not registered as administrator');
            return instance.administrators.call([accounts[1]]);
        }, err => {
            done(err);
        }).then(value => {
            if(value) {
                done();
            } else {
                done(new Error("storage does not confirm logged message"));
            }
        });
    });

    it("should disallow adding addresses as merchants if not submitted by an administrator", done => {
        instance.addMerchant(accounts[2], {from: accounts[2]}).then(txInfo => {
            done(new Error("non-administrator account attempted to add merchant and transaction succeeded"));
        }, err => {
            done();
        });
    });

    it("should allow adding addresses as merchants if submitted by an administrator", done => {
        instance.addMerchant(accounts[2], {from: accounts[1]}).then(txInfo => {
            logs = txInfo.logs[0];
            var eventType = logs.event;
            var address = logs.args.newMerchant;
                
            var result = eventType === 'LogMerchantAdded' && address === accounts[2];
            assert.isTrue(result, 'accounts[2] not registered as merchant');
            return instance.merchants.call([accounts[2]]);
        }, err => {
            done(err);
        }).then(value => {
            if(value) {
                done();
            } else {
                done(new Error("storage does not confirm logged message"));
            }
        });
    });


    var product = {
        microEther: 1000000000000,
        name: "widget",
        description: "your life will never be the same",
        stock: 1,
        merchant: accounts[2]
    }
    it("should accept new products submitted by an administrator", done => {
        instance.addProduct(product.name, product.description, product.merchant, product.stock, product.microEther, {from: accounts[1]})
        .then(txInfo => {
            return instance.getProductByName.call(product.name);
        }, err => {
            done(err);
        }).then(newProduct => {
            assert.isTrue(newProduct[0].toNumber() === 0 //product index
                && newProduct[1] === product.description 
                && newProduct[2] === product.merchant 
                && newProduct[3].toNumber() === product.stock 
                && newProduct[4].toNumber() === product.microEther, "product not successfully created");
            done();
        });
    });

    it("should reject new products submitted by non-administrators", done => {
        instance.addProduct("widget2", "even better than the last", product.merchant, product.stock, product.microEther, {from: accounts[2]})
        .then(txInfo => {
            done(new Error("product created when attempt should have been rejected"));
        }, err => {
            done();
        });
    });

    it("should reject new products submitted by an administrator with an invalid merchant", done => {
        var microEther = 1000000000000;
        var name = "widget2";
        var description = "even better than the last";
        var stock = 1;
        var merchant = accounts[3];
        
        //addProduct(string name, string description, address merchant, uint stock, uint price)
        var tx = instance.addProduct(name, description, merchant, stock, microEther, {from: accounts[1]})
        .then(txInfo => {
            done(new Error("product created when attempt should have been rejected"));
        }, err => {
            done();
        });
    });

    it("should reject purchases for less than the price", done => {
        instance.buyProduct("widget", {from: accounts[4], value: product.microEther - 1})
        .then(txInfo => {
            done(new Error("Product purchase not rejected when full price not paid"));
        }, err => {
            done();
        });
    });

    it("should allow purchase of an in-stock item by anyone, for the correct price", function() {
        return instance.buyProduct("widget", {from: accounts[4], value: product.microEther})
        .then(txInfo => {
            logs = txInfo.logs[0];
            var eventType = logs.event;
            var name = logs.args.name;
            var buyer = logs.args.buyer;
            var initialStock = logs.args.initialStock;
            var remainingStock = logs.args.remainingStock;
    
            var result = eventType === "LogProductPurchased"
                && product.name === name 
                && buyer === accounts[4] 
                && initialStock.toNumber() === product.stock 
                && remainingStock.toNumber() === product.stock - 1
            assert.isTrue(result, "Product purchase not working as intended");
        })
    });

    it("should reject purchase of an out-of-stock item by anyone", done => {
        instance.buyProduct("widget", {from: accounts[4], value: product.microEther})
        .then(txInfo => {
            done(new Error("Product purchase not rejected on out of stock item"));
        }, err => {
            done();
        });
    });

    it("should reject withdrawals by non-merchants", done => {
        instance.withdrawProceeds(accounts[4], {from: accounts[4]})
        .then(txInfo => {
            done(new Error("Transaction completed when it should have been reverted"));
        }, err => {
            done();
        });
    });

    it("should reject withdrawals made by non-merchants", done => {
        instance.withdrawProceeds(accounts[5], product.microEther, {from: accounts[5]})
        .then(txInfo => {
            done(new Error("Expected invalid transaction to be rejected"));
        }, err => {
            done();
        });
    });

    it("should allow withdrawals by merchants to accounts of their choice", function() {
        var amountBeforePayout;
        var payoutAmount;
        var gasUsed;
        var gasPrice;

        return getBalancePromise(product.merchant) //merchant's initial balance
            .then(balance => {
                amountBeforePayout = balance;
                return instance.withdrawProceeds(product.merchant, product.microEther, {from: product.merchant})
            }).then(txInfo => {
                payoutAmount = txInfo.logs[0].args.amount; //amount from the log event
                gasUsed = txInfo.receipt.gasUsed;                
                return getTransactionPromise(txInfo.tx);
            }).then(tx => {
                gasPrice = tx.gasPrice; //gas price from web3.eth.gasPrice is incorrect, this is the real one
                return getBalancePromise(product.merchant);
            }).then(amountAfterPayout => {
                var payoutLessFees = payoutAmount.minus(gasUsed*gasPrice);
                var test = amountAfterPayout.minus(payoutLessFees);
        
                assert.strictEqual(test.toString(10), amountBeforePayout.toString(10), "Remittance not properly paid out");
            });
    });

    it("should reject withdrawals made by merchants with zero balances", done => {
        instance.withdrawProceeds(product.merchant, product.microEther, {from: product.merchant})
        .then(txInfo => {
            done(new Error("Expected invalid transaction to be rejected"));
        }, err => {
            done();
        });
    });
});