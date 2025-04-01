import { AuthMethodScope, LIT_RPC, LitNetwork } from "@lit-protocol/constants";
import { LitContracts } from "@lit-protocol/contracts-sdk";
import { LitNodeClient } from "@lit-protocol/lit-node-client";
import "dotenv/config";
import { ethers as ethers5 } from "ethers";
import express from "express";
import { SelfRelay } from "./self-relay";

export interface ICapacityCredits {
  id: string;
  ratePerSecond: number;
  dueTo: number;
}

const app = express();
app.use(express.json());
const port = 3000;

const chronicleProvider = new ethers5.providers.JsonRpcProvider(
  LIT_RPC.CHRONICLE_YELLOWSTONE
);
const holderWallet = new ethers5.Wallet(
  process.env.LIT_CAPACITY_HOLDER_KEY!,
  chronicleProvider
);
const holderWalletAddress = holderWallet.address;
console.log("holderWalletAddress: ", holderWalletAddress);

const state = {
  litNodeClient: new Map<LitNetwork, LitNodeClient>(),
  connectingLitNodeClient: new Map<LitNetwork, boolean>([
    [LitNetwork.Datil, false as boolean],
    [LitNetwork.DatilTest, false as boolean],
  ]),
  capacityCredits: new Map<"datil" | "datil-test", ICapacityCredits>(),
};

const requestCapacityCredits = async (litNetwork: "datil" | "datil-test") => {
  if (state.capacityCredits.get(litNetwork) !== undefined) {
    return state.capacityCredits.get(litNetwork)!;
  } else {
    const litContracts = new LitContracts({
      privateKey: process.env.LIT_CAPACITY_HOLDER_KEY,
      network: litNetwork === "datil" ? LitNetwork.Datil : LitNetwork.DatilTest, // Adjust to DatilMain if using the main network
      debug: true,
    });

    await litContracts.connect();

    const capacityCreditInfo = await litContracts.mintCapacityCreditsNFT({
      requestsPerSecond: 10, // Example: 10 requests per second
      daysUntilUTCMidnightExpiration: 1, // Valid for 1 day
    });
    console.log("capacityCreditInfo");
    console.log(capacityCreditInfo);

    const capacityCredits = {
      ratePerSecond: 10,
      dueTo: Date.now() + 1 * 24 * 60 * 60 * 1000, // 1 day from now
      id: capacityCreditInfo.capacityTokenIdStr,
    };
    state.capacityCredits.set(litNetwork, capacityCredits);
    return capacityCredits;
  }
};

const getLitNodeClient = async (litNetwork: LitNetwork) => {
  while (state.connectingLitNodeClient.get(litNetwork)!) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (state.litNodeClient.get(litNetwork) !== undefined) {
    return state.litNodeClient.get(litNetwork)!;
  }
  state.connectingLitNodeClient.set(litNetwork, true);
  state.litNodeClient.set(
    litNetwork,
    new LitNodeClient({
      litNetwork,
      debug: false,
    })
  );
  let connected = false as boolean;
  while (!connected) {
    try {
      await state.litNodeClient.get(litNetwork)!.connect();
      connected = true;
    } catch (error) {
      console.error(
        "RelayerMaster: Temporary Connection Error (trying again): ",
        error
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  state.connectingLitNodeClient.set(litNetwork, false);
  return state.litNodeClient.get(litNetwork)!;
};

app.post("/mint-pkp", async (req, res) => {
  const authMethod = req.body.authMethod;
  const network = req.body.network;

  const options = {
    permittedAuthMethodScopes: [[AuthMethodScope.SignAnything]],
  };

  const pkp = await SelfRelay.mintPKPDirect(network, authMethod, options);

  console.log("pkp");
  console.log(pkp);

  res.send({
    pkp,
  });
});

app.post("/capacity-credits", async (req, res) => {
  const userWalletAddress = req.body.walletAddress;
  const litNetwork = req.body.network;
  const litNodeClient = await getLitNodeClient(litNetwork);

  // const capacityCredits = await requestCapacityCredits(litNetwork);
  const capacityCredits = {
    ratePerSecond: 10,
    dueTo: 1743616200700,
    // id: "157747",
    id: "157000",
    // id: "15",
  };

  console.log("capacityCredits");
  console.log(capacityCredits);

  const { capacityDelegationAuthSig } =
    await litNodeClient.createCapacityDelegationAuthSig({
      uses: "1",
      dAppOwnerWallet: holderWallet,
      capacityTokenId: capacityCredits.id, // Replace with your token ID
      delegateeAddresses: [userWalletAddress], // Replace with the delegatee address
      expiration: new Date(
        Date.now() + 1000 * 60 * 2 // 2 minutes from now
      ).toISOString(), // Optional expiration in "capacityCreditsDueTo" expiration
    });

  console.log("capacityDelegationAuthSig", capacityDelegationAuthSig);

  res.send({
    capacityDelegationAuthSig,
  });
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
