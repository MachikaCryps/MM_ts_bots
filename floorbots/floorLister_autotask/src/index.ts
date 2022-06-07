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
  getTokenLists,
  getOSListOrderParams,
  getListOrderSteps,
  updateParams,
  calculateFloorPrice,
  api,
} from "../../../botfunctions/botFunctions";

//global params
let indexerBaseUri = "https://api-rinkeby.reservoir.tools";
let reservoirApiKey = "RFBXXV0lbWErbXk3UiluJShAUWJf";

let listingExpiration = 60 * 60 * 168; // 1 week

export async function handler(event: any) {
  //Set collection
  const collection = "loot-jztlhrl2ui";
  //set Provider and signer
  const provider = new DefenderRelayProvider(event);
  const signer = new DefenderRelaySigner(event, provider);
  console.log(provider);
  console.log(signer);
  //get Relayer Address
  let walletAddress = await signer.getAddress();
  console.log(`wallet address: ${walletAddress}`);
  //Get relevant collection data
  let [contract, royalties, royaltiesAddress] = await getCollectionData(
    collection,
    walletAddress
  );
  console.log(contract);
  //Get collection Token data for wallet
  let [
    tokenBalance,
    ownedTokens,
    unlistedTokens,
    listedTokens,
  ] = (await getTokenLists(walletAddress, contract)) as any;

  console.log(
    `current tokens (unlisted/total): ${unlistedTokens.length} / ${ownedTokens.length}`
  );

  let [trueFloor, estFloor, floorList] = await calculateFloorPrice(contract);
  let listPrice = 0.99 * trueFloor;
  console.log(listPrice);
  //Start Listing
  for (var _i = 0; _i < unlistedTokens.length; _i++) {
    let tokenId = contract.concat(":", unlistedTokens[_i].token.tokenId);
    console.log(`Listing ${tokenId}`);
    //get bid params
    let listOrderParams = await getOSListOrderParams(
      tokenId,
      contract,
      walletAddress,
      listPrice,
      listingExpiration
    );
    //get bidding steps
    let [url, steps] = await getListOrderSteps(listOrderParams);
    //Trying Initialize step
    try {
      let initializeWalletStep = steps.find((a: any) => {
        return a.action === "Initialize wallet";
      });

      if (initializeWalletStep.status === "incomplete") {
        try {
          const tx = await provider
            .getSigner()
            .sendTransaction(initializeWalletStep.data);
          await tx.wait();
          console.log("initialization transaction complete");
        } catch (e) {
          return e;
        }
      }
    } catch (e) {
      console.log(e);
      return e;
    }
    //Trying Approve NFT Contract
    try {
      let approveNftContractStep = steps.find((a: any) => {
        return a.action === "Approve NFT contract";
      });

      if (approveNftContractStep.status === "incomplete") {
        try {
          const tx = await provider
            .getSigner()
            .sendTransaction(approveNftContractStep.data);
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
        return a.action === "Authorize listing";
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
        return a.action === "Submit listing";
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
