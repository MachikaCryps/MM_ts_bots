// Entrypoint for the Autotask
// Import dependencies available in the autotask environment
import axios from "axios";
import { ethers } from "ethers";
import { omitBy } from "lodash";
import { splitSignature } from "ethers/lib/utils";

import {
  getTokenLists,
  getRoyaltiesInfo,
  getCurrentBids,
  calculateFloorPrice,
  calculateRecentSalePrice,
  getBidOrderParams,
  getBidOrderSteps,
  updateParams,
  api,
} from "./botFunctions";

//global params
let indexerBaseUri = "https://mainnet-api-v4.reservoir.tools";
let reservoirApiKey = "RFBXXV0lbWErbXk3UiluJShAUWJf";
let bidLimit = 2.5;
let bidExpiration = 60 * 60 * 3; // 3 hours

export async function handler(event: any) {
  //Set collection
  const collection = event.request.body.collection.collectionId; // Object with JSON-parsed POST body
  console.log(`checking: ${collection}`);
  //set secrets
  let { infuraProjectId, infuraKey, mnemonic } = event.secrets;
  //set Infura Provider
  const infuraProvider = new ethers.providers.InfuraProvider("homestead", {
    projectId: infuraProjectId,
    projectSecret: infuraKey,
  });
  //instantiate wallet
  let mWallet = ethers.Wallet.fromMnemonic(mnemonic);
  //connect waller to provider
  mWallet = mWallet.connect(infuraProvider);
  //get wallet address
  let walletAddress = await mWallet.getAddress();
  console.log(`wallet address: ${walletAddress}`);

  //Get collection Token data for wallet
  let [
    tokenBalance,
    ownedTokens,
    unlistedTokens,
    listedTokens,
  ] = (await getTokenLists(walletAddress, collection)) as any;

  console.log(
    `current tokens (unlisted/total): ${unlistedTokens.length} / ${ownedTokens.length}`
  );

  //Get royalty Info for bid retrieval
  let [royalties, royaltiesAddress] = await getRoyaltiesInfo(
    collection,
    walletAddress
  );

  //Get live bids
  let currentBids = (await getCurrentBids(
    collection,
    walletAddress,
    royalties
  )) as any;

  console.log(`Number of current bids: ${currentBids.length}`);

  //decide on bid price
  let [trueFloor, estFloor, floorList] = (await calculateFloorPrice(
    collection
  )) as any;

  console.log(`true floor: ${trueFloor}, estimated floor: ${estFloor}`);

  let [
    lastSalePrice,
    estSalePrice,
    salesList,
  ] = (await calculateRecentSalePrice(collection)) as any;

  console.log(
    `last sale price: ${lastSalePrice}, estimated sale Price: ${estSalePrice}`
  );

  //Add a more complex way to calculate bid price
  let bidPrice = 0.8 * trueFloor;
  let bidList = currentBids.map((a: any) => a.toFixed(3));
  let bid = bidList?.includes(bidPrice.toFixed(3))
    ? bidList?.includes((bidPrice * 0.95).toFixed(3))
      ? bidPrice * 0.9
      : 0.95 * bidPrice
    : bidPrice;
  console.log(`bid is ${bid}`);

  console.log(`salesList: ${salesList}`);
  console.log(`floorList: ${floorList}`);

  bid = 0.1;

  if (
    (currentBids ? currentBids.length : 0) + tokenBalance < 5 &&
    bid < bidLimit
  ) {
    console.log(`Bidding`);
    //get bid params
    let bidOrderParams = await getBidOrderParams(
      collection,
      walletAddress,
      bid,
      bidExpiration,
      royalties,
      royaltiesAddress
    );
    //get bidding steps
    let [url, steps] = await getBidOrderSteps(bidOrderParams);
    console.log(`url: ${url}`);
    //log out steps
    console.log(steps);
    //Check wethwrap step
    try {
      let wethWrapStep = steps.find((a: any) => {
        return a.action === "Wrapping ETH";
      });
      //wrap if incomplete
      if (wethWrapStep.status === "incomplete") {
        //Get Eth Balance
        const balance = Number(
          ethers.utils.formatEther(
            await infuraProvider.getBalance(walletAddress)
          )
        );
        //need a better estimate of buffer
        let buffer = 0.02;
        if (bidPrice < balance + buffer) {
          //Check Eth balance to wrap
          try {
            const tx = await mWallet.sendTransaction({
              to: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
              value: ethers.utils.parseEther(String(balance - buffer)),
            });
            await tx.wait();
          } catch (e) {
            console.log(e);
          }
        } else {
          console.log("not enough Eth");
          process.exit(0);
        }
      }
    } catch (e) {
      return e;
    }
    //Trying Approval step
    try {
      let wethApproveStep = steps.find((a: any) => {
        return a.action === "Approve WETH contract";
      });
      console.log(wethApproveStep.status);

      if (wethApproveStep.status === "incomplete") {
        try {
          const tx = await mWallet.sendTransaction(wethApproveStep.data);
          console.log(tx);
          await tx.wait();
          console.log("approval transaction complete");
        } catch (e) {
          return e;
        }
      }
    } catch (e) {
      console.log(e);
      return e;
    }
    //try Signature step
    try {
      let signature;
      let signingStep = steps.find((a: any) => {
        return a.action === "Authorize offer";
      });
      //console.log(signingStep.status);
      if (signingStep.status === "incomplete") {
        signature = await mWallet._signTypedData(
          signingStep.data.domain,
          signingStep.data.types,
          signingStep.data.value
        );
        console.log(signature);

        if (signature) {
          const { r, s, v } = splitSignature(signature);
          console.log(url);
          url = updateParams(
            url,
            {
              r,
              s,
              v: v.toString(),
            },
            false
          );
        }
      }
    } catch (e) {
      console.log(e);
      return e;
    }

    try {
      let response = await api(`${url}`);
      let steps = response.data.steps;

      let submitStep = steps.find((a: any) => {
        return a.action === "Submit offer";
      });

      if (submitStep.status === "incomplete") {
        let post = await axios.post(
          `${indexerBaseUri}/order`,

          submitStep.data.body,
          {
            headers: {
              "Content-Type": "application/json",
              "x-api-key": reservoirApiKey,
            },
          }
        );
        console.log(post);
      }
    } catch (e) {
      console.log(e);
      return e;
    }
  } else {
    let report = bidPrice < bidLimit ? "No bids to make" : "Bid too expensive";
    return report;
  }
}
// Sample typescript type definitions
type EnvInfo = {
  API_KEY: string;
  API_SECRET: string;
  RINKEBY_API_KEY: string;
  RINKEBY_API_SECRET: string;
  MNEMONIC: string;
  INFURA_KEY: string;
  INFURA_PROJECTID: string;
};

// To run locally (this code will not be executed in Autotasks)
if (require.main === module) {
  require("dotenv").config();
  //Mainnet
  //const { API_KEY: apiKey, API_SECRET: apiSecret } = process.env as EnvInfo;
  //Rinkeby
  const {
    API_KEY: apiKey,
    API_SECRET: apiSecret,
    MNEMONIC: mnemonic,
    INFURA_KEY: infuraKey,
    INFURA_PROJECTID: infuraProjectId,
  } = process.env as EnvInfo;
  const request = {
    body: {
      collection: {
        collectionId: "lootproject",
      },
    },
  };

  const secrets = { infuraProjectId, infuraKey, mnemonic };
  handler({ apiKey, apiSecret, secrets, request })
    .then(() => process.exit(0))
    .catch((error: any) => {
      console.error(error);
      process.exit(1);
    });
}
