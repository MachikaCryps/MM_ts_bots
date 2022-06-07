// Entrypoint for the Autotask
// Import dependencies available in the autotask environment
import axios from "axios";
import { ethers } from "ethers";
import { splitSignature } from "ethers/lib/utils";
// Import dependencies available in the autotask environment
import {
  DefenderRelayProvider,
  DefenderRelaySigner,
} from "defender-relay-client/lib/ethers";

import {
  getCollectionData,
  getFloorTokens,
  getCurrentBids,
  getOSBidOrderParams,
  getBidOrderSteps,
  updateParams,
  api,
} from "../../../botfunctions/botFunctions";

//global params
let indexerBaseUri = "https://api-rinkeby.reservoir.tools";
let reservoirApiKey = "RFBXXV0lbWErbXk3UiluJShAUWJf";

let bidExpiration = 60 * 60 * 24; // 24 hours

export async function handler(event: any) {
  //Set collection
  const collection = "loot-jztlhrl2ui";
  //set Provider and signer
  const provider = new DefenderRelayProvider(event);
  const signer = new DefenderRelaySigner(event, provider);
  //get Relayer Address
  let walletAddress = await signer.getAddress();
  console.log(`wallet address: ${walletAddress}`);

  //Get relevant collection data
  let [contract, royalties, royaltiesAddress] = await getCollectionData(
    collection,
    walletAddress
  );
  //Get list of both X Tokens
  let floorTokens = await getFloorTokens(contract, "2");
  console.log(floorTokens);

  //Get live bids
  let currentBids = await getCurrentBids(contract, walletAddress, royalties);
  console.log(`Number of current bids: ${currentBids.length}`);
  //Start Bidding
  for (var _i = 0; _i < 2; _i++) {
    console.log(`Bidding`);
    //Determine Bid
    let tokenListPrice = floorTokens[_i].market.floorAsk.price;
    let tokenId = floorTokens[_i].token.tokenId;
    console.log(tokenListPrice);
    let bid = tokenListPrice * 0.15;

    //get bid params
    let bidOrderParams = await getOSBidOrderParams(
      collection,
      tokenId,
      walletAddress,
      bid,
      bidExpiration,
      royalties,
      royaltiesAddress
    );

    console.log(bidOrderParams);
    //get bidding steps
    let [url, steps] = await getBidOrderSteps(bidOrderParams);
    //Check WETH step
    try {
      let wethWrapStep = steps.find((a: any) => {
        return a.action === "Wrapping ETH";
      });
      //wrap if incomplete
      if (wethWrapStep.status === "incomplete") {
        //Get Eth Balance
        const balance = Number(
          ethers.utils.formatEther(await provider.getBalance(walletAddress))
        );
        //need a better estimate of buffer
        let buffer = 0.05;
        if (bid < balance + buffer) {
          //Check Eth balance to wrap
          try {
            const tx = await provider.getSigner().sendTransaction({
              to: wethWrapStep.data.to,
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

      if (wethApproveStep.status === "incomplete") {
        try {
          const tx = await provider
            .getSigner()
            .sendTransaction(wethApproveStep.data);
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
      let signature: any;
      let signingStep = steps.find((a: any) => {
        return a.action === "Authorize offer";
      });
      //console.log(signingStep.status);
      if (signingStep.status === "incomplete") {
        signature = await signer._signTypedData(
          signingStep.data.domain,
          signingStep.data.types,
          signingStep.data.value
        );

        if (signature) {
          const { r, s, v } = splitSignature(signature);
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
          `${indexerBaseUri}/order/v2`,

          submitStep.data.body,
          {
            headers: {
              "Content-Type": "application/json",
              "x-api-key": reservoirApiKey,
            },
          }
        );
        console.log(post.data.message);
      }
    } catch (e) {
      console.log(e);
      return e;
    }
  }
}
// Sample typescript type definitions
type EnvInfo = {
  RELAYER_API_KEY: string;
  RELAYER_API_SECRET: string;
};

// To run locally (this code will not be executed in Autotasks)
if (require.main === module) {
  require("dotenv").config();
  //Mainnet
  //const { API_KEY: apiKey, API_SECRET: apiSecret } = process.env as EnvInfo;
  //Rinkeby
  const {
    RELAYER_API_KEY: apiKey,
    RELAYER_API_SECRET: apiSecret,
  } = process.env as EnvInfo;

  handler({ apiKey, apiSecret })
    .then(() => process.exit(0))
    .catch((error: any) => {
      console.error(error);
      process.exit(1);
    });
}
