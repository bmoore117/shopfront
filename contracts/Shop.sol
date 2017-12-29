pragma solidity ^0.4.17;

contract Shop {
    //ownership
    address private owner;
    bool public isServiceEnabled;
    event LogServiceStateChanged(
        bool newState
    );
    
    //users
    mapping(address => bool) public administrators;
    mapping(address => bool) public merchants;
    mapping(address => uint) private merchantBalances;
    event LogAdministratorAdded(
        address newAdmin
    );
    event LogAdministratorRemoved(
        address removed
    );
    event LogMerchantAdded(
        address newAdmin
    );
    event LogMerchantRemoved(
        address removed
    );
    event LogWithdrawalMade(
        address sentTo,
        uint amount
    );

    //products
    struct Product {
        uint index;
        string description;
        address merchant;
        uint stock;
        uint price;
    }
    event LogProductAdded(
        string name
    );
    event LogProductRemoved(
        string name
    );
    event LogProductPurchased(
        string name,
        address buyer,
        uint initialStock,
        uint remainingStock
    );

    mapping(string => Product) private products;
    string[] private productIndex;

    modifier requireEnabled {
        require(isServiceEnabled);
        _;
    }

    modifier requireOwner {
        require(msg.sender == owner);
        _;
    }

    modifier requireAdmin {
        require(administrators[msg.sender]);
        _;
    }

    modifier requireMerchant {
        require(merchants[msg.sender]);
        _;
    }

    function Shop(bool initialServiceState) public {
        owner = msg.sender;
        isServiceEnabled = initialServiceState;
        addAdministrator(owner);
        addMerchant(owner);
    }

    /************** User Crud **************/
    function addAdministrator(address toAdd) requireEnabled requireOwner public {
        administrators[toAdd] = true;
        LogAdministratorAdded(toAdd);
    }

    function removeAdministrator(address toRemove) requireEnabled requireOwner public {
        administrators[toRemove] = false;
        LogAdministratorRemoved(toRemove);
    }

    function addMerchant(address toAdd) requireEnabled requireAdmin public {
        merchants[toAdd] = true;
        LogAdministratorAdded(toAdd);
    }

    function removeMerchant(address toRemove) requireEnabled requireAdmin public {
        merchants[toRemove] = false;
        LogAdministratorRemoved(toRemove);
    }
    /************** End User Crud **************/

    /************** Product Crud **************/
    function isProduct(string name) public view returns(bool productExists) {
        if (productIndex.length == 0) 
            return false;

        string memory value = productIndex[products[name].index];
        
        return (keccak256(value) == keccak256(name));
    }

    function addProduct(string name, string description, address merchant, uint stock, uint price) requireEnabled requireAdmin public returns (uint index) {
        require(!isProduct(name));

        uint idx = productIndex.push(name) - 1;
        products[name].index = idx;
        products[name].description = description;
        products[name].merchant = merchant;
        products[name].stock = stock;
        products[name].price = price;
        
        LogProductAdded(name);
        return idx;
    }

    function removeProduct(string name) requireEnabled requireAdmin public {
        require(!isProduct(name));
        uint rowToDelete = products[name].index;
        string memory keyToMove = productIndex[productIndex.length - 1];
        productIndex[rowToDelete] = keyToMove;
        products[keyToMove].index = rowToDelete; 
        productIndex.length--;
        LogProductRemoved(name);
    }
    /************** End Product Crud **************/

    /************** Shop functionality **************/
    function buyProduct(string name) requireEnabled public payable {
        require(isProduct(name));

        Product storage p = products[name];
        uint initialStock = p.stock;
        require(initialStock > 0);
        require(msg.value == p.price);
        p.stock--;

        //bump merchant's balance
        merchantBalances[p.merchant] += p.price;

        //presumably in a real-world scenario something else would be kicked off here,
        //e.g. shipping the customer their item, but we just log a purchase
        LogProductPurchased(name, msg.sender, initialStock, products[name].stock);
    }

    function withdrawProceeds(address sendTo, uint amount) requireEnabled requireMerchant public {
        require(merchantBalances[msg.sender] >= amount);
        merchantBalances[msg.sender] -= amount;
        LogWithdrawalMade(sendTo, amount);
        sendTo.transfer(amount);
    }
}