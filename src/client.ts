import {
  createSiweMessageWithRecaps,
  generateAuthSig,
  LitAbility,
  LitActionResource,
  LitPKPResource,
} from "@lit-protocol/auth-helpers";
import { LIT_RPC } from "@lit-protocol/constants";
import { EthWalletProvider } from "@lit-protocol/lit-auth-client";
import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { AuthMethod } from "@lit-protocol/types";
import { ethers as ethers5 } from "ethers";

const generatePrivateKey = (): string => {
  const randomWallet = ethers5.Wallet.createRandom();
  return randomWallet.privateKey;
};

const LIT_NETWORK = "datil";

const mintPkp = async (
  network: "datil" | "datil-test",
  authMethod: AuthMethod
): Promise<any> => {
  const response = await fetch("http://localhost:3000/mint-pkp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      network,
      authMethod,
    }),
  });
  if (!response.ok) {
    throw new Error(`Error: ${response.statusText}`);
  }
  const data = await response.json();
  return data.pkp;
};

const getCapacityCredits = async (
  network: "datil" | "datil-test",
  walletAddress: string
): Promise<any> => {
  const response = await fetch("http://localhost:3000/capacity-credits", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      network,
      walletAddress,
    }),
  });
  if (!response.ok) {
    throw new Error(`Error: ${response.statusText}`);
  }
  const data = await response.json();
  return data.capacityDelegationAuthSig;
};

const run = async () => {
  const userPrivateKey = generatePrivateKey();
  const ethersSigner = new ethers5.Wallet(
    userPrivateKey,
    new ethers5.providers.JsonRpcProvider(LIT_RPC.CHRONICLE_YELLOWSTONE)
  );
  const signerPublicAddress = await ethersSigner.getAddress();
  console.log("signerPublicAddress", signerPublicAddress);

  const litNodeClient = new LitNodeClient({
    litNetwork: LIT_NETWORK,
    debug: true,
  });

  let connected = false as boolean;
  while (!connected) {
    try {
      await litNodeClient.connect();
      connected = true;
    } catch (error) {
      console.error("Connection Error: ", error);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const authMethod = await EthWalletProvider.authenticate({
    signer: ethersSigner,
    litNodeClient,
    expiration: new Date(Date.now() + 1000 * 60 * 10).toISOString(), // 10 minutes
    domain: "gvnr.xyz",
    origin: "http://gvnr.xyz",
  });
  console.log("authMethod", authMethod);

  const pkp = await mintPkp(LIT_NETWORK, authMethod);
  console.log("pkp", pkp);

  await new Promise((resolve) => setTimeout(resolve, 1000));
  const capacityCreditsDelegationAuth = await getCapacityCredits(
    LIT_NETWORK,
    signerPublicAddress
  );

  console.log("capacityCreditsDelegationAuth", capacityCreditsDelegationAuth);

  const sessionSigs = await litNodeClient.getSessionSigs({
    chain: "ethereum",
    expiration: new Date(Date.now() + 1000 * 10).toISOString(), // 10 minutes
    capabilityAuthSigs: [capacityCreditsDelegationAuth],
    resourceAbilityRequests: [
      {
        resource: new LitPKPResource("*"),
        ability: LitAbility.PKPSigning,
      },
      {
        resource: new LitActionResource("*"),
        ability: LitAbility.LitActionExecution,
      },
    ],
    authNeededCallback: async ({
      resourceAbilityRequests,
      expiration,
      uri,
    }) => {
      const toSign = await createSiweMessageWithRecaps({
        uri: uri!,
        expiration: expiration!,
        resources: resourceAbilityRequests!,
        walletAddress: signerPublicAddress,
        nonce: await litNodeClient.getLatestBlockhash(),
        litNodeClient,
      });

      return await generateAuthSig({
        signer: ethersSigner,
        toSign,
      });
    },
  });
  console.log("✅ Generated Session Signatures");

  console.log("Session Signatures:", sessionSigs);

  const signingResult = await litNodeClient.pkpSign({
    pubKey: pkp.publicKey,
    sessionSigs,
    toSign: ethers5.utils.arrayify(
      ethers5.utils.keccak256(
        ethers5.utils.toUtf8Bytes(
          "The answer to the universe is 404 NO. is 42.."
        )
      )
    ),
  });

  console.log("signingResult:", signingResult);
};

run();
