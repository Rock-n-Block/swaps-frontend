import {Component, OnDestroy, OnInit, TemplateRef, ViewChild} from '@angular/core';
import {ActivatedRoute} from '@angular/router';

import {DomSanitizer, SafeResourceUrl} from '@angular/platform-browser';
import {Web3Service} from '../services/web3/web3.service';
import BigNumber from 'bignumber.js';

import {CONTRACT_STATES} from '../contract-preview/contract-states';
import {MatDialog} from '@angular/material';
import {TransactionComponent} from '../transaction/transaction.component';
import {ContractsService} from '../services/contracts/contracts.service';
import {UserInterface} from '../services/user/user.interface';
import {UserService} from '../services/user/user.service';

import {SWAPS_V2} from '../contract-form-two/contract-v2-details';
import {ContactOwnerComponent} from '../contact-owner/contact-owner.component';
import {IContractV3} from '../contract-form-all/contract-form-all.component';



@Component({
  selector: 'app-contracts-preview-v3',
  templateUrl: './contracts-preview-v3.component.html',
  styleUrls: ['../contract-preview/contract-preview.component.scss']
})
export class ContractsPreviewV3Component implements OnInit, OnDestroy {

  private web3Contract;
  public isRemindered: boolean;

  constructor(
    private route: ActivatedRoute,
    private sanitizer: DomSanitizer,
    private web3Service: Web3Service,
    private dialog: MatDialog,
    private contractService: ContractsService,
    private userService: UserService
  ) {
    this.web3Contract = this.web3Service.getContract(SWAPS_V2.ABI, SWAPS_V2.ADDRESS);
    this.originalContract = this.route.snapshot.data.contract;

    const tokenInfo = this.originalContract.tokens_info;

    this.copiedAddresses = {};
    this.analyzeContract();

    this.getBaseBrokersPercent();
    this.getQuoteBrokersPercent();

    this.maximumInvestors = 10;

    this.currentUser = this.userService.getUserModel();
    this.userService.getCurrentUser().subscribe((userProfile: UserInterface) => {
      this.currentUser = userProfile;
      this.checkAuthor();
    });
    this.checkAuthor();
    this.formatNumberParams = {groupSeparator: ',', groupSize: 3, decimalSeparator: '.'};

    this.rateFormat = {groupSeparator: ',', groupSize: 3, decimalSeparator: '.'};

    const baseAmount = new BigNumber(tokenInfo.base.amount);
    const quoteAmount = new BigNumber(tokenInfo.quote.amount);

    tokenInfo.base.amount = baseAmount.times(Math.pow(10, tokenInfo.base.token.decimals)).toString(10);
    tokenInfo.quote.amount = quoteAmount.times(Math.pow(10, tokenInfo.quote.token.decimals)).toString(10);

    this.originalContract.min_quote_wei = this.originalContract.min_quote_wei ?
      new BigNumber(this.originalContract.min_quote_wei).times(Math.pow(10, tokenInfo.quote.token.decimals)).toString(10) : '';

    this.originalContract.min_base_wei = this.originalContract.min_base_wei ?
      new BigNumber(this.originalContract.min_base_wei).times(Math.pow(10, tokenInfo.base.token.decimals)).toString(10) : '';

    this.rates = {
      normal: baseAmount.div(quoteAmount),
      reverted: quoteAmount.div(baseAmount)
    };

    this.originalContract.unique_link_url =
      this.contractAdditional.link =
        location.origin + '/public-v3/' + this.originalContract.unique_link;
  }


  get tokens() {
    return this.originalContract.tokens_info;
  }

  @ViewChild('administratorContact') administratorContact: TemplateRef<any>;

  private currentUser: any;

  public maximumInvestors;
  public rates;
  private formatNumberParams;

  public rateFormat;

  public originalContract: IContractV3;
  public copiedAddresses: any;
  public states = CONTRACT_STATES;
  public revertedRate: boolean;

  public activeSide: string;

  public contractAdditional: {
    source_link?: SafeResourceUrl;
    link?: string;
  } = {};

  public contractInfo: any = {};

  private updateContractTimer;

  private oldCheckedState: string;

  private checkSwapState() {
    const memo = this.originalContract.memo_contract;
    return new Promise((resolve, reject) => {
      const checkAfterActive = () => {
        if (this.originalContract.contract_state !== 'ACTIVE') {
          resolve(this.originalContract.state);
          return;
        }
        this.web3Contract.methods.isSwapped(memo).call().then((isSwapped) => {
          this.originalContract.isSwapped = isSwapped;
          if (isSwapped) {
            this.originalContract.state =
              this.originalContract.contract_state = 'DONE';
            resolve('DONE');
          } else {
            this.web3Contract.methods.isCancelled(memo).call().then((isCancelled) => {
              if (isCancelled) {
                this.originalContract.state =
                  this.originalContract.contract_state = 'CANCELLED';
                resolve('CANCELLED');
              } else {
                this.originalContract.state =
                  this.originalContract.contract_state = 'ACTIVE';
                resolve('ACTIVE');
              }
            });
          }
        }, err => {
          console.log(err);
        });
      };
      if (this.originalContract.isEthereum) {
        if ((this.originalContract.contract_state === 'CREATED') || (!this.originalContract.owner_address)) {
          this.web3Contract.methods.owners(memo).call().then((address) => {
            if (address && (address !== '0x0000000000000000000000000000000000000000')) {
              this.originalContract.owner_address = address;
              checkAfterActive();
            } else {
              this.originalContract.contract_state = 'CREATED';
              resolve(this.originalContract.state);
            }
          }, err => {
            console.log(err);
          });
        } else {
          checkAfterActive();
        }
      } else {
        resolve(this.originalContract.state);
      }
    });
  }

  public fromBigNumber(num, decimals, format?) {
    const bigNumberValue = new BigNumber(num).div(Math.pow(10, decimals));
    if (format) {
      return bigNumberValue.toFormat(this.formatNumberParams);
    } else {
      return bigNumberValue.toString(10);
    }
  }

  private getBaseRaised() {
    const details = this.originalContract;
    if (details.contract_state === 'ACTIVE' && details.isEthereum) {
      this.web3Contract.methods.baseRaised(details.memo_contract).call().then((result) => {
        const oldBaseRaised = this.contractInfo.baseRaised;
        this.contractInfo.baseRaised = result ? result.toString() : result;
        this.contractInfo.baseLeft = new BigNumber(details.tokens_info.base.amount).minus(result);
        this.contractInfo.baseLeftString =
          this.contractInfo.baseLeft.div(Math.pow(10, details.tokens_info.base.token.decimals)).toString(10);
        if (oldBaseRaised !== result.toString()) {
          this.getBaseInvestors();
        }
      }, err => {
        console.log(err);
      });
    } else {
      this.contractInfo.baseLeft = new BigNumber(details.tokens_info.base.amount);
      this.contractInfo.baseLeftString =
        this.contractInfo.baseLeft.div(Math.pow(10, details.tokens_info.base.token.decimals)).toString(10);
      this.getBaseInvestors();
    }
  }
  private getQuoteRaised() {
    const details = this.originalContract;
    if (details.contract_state === 'ACTIVE' && details.isEthereum) {
      this.web3Contract.methods.quoteRaised(details.memo_contract).call().then((result) => {
        const oldQuoteRaised = this.contractInfo.quoteRaised;
        this.contractInfo.quoteRaised = result ? result.toString() : result;
        this.contractInfo.quoteLeft = new BigNumber(details.tokens_info.quote.amount).minus(result);
        this.contractInfo.quoteLeftString =
          this.contractInfo.quoteLeft.div(Math.pow(10, details.tokens_info.quote.token.decimals)).toString(10);
        if (oldQuoteRaised !== result.toString()) {
          this.getQuoteInvestors();
        }
      }, err => {
        console.log(err);
      });
    } else {
      this.contractInfo.quoteLeft = new BigNumber(details.tokens_info.quote.amount);
      this.contractInfo.quoteLeftString =
        this.contractInfo.quoteLeft.div(Math.pow(10, details.tokens_info.quote.token.decimals)).toString(10);
      this.getQuoteInvestors();
    }
  }

  private getBaseInvestors() {
    const details = this.originalContract;

    if (details.contract_state === 'ACTIVE' && details.isEthereum) {
      this.web3Contract.methods.baseInvestors(details.memo_contract).call().then((result) => {
        this.contractInfo.baseInvestors = result ? result.length : 0;
      }, err => {
        this.contractInfo.baseInvestors = 0;
        // console.log(err);
      });
    } else {
      this.contractInfo.baseInvestors = 0;
    }
  }
  private getQuoteInvestors() {
    const details = this.originalContract;
    if (details.contract_state === 'ACTIVE' && details.isEthereum) {
      this.web3Contract.methods.quoteInvestors(details.memo_contract).call().then((result) => {
        this.contractInfo.quoteInvestors = result ? result.length : 0;
      }, err => {
        this.contractInfo.quoteInvestors = 0;
      });
    } else {
      this.contractInfo.quoteInvestors = 0;
    }
  }

  private getBaseBrokersPercent() {
    const details = this.originalContract;

    if (details.isEthereum) {
      this.web3Contract.methods.myWishBasePercent().call().then((result) => {
        this.contractInfo.baseBrokerPercent = result / 100 + details.broker_fee_base;
        this.contractInfo.baseBrokerAmount =
          new BigNumber(details.tokens_info.base.amount).div(100).times(this.contractInfo.baseBrokerPercent);
      }, err => {
        console.log(err);
      });
    } else {
      this.contractInfo.baseBrokerPercent = details.broker_fee_base;
      this.contractInfo.baseBrokerAmount =
        new BigNumber(details.tokens_info.base.amount).div(100).times(this.contractInfo.baseBrokerPercent);
    }
  }
  private getQuoteBrokersPercent() {
    const details = this.originalContract;

    if (details.isEthereum) {
      this.web3Contract.methods.myWishQuotePercent().call().then((result) => {
        this.contractInfo.quoteBrokerPercent = result / 100 + details.broker_fee_quote;
        this.contractInfo.quoteBrokerAmount =
          new BigNumber(details.tokens_info.quote.amount).div(100).times(this.contractInfo.quoteBrokerPercent);
      }, err => {
        console.log(err);
      });
    } else {
      this.contractInfo.quoteBrokerPercent = details.broker_fee_quote;
      this.contractInfo.quoteBrokerAmount =
        new BigNumber(details.tokens_info.quote.amount).div(100).times(this.contractInfo.quoteBrokerPercent);
    }
  }

  private getContractInfoFromBlockchain() {
    const details = this.originalContract;
    this.getBaseRaised();
    this.getQuoteRaised();

    if (details.isEthereum) {
      if (details.contract_state === 'ACTIVE') {
        if (this.oldCheckedState !== details.contract_state) {
          this.web3Contract.methods.owners(details.memo_contract).call().then((res) => {
            this.originalContract.owner_address = res;
          }, err => {
            console.log(err);
          });
        }

      } else {
        this.originalContract.isSwapped = false;
      }
    } else {
      this.originalContract.isSwapped = false;
    }

    this.oldCheckedState = details.contract_state;
  }

  private analyzeContract() {
    this.checkSwapState().then((state) => {
      switch (this.originalContract.state) {
        case 'ACTIVE':
        case 'DONE':
        case 'CREATED':
        case 'EXPIRED':
        case 'CANCELLED':
          this.getContractInfo();
          break;
      }

      if (this.originalContract.state === 'ACTIVE') {
        this.updateContractTimer = setTimeout(() => {
          this.getBaseContract();
        }, 4000);
      }
    });
  }

  private checkAuthor() {
    if (this.currentUser) {
      this.originalContract.isAuthor = this.currentUser.id === this.originalContract.user;
    }
  }

  private getBaseContract() {
    this.contractService.getSwapByPublic(this.originalContract.unique_link).then((result) => {

      const tokensInfo = this.originalContract.tokens_info;
      const swapped = this.originalContract.isSwapped;
      const state = this.originalContract.state;
      const contractState = this.originalContract.contract_state;
      const ownerAddress = this.originalContract.owner_address;
      const isAuthor = this.originalContract.isAuthor;
      const minBase = this.originalContract.min_base_wei;
      const minQuote = this.originalContract.min_quote_wei;
      const isEthereum = this.originalContract.isEthereum;

      this.originalContract = result;
      this.originalContract.tokens_info = tokensInfo;
      this.originalContract.isSwapped = swapped;
      this.originalContract.state = state;
      this.originalContract.contract_state = contractState;
      this.originalContract.owner_address = ownerAddress;
      this.originalContract.isAuthor = isAuthor;
      this.originalContract.min_quote_wei = minQuote;
      this.originalContract.min_base_wei = minBase;
      this.originalContract.unique_link_url =
        this.contractAdditional.link;
      this.originalContract.isEthereum = isEthereum;


    }).finally(() => {
      this.analyzeContract();
    });
  }

  private getContractInfo() {
    this.checkAuthor();
    this.getContractInfoFromBlockchain();
  }


  ngOnInit() {}

  public onCopied(field) {
    if (this.copiedAddresses[field]) {
      return;
    }
    this.copiedAddresses[field] = true;
    setTimeout(() => {
      this.copiedAddresses[field] = false;
    }, 1000);
  }

  public sendRefund(token) {
    const details = this.originalContract;

    const interfaceMethod = this.web3Service.getMethodInterface('refund', SWAPS_V2.ABI);
    const methodSignature = this.web3Service.encodeFunctionCall(interfaceMethod, [
      details.memo_contract,
      token.address
    ]);

    const sendTransaction = (wallet) => {
      this.web3Service.sendTransaction({
        from: wallet.address,
        to: SWAPS_V2.ADDRESS,
        data: methodSignature
      }, wallet.type).then((result) => {
        console.log(result);
      }, (err) => {
        console.log(err);
      });
    };

    this.dialog.open(TransactionComponent, {
      width: '38.65em',
      panelClass: 'custom-dialog-container',
      data: {
        title: 'Refund',
        description:
          'You can take back your contributions at any time until the contract’s execution.\n' +
          'Use the same address which you used for the contribution.',
        transactions: [{
          to: SWAPS_V2.ADDRESS,
          data: methodSignature,
          action: sendTransaction
        }]
      }
    });
  }

  public sendCancel() {
    const details = this.originalContract;
    if (!details.isEthereum) {
      this.contractService.cancelSWAP3(details.id).then((result) => {
        console.log(result);
      });
      return;
    }

    const cancelMethod = this.web3Service.getMethodInterface('cancel', SWAPS_V2.ABI);
    const cancelSignature = this.web3Service.encodeFunctionCall(
      cancelMethod, [details.memo_contract]
    );

    const cancelTransaction = (wallet) => {
      this.web3Service.sendTransaction({
        from: wallet.address,
        to: SWAPS_V2.ADDRESS,
        data: cancelSignature
      }, wallet.type).then((result) => {
        console.log(result);
      }, (err) => {
        console.log(err);
      });
    };

    this.dialog.open(TransactionComponent, {
      width: '38.65em',
      panelClass: 'custom-dialog-container',
      data: {
        transactions: [{
          from: this.originalContract.owner_address,
          to: SWAPS_V2.ADDRESS,
          data: cancelSignature,
          action: cancelTransaction,
          onlyOwner: details.owner_address.toLowerCase()
        }],
        title: 'Cancel',
        description: 'To cancel the swap you need to make the transaction from the management address'
      }
    });
  }


  public openInitialisation() {

    const details = this.originalContract;

    const interfaceMethod = this.web3Service.getMethodInterface('createOrder', SWAPS_V2.ABI);

    const trxRequest = [
      details.memo_contract,
      details.base_address,
      details.quote_address,
      (details.base_limit || '0').toString(),
      (details.quote_limit || '0').toString(),
      Math.round((new Date(details.stop_date)).getTime() / 1000),
      details.whitelist ? details.whitelist_address : '0x0000000000000000000000000000000000000000',
      new BigNumber(details.min_base_wei || '0').toString(10),
      new BigNumber(details.min_quote_wei || '0').toString(10),
      details.broker_fee ? details.broker_fee_address : '0x0000000000000000000000000000000000000000',
      details.broker_fee ? (new BigNumber(details.broker_fee_base).times(100)).toString(10) : '0',
      details.broker_fee ? (new BigNumber(details.broker_fee_quote).times(100)).toString(10) : '0'
    ];
    const activateSignature = this.web3Service.encodeFunctionCall(interfaceMethod, trxRequest);
    const sendActivateTrx = (wallet) => {
      this.web3Service.sendTransaction({
        from: wallet.address,
        to: SWAPS_V2.ADDRESS,
        data: activateSignature
      }, wallet.type).then((result) => {
        console.log(result);
      }, (err) => {
        console.log(err);
      });
    };


    this.dialog.open(TransactionComponent, {
      width: '38.65em',
      panelClass: 'custom-dialog-container',
      data: {
        transactions: [{
          to: SWAPS_V2.ADDRESS,
          data: activateSignature,
          action: sendActivateTrx
        }],
        title: 'Initialization',
        description: 'Before the contribution it’s needed to initialize the contract (once per trade)'
      }
    });
  }


  public sendContribute(amount, token) {
    if (!this.originalContract.isEthereum) {
      this.openAdministratorInfo();
      return;
    }
    try {
      let tokenAddress: any;

      const details = this.originalContract;

      const bigNumberAmount = new BigNumber(amount);

      if (bigNumberAmount.isNaN()) {
        return;
      }

      switch (token) {
        case 'base':
          tokenAddress = details.tokens_info.base;
          break;
        case 'quote':
          tokenAddress = details.tokens_info.quote;
          break;
      }

      const stringAmountValue = bigNumberAmount.toString(10);

      let value: string;

      if (tokenAddress.token.isEther) {
        value = stringAmountValue;
      }

      const approveMethod = this.web3Service.getMethodInterface('approve');

      const approveSignature = this.web3Service.encodeFunctionCall(
        approveMethod, [
          SWAPS_V2.ADDRESS,
          stringAmountValue
        ]
      );

      const depositMethod = this.web3Service.getMethodInterface('deposit', SWAPS_V2.ABI);

      const depositSignature = this.web3Service.encodeFunctionCall(
        depositMethod, [details.memo_contract, tokenAddress.token.address, stringAmountValue]
      );

      const approveTransaction = (wallet) => {
        this.web3Service.sendTransaction({
          from: wallet.address,
          to: tokenAddress.token.address,
          data: approveSignature
        }, wallet.type).then((result) => {
          console.log(result);
        }, (err) => {
          console.log(err);
        });
      };

      const contributeTransaction = (wallet) => {
        this.web3Service.sendTransaction({
          from: wallet.address,
          to: SWAPS_V2.ADDRESS,
          data: depositSignature,
          value: value || undefined
        }, wallet.type).then((result) => {
          console.log(result);
        }, (err) => {
          console.log(err);
        });
      };

      const textAmount = this.fromBigNumber(amount, tokenAddress.token.decimals);

      const transactionsList: any[] = [{
        title: 'Make the transfer of ' + textAmount + ' ' + tokenAddress.token.token_short_name + ' tokens to contract',
        to: SWAPS_V2.ADDRESS,
        data: depositSignature,
        action: contributeTransaction,
        ethValue: !tokenAddress.token.isEther ? undefined : bigNumberAmount.div(Math.pow(10, tokenAddress.token.decimals)).toString(10)
      }];

      if (!tokenAddress.token.isEther) {
        transactionsList.unshift({
          title: 'Authorise the contract for getting ' + textAmount + ' ' + tokenAddress.token.token_short_name + ' tokens',
          to: tokenAddress.token.address,
          data: approveSignature,
          action: approveTransaction
        });
      }

      if (details.contract_state === 'CREATED') {

        this.openInitialisation();

        return;
      }


      // 'Send ' + amount + ' ETH to the contract address directly'
      this.dialog.open(TransactionComponent, {
        width: '38.65em',
        panelClass: 'custom-dialog-container',
        data: {
          transactions: transactionsList,
          title: 'Contribute',
          description: !tokenAddress.token.isEther ?
            `For contribution you need to make ${transactionsList.length} transactions: authorise the contract and make the transfer` :
            ''
        }
      });
    } catch (e) {
      console.log(e);
    }

  }

  ngOnDestroy(): void {
    if (this.updateContractTimer) {
      window.clearTimeout(this.updateContractTimer);
    }
  }

  public openContactForm() {
    this.dialog.open(ContactOwnerComponent, {
      width: '38.65em',
      panelClass: 'custom-dialog-container',
      data: this.originalContract
    });
  }

  public quoteWillGetValue(amount) {
    const details = this.originalContract;

    const quoteWillValue = new BigNumber(details.tokens_info.quote.amount).div(new BigNumber(details.tokens_info.base.amount).div(amount));
    const quoteFeeValue = quoteWillValue.div(100).times(this.contractInfo.quoteBrokerPercent);

    if (!quoteFeeValue.isNaN()) {
      return quoteWillValue
        .minus(quoteFeeValue).toString(10);
    } else {
      return quoteWillValue.toString(10);
    }
  }

  public baseWillGetValue(amount) {
    const details = this.originalContract;
    const baseWillValue = new BigNumber(details.tokens_info.base.amount).div(new BigNumber(details.tokens_info.quote.amount).div(amount));
    const baseFeeValue = baseWillValue.div(100).times(this.contractInfo.baseBrokerPercent);

    if (!baseFeeValue.isNaN()) {
      return baseWillValue
        .minus(baseFeeValue).toString(10);
    } else {
      return baseWillValue.toString(10);
    }
  }

  private openAdministratorInfo() {
    this.dialog.open(this.administratorContact, {
      width: '480px',
      panelClass: 'custom-dialog-container'
    });
  }

}
