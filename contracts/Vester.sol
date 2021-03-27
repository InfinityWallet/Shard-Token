pragma solidity ^0.5.16;

contract Vester {
    address public token;
    address public recipient;

    uint public vestingAmount;
    uint public vestingBegin;
    uint public vestingCliff;
    uint public vestingEnd;

    uint public lastUpdate;

    constructor(
        address token_,
        address recipient_,
        uint vestingAmount_,
        uint vestingBegin_,
        uint vestingCliff_,
        uint vestingEnd_
    ) public {
        require(vestingBegin_ >= block.timestamp, 'Vester::constructor: vesting begin too early');
        require(vestingCliff_ >= vestingBegin_, 'Vester::constructor: cliff is too early');
        require(vestingEnd_ > vestingCliff_, 'Vester::constructor: end is too early');

        token = token_;
        recipient = recipient_;

        vestingAmount = vestingAmount_;
        vestingBegin = vestingBegin_;
        vestingCliff = vestingCliff_;
        vestingEnd = vestingEnd_;

        lastUpdate = vestingBegin;
    }

    function setRecipient(address recipient_) public {
        require(msg.sender == recipient, 'Vester::setRecipient: unauthorized');
        recipient = recipient_;
    }

    function claim() public {
        require(block.timestamp >= vestingCliff, 'Vester::claim: not time yet');
        uint amount;
        if (block.timestamp >= vestingEnd) {
            amount = IToken(token).balanceOf(address(this));
        } else {
            amount = mul(vestingAmount, (block.timestamp - lastUpdate)) / (vestingEnd - vestingBegin);
            lastUpdate = block.timestamp;
        }
        IToken(token).transfer(recipient, amount);
    }

    function mul(uint a, uint b) internal pure returns (uint c) {
        require(b == 0 || (c = a * b) / b == a, 'Vester::mul: multiplication overflow');
    }    
}

interface IToken {
    function balanceOf(address account) external view returns (uint);
    function transfer(address dst, uint rawAmount) external returns (bool);
}