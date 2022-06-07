import axios from "axios";
import { Common, WyvernV2 } from "@reservoir0x/sdk";
import { ethers } from "ethers";
import { isEmpty, omitBy } from "lodash";

let indexerBaseUri = "https://api-rinkeby.reservoir.tools";
let reservoirApiKey = "RFBXXV0lbWErbXk3UiluJShAUWJf";

//used

//API function
export const api = async (url: any, data: any = {}) => {
  let response = await axios.get(`${indexerBaseUri}/${url}`, {
    headers: {
      "x-api-key": reservoirApiKey,
      ...(data && data.headers),
    },
    ...data,
  });
  return response;
};

//get tokens list
export const getTokenLists = async (
  relayerAddress: string,
  contract: string
) => {
  let response = await api(
    `users/${relayerAddress}/tokens/v2?contract=${contract}`
  );
  // // Check for Data retrieve
  if (!response || !response.data) {
    console.log("Could not get user tokens");
    process.exit(0);
  }
  //Set Relayer Token Balance
  let tokenBalance = !response.data.tokens ? 0 : response.data.tokens.length;
  //Set Relayer Tokens Object
  let ownedTokens = response.data.tokens;
  //Make list of unlisted and owned items
  let unlistedTokens = [] as any;
  //list of listed tokens
  let listedTokens = [] as any;
  for (let token of ownedTokens) {
    if (!token.ownership.floorAskPrice) {
      unlistedTokens.push(token);
    } else {
      listedTokens.push(token);
    }
  }

  return [tokenBalance, ownedTokens, unlistedTokens, listedTokens];
};

export const getFloorTokens = async (contract: string, numTokens: string) => {
  let response = await api(
    `tokens/details/v3?collection=${contract}&sortBy=floorAskPrice&limit=${numTokens}`
  );
  // // Check for Data retrieve
  if (!response || !response.data) {
    console.log("Could not get floor tokens");
    process.exit(0);
  }
  //Set Relayer Token Balance
  let floorTokens = response.data.tokens;
  return floorTokens;
};
export const getCollectionData = async (
  collection: string,
  relayerAddress: string
) => {
  //get collection data
  let response = await api(`collection/v2/?slug=${collection}`);
  //Check RES Response
  if (!response || !response.data.collection) {
    console.log("Could not get collection data");
    process.exit(0);
  }
  //set royalties
  let royalties = response.data.collection.royalties.bps || 0;
  //set royalties address
  let royaltiesAddress =
    response.data.collection.royalties.recipient || relayerAddress;

  let contract = response.data.collection.id;
  //return royalties
  return [contract, royalties, royaltiesAddress];
};

//Get current bids
export const getCurrentBids = async (
  contract: string,
  relayerAddress: string,
  royalties: number
) => {
  let response = await api(
    `orders/bids/v2?contracts=${contract}&status=active&maker=${relayerAddress}`
  );
  let currentBids = response.data.orders.map(
    (a: any) => a.price * (1 - 0.0001 * royalties)
  );
  return currentBids;
};

export const calculateFloorPrice = async (contract: any) => {
  //Set URL for collection tokens with numFloorToken
  let numFloorTokens = 1;
  //call
  let response = await api(
    `tokens/v4?collection=${contract}&sortBy=floorAskPrice&limit=${numFloorTokens}`
  );
  //Check RES Response
  if (!response || !response.data || !response.data.tokens) {
    console.log("Could not get collection tokens");
    process.exit(0);
  }
  //Set Floor Tokens
  let floorTokens = response.data.tokens;
  let floorList = response.data.tokens.map((a: any) => a.floorAskPrice);
  //
  let estFloor =
    floorTokens.reduce(
      (total: any, next: any) => total + next.floorAskPrice,
      0
    ) / floorTokens.length;

  let trueFloor = floorTokens.reduce((prev: any, curr: any) =>
    prev.floorAskPrice < curr.floorAskPrice ? prev : curr
  ).floorAskPrice;

  return [trueFloor, estFloor, floorList];
};

export const calculateRecentSalePrice = async (collection: any) => {
  //Set URL for collection tokens with numFloorToken
  let numSoldTokens = 5;
  //call
  let response = await api(
    `sales?collection=${collection}&limit=${numSoldTokens}`
  );
  //Check RES Response
  if (!response || !response.data || !response.data.sales) {
    console.log("Could not get collection tokens");
    process.exit(0);
  }
  //Set Floor Tokens
  let floorSales = response.data.sales;
  //list of sales
  let salesList = response.data.sales.map((a: any) => a.price);
  //estimate floor sale price
  let estSalePrice =
    floorSales.reduce((total: any, next: any) => total + next.price, 0) /
    floorSales.length;
  //last sale price
  let lastSalePrice = floorSales.reduce((prev: any, curr: any) =>
    prev.price < curr.price ? prev : curr
  ).price;

  return [lastSalePrice, estSalePrice, salesList];
};

export const getBidOrderParams = async (
  collection: any,
  walletAddress: any,
  bid: any,
  bidExpiration: any,
  royalties: any,
  royaltiesAddress: any
) => {
  //Call RES URL
  let response = await api(`collection/v1/?slug=${collection}`);
  //console.log(response);
  //Check RES Response
  if (!response || !response.data.collection) {
    console.log("Could not get collection data");
    process.exit(0);
  }
  //calculate bid total
  let total = Number(bid) / (1 - (royalties || 0) * 0.0001);

  let bidOrderParams = {
    maker: walletAddress,
    weiPrice: ethers.utils
      .parseEther(parseFloat(total.toFixed(18)).toString())
      .toString(),
    collection: response.data.collection.id,
    expirationTime: (Math.floor(Date.now() / 1000) + bidExpiration).toString(),
    salt: ethers.BigNumber.from(ethers.utils.randomBytes(32)).toString(),
  };

  return bidOrderParams;
};

export const getOSBidOrderParams = async (
  collection: any,
  tokenId: any,
  walletAddress: any,
  bid: any,
  bidExpiration: any,
  royalties: any,
  royaltiesAddress: any
) => {
  //Call RES URL
  let response = await api(`collection/v1/?slug=${collection}`);
  //console.log(response);
  //Check RES Response
  if (!response || !response.data.collection) {
    console.log("Could not get collection data");
    process.exit(0);
  }
  //calculate bid total
  let total = Number(bid) / (1 - (royalties || 0) * 0.0001);
  let token = response.data.collection.id.concat(":", tokenId);
  let bidOrderParams = {
    maker: walletAddress,
    weiPrice: ethers.utils
      .parseEther(parseFloat(total.toFixed(18)).toString())
      .toString(),
    orderbook: "opensea",
    token: token,
    expirationTime: (Math.floor(Date.now() / 1000) + bidExpiration).toString(),
    salt: ethers.BigNumber.from(ethers.utils.randomBytes(32)).toString(),
  };

  return bidOrderParams;
};

export const getListOrderParams = async (
  token: any,
  contract: any,
  walletAddress: any,
  listPrice: any,
  listingExpiration: any
) => {
  //Call RES URL
  // let response = await api(`collection/v1/?slug=${collection}`);
  // //console.log(response);
  // //Check RES Response
  // if (!response || !response.data.collection) {
  //   console.log("Could not get collection data");
  //   process.exit(0);
  // }
  //calculate bid total
  //let total = Number(bid) / (1 - (royalties || 0) * 0.0001);

  let listOrderParams = {
    token: token,
    maker: walletAddress,
    weiPrice: ethers.utils
      .parseEther(parseFloat(listPrice.toFixed(18)).toString())
      .toString(),
    expirationTime: (
      Math.floor(Date.now() / 1000) + listingExpiration
    ).toString(),
    salt: ethers.BigNumber.from(ethers.utils.randomBytes(32)).toString(),
  };

  return listOrderParams;
};

export const getOSListOrderParams = async (
  token: any,
  contract: any,
  walletAddress: any,
  listPrice: any,
  listingExpiration: any
) => {
  //Call RES URL
  // let response = await api(`collection/v1/?slug=${collection}`);
  // //console.log(response);
  // //Check RES Response
  // if (!response || !response.data.collection) {
  //   console.log("Could not get collection data");
  //   process.exit(0);
  // }
  //calculate bid total
  //let total = Number(bid) / (1 - (royalties || 0) * 0.0001);

  let listOrderParams = {
    token: token,
    maker: walletAddress,
    weiPrice: ethers.utils
      .parseEther(parseFloat(listPrice.toFixed(18)).toString())
      .toString(),
    orderbook: "opensea",
    expirationTime: (
      Math.floor(Date.now() / 1000) + listingExpiration
    ).toString(),
    salt: ethers.BigNumber.from(ethers.utils.randomBytes(32)).toString(),
  };

  return listOrderParams;
};
export const getBidOrderSteps = async (bidOrderParams: any) => {
  let query = new URLSearchParams(
    omitBy(bidOrderParams, (val: any) => val == undefined)
  );
  //let url = `${indexerBaseUri}execute/bid?${query.toString()}`;
  //  console.log(url);
  let steps: any;
  let url = `execute/bid/v2?${query.toString()}`;
  try {
    let response = await api(url);
    steps = response.data.steps;
    if (response.data.query) {
      url = updateParams(url, response.data.query, true);
    }
  } catch (e) {
    console.log(e);
  }

  return [url, steps];
};

export const getListOrderSteps = async (OrderParams: any) => {
  let query = new URLSearchParams(
    omitBy(OrderParams, (val: any) => val == undefined)
  );
  //let url = `${indexerBaseUri}execute/bid?${query.toString()}`;
  //  console.log(url);
  let steps: any;
  let url = `execute/list/v2?${query.toString()}`;
  try {
    let response = await api(url);
    steps = response.data.steps;
    if (response.data.query) {
      url = updateParams(url, response.data.query, true);
    }
  } catch (e) {
    console.log(e);
  }

  return [url, steps];
};

///UNUSED
export const updateParams = (url: string, params: any, replace: boolean) => {
  let parsedUrl = new URL(`${indexerBaseUri}/${url}`);
  let newParams = new URLSearchParams(replace ? "" : parsedUrl.search);
  Object.entries(params).map(([key, value]: any) => {
    newParams.append(key as any, value);
  });

  return (parsedUrl.pathname + "?" + newParams.toString()).replace("/", "");
};

export const checkAndApproveNftProxy = async (
  provider: any,
  chainId: number,
  relayerAddress: string,
  contract: string
) => {
  //set proxy address
  let proxyRegistry = new WyvernV2.Helpers.ProxyRegistry(provider, chainId);
  //check proxy
  let userProxy = await proxyRegistry.getProxy(relayerAddress);
  // Register if proxy does not exist
  if (userProxy == ethers.constants.AddressZero) {
    //register Proxy
    let signer = await provider.getSigner();
    let tx = await proxyRegistry.registerProxy(signer);
    //await transaction to go through
    await tx.wait();
    userProxy = await proxyRegistry.getProxy(relayerAddress);
  }
  // Check for proxy approval
  //Assign NFT contract
  let nftContract = new Common.Helpers.Erc721(provider, contract);
  //Check if proxy is approved
  let isApproved = await nftContract.isApproved(relayerAddress, userProxy);
  // Approve proxy if needed
  if (!isApproved) {
    console.log("approving proxy");
    let signer = await provider.getSigner();
    let tx = await nftContract.approve(signer, userProxy);
    await tx.wait();
    isApproved = await nftContract.isApproved(relayerAddress, userProxy);
    console.log("NFT contract approved");
  } else {
    console.log("NFT contract already approved");
  }
  return [userProxy, isApproved];
};

export const listOnOpensea = async (
  sellOrder: any,
  openseaOrdersUri: string,
  openseaApikey: string,
  token: any,
  contract: string
) => {
  const order = {
    exchange: sellOrder.params.exchange,
    maker: sellOrder.params.maker,
    taker: sellOrder.params.taker,
    makerRelayerFee: sellOrder.params.makerRelayerFee,
    takerRelayerFee: sellOrder.params.takerRelayerFee,
    makerProtocolFee: "0",
    takerProtocolFee: "0",
    makerReferrerFee: "0",
    feeMethod: 1,
    feeRecipient: sellOrder.params.feeRecipient,
    side: sellOrder.params.side,
    saleKind: sellOrder.params.saleKind,
    target: sellOrder.params.target,
    howToCall: sellOrder.params.howToCall,
    calldata: sellOrder.params.calldata,
    replacementPattern: sellOrder.params.replacementPattern,
    staticTarget: sellOrder.params.staticTarget,
    staticExtradata: sellOrder.params.staticExtradata,
    paymentToken: sellOrder.params.paymentToken,
    quantity: "1",
    basePrice: sellOrder.params.basePrice,
    extra: sellOrder.params.extra,
    listingTime: sellOrder.params.listingTime,
    expirationTime: sellOrder.params.expirationTime,
    salt: sellOrder.params.salt,
    metadata: {
      asset: {
        id: token.token.tokenId,
        address: contract,
      },
      schema: "ERC721",
    },
    v: sellOrder.params.v,
    r: sellOrder.params.r,
    s: sellOrder.params.s,
    hash: sellOrder.hash(),
  };

  console.log("Posting to Opensea");
  //List on Opensae
  console.log(`trying to post ${token.token.tokenId}`);
  //console.log(order);
  console.log(`${openseaOrdersUri}orders/post`);
  try {
    let os_post = await axios({
      method: "POST",
      url: `${openseaOrdersUri}orders/post`,
      data: order,
      headers: { "X-API-KEY": openseaApikey },
    });
    console.log(os_post);
  } catch (e) {
    console.log(e.response);
  }
};

export const buildOrder = async (
  orderParams: any,
  indexerBaseUri: any,
  chainId: any
) => {
  let query = new URLSearchParams(
    omitBy(orderParams, (val: any) => val == undefined)
  );
  console.log(`${indexerBaseUri}orders/build?${query.toString()}`);
  let response = await axios.get(
    `${indexerBaseUri}orders/build?${query.toString()}`
  );
  console.log(response.data.order.params);
  //console.log(response);
  //Build bid order

  let order = new WyvernV2.Order(chainId as any, response.data.order.params);
  return order;
};

export const checkWethandApproval = async (
  provider: any,
  chainId: number,
  relayerAddress: string,
  bidPrice: number
) => {
  //Set WETH Adress
  let wethAddress = Common.Addresses.Weth[chainId];
  //Set weth ERC20 object
  let weth = new Common.Helpers.Erc20(provider, wethAddress);
  console.log(wethAddress);
  //Set Token transfer Proxy
  let TokenTransferProxy = WyvernV2.Addresses.TokenTransferProxy[chainId];
  console.log(await weth.getBalance(relayerAddress));
  // Check WETH and Eth balances
  let wethBalance = Number(
    ethers.utils.formatEther(await weth.getBalance(relayerAddress))
  );
  //report
  console.log(`WethBalance of ${wethBalance}`);
  //Check Eth balance
  if (wethBalance < bidPrice) {
    //Check Eth balance to wrap
    let ethBalance = Number(
      ethers.utils.formatEther(await provider.getBalance(relayerAddress))
    );
    //Check bidprice on weth and eth
    let gasBuffer = 0.4;
    if (bidPrice < wethBalance + ethBalance - gasBuffer) {
      //set wrap value
      let wrapValue = wethBalance + ethBalance - gasBuffer;
      // wrap transaction
      try {
        const tx = await provider.getSigner().sendTransaction({
          to: "0xc778417E063141139Fce010982780140Aa0cD5Ab",
          value: ethers.utils.parseEther(String(wrapValue)),
        });
        await tx.wait();

        wethBalance = Number(
          ethers.utils.formatEther(await weth.getBalance(relayerAddress))
        );
      } catch (e) {
        console.log(e);
      }
      //console log wrapping transaction
      //console.log(tx);
    } else {
      //if insufficient Eth + Weth then exit
      console.log("Insufficient WETH and ETH for bids");
      process.exit(0);
    }
  }
  // Check allowance
  let wethAllowance = await weth.getAllowance(
    relayerAddress,
    TokenTransferProxy
  );
  //check if enough allowance
  if (wethAllowance < bidPrice) {
    console.log("allowing weth..");
    let tx = await weth.approve(
      provider.getSigner(),
      TokenTransferProxy,
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" // unlimited approval
    );
    await tx.wait();
    wethAllowance = await weth.getAllowance(relayerAddress, TokenTransferProxy);
    console.log(`Weth allowance now ${wethAllowance}`);
  } else {
    console.log(`Weth allowance already ${wethAllowance}`);
  }

  return [wethBalance, wethAllowance];
};
