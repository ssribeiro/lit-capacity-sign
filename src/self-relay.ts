import { datil, datilTest } from "@lit-protocol/contracts";
import {
  AuthMethod,
  IRelayPKP,
  IRelayRequestData,
  MintRequestBody,
} from "@lit-protocol/types";
import { ethers as ethers5 } from "ethers";
import { validateMintRequestBody } from "./lit-validator";

export interface MintNextAndAddAuthMethodsRequest {
  keyType: number; // string;
  permittedAuthMethodTypes: number[]; // string[];
  permittedAuthMethodIds: string[];
  permittedAuthMethodPubkeys: string[];
  permittedAuthMethodScopes: ethers5.BigNumber[][]; // string[][];
  addPkpEthAddressAsPermittedAddress: boolean;
  sendPkpToItself: boolean;
  burnPkp?: boolean;
  sendToAddressAfterMinting?: string;
  pkpEthAddressScopes?: string[];
}

const state = {
  pkpNftContractDatil: undefined as undefined | ethers5.Contract,
  pkpNftContractDatilTest: undefined as undefined | ethers5.Contract,
  pkpHelperContractDatil: undefined as undefined | ethers5.Contract,
  pkpHelperContractDatilTest: undefined as undefined | ethers5.Contract,
  signer: undefined as undefined | ethers5.Signer,
  gasLimitIncreasePercentage: 200,
  gasLimitBaseDefault: ethers5.BigNumber.from(7159600),
};

const provider = new ethers5.providers.JsonRpcProvider(
  "https://yellowstone-rpc.litprotocol.com"
);

const getSigner = () => {
  if (state.signer === undefined) {
    state.signer = new ethers5.Wallet(
      process.env.LIT_CAPACITY_HOLDER_KEY!,
      provider
    );
  }
  return state.signer;
};

const getPkpNftContract = (
  network: "datil" | "datil-test"
): ethers5.Contract => {
  if (network === "datil") {
    if (state.pkpNftContractDatil === undefined) {
      const source = datil.data
        .find((d) => d.name === "PKPNFT")!
        .contracts.find((one) => one.network === "datil")!;
      const abi = source.ABI;
      const address = source.address_hash;
      const signer = getSigner();
      state.pkpNftContractDatil = new ethers5.Contract(address, abi, signer);
    }
    return state.pkpNftContractDatil;
  } else if (network === "datil-test") {
    if (state.pkpNftContractDatilTest === undefined) {
      const source = datilTest.data
        .find((d) => d.name === "PKPNFT")!
        .contracts.find((one) => one.network === "datil-test")!;
      const abi = source.ABI;
      const address = source.address_hash;
      const signer = getSigner();
      state.pkpNftContractDatilTest = new ethers5.Contract(
        address,
        abi,
        signer
      );
    }
    return state.pkpNftContractDatilTest;
  } else {
    throw new Error(`Invalid network: ${network}`);
  }
};

const getPkpHelperContract = (
  network: "datil" | "datil-test"
): ethers5.Contract => {
  if (network === "datil") {
    if (state.pkpHelperContractDatil === undefined) {
      const source = datil.data
        .find((d) => d.name === "PKPHelper")!
        .contracts.find((one) => one.network === "datil")!;
      const abi = source.ABI;
      const address = source.address_hash;
      const signer = getSigner();
      state.pkpHelperContractDatil = new ethers5.Contract(address, abi, signer);
    }
    return state.pkpHelperContractDatil;
  } else if (network === "datil-test") {
    if (state.pkpHelperContractDatilTest === undefined) {
      const source = datilTest.data
        .find((d) => d.name === "PKPHelper")!
        .contracts.find((one) => one.network === "datil-test")!;
      const abi = source.ABI;
      const address = source.address_hash;
      const signer = getSigner();
      state.pkpHelperContractDatilTest = new ethers5.Contract(
        address,
        abi,
        signer
      );
    }
    return state.pkpHelperContractDatilTest;
  } else {
    throw new Error(`Invalid network: ${network}`);
  }
};

const getAuthMethodId = async (authMethod: AuthMethod) => {
  let address;
  try {
    address = JSON.parse(authMethod.accessToken).address;
  } catch (err) {
    throw new Error(
      `Error when parsing auth method to generate auth method ID for Eth wallet: ${err}`
    );
  }
  return ethers5.utils.keccak256(ethers5.utils.toUtf8Bytes(`${address}:lit`));
};

const prepareRelayRequestData = async (authMethod: AuthMethod) => {
  const authMethodType = authMethod.authMethodType;
  const authMethodId = await getAuthMethodId(authMethod);
  const data = {
    authMethodType,
    authMethodId,
  };
  return data;
};

const prepareMintBody = (
  data: IRelayRequestData,
  customArgs: MintRequestBody
): MintNextAndAddAuthMethodsRequest => {
  const pubkey = data.authMethodPubKey || "0x";
  const defaultArgs: MintNextAndAddAuthMethodsRequest = {
    // default params
    keyType: 2,
    permittedAuthMethodTypes: [data.authMethodType],
    permittedAuthMethodIds: [data.authMethodId],
    permittedAuthMethodPubkeys: [pubkey],
    permittedAuthMethodScopes: [[ethers5.BigNumber.from("1")]],
    addPkpEthAddressAsPermittedAddress: true,
    sendPkpToItself: true,
    burnPkp: false,
    sendToAddressAfterMinting: "0x",
    pkpEthAddressScopes: ["1"],
  };
  const body: MintNextAndAddAuthMethodsRequest = {
    ...defaultArgs,
    ...customArgs,
  };
  return body;
};

const mintPKP = async (
  network: "datil" | "datil-test",
  {
    keyType,
    permittedAuthMethodTypes,
    permittedAuthMethodIds,
    permittedAuthMethodPubkeys,
    permittedAuthMethodScopes,
    addPkpEthAddressAsPermittedAddress,
    sendPkpToItself,
  }: // burnPkp,
  // sendToAddressAfterMinting,
  // pkpEthAddressScopes,
  MintNextAndAddAuthMethodsRequest
) => {
  // console.log("Minting PKP with params:", {
  //   keyType,
  //   permittedAuthMethodTypes,
  //   permittedAuthMethodIds,
  //   permittedAuthMethodPubkeys,
  //   permittedAuthMethodScopes,
  //   addPkpEthAddressAsPermittedAddress,
  //   sendPkpToItself,
  //   burnPkp: burnPkp,
  //   sendToAddressAfterMinting,
  //   pkpEthAddressScopes,
  // });

  const pkpNft = getPkpNftContract(network);
  // first get mint cost
  const mintCost = await pkpNft.mintCost();
  // console.log("Mint cost:", mintCost.toString());
  // then mint
  const pkpHelper = getPkpHelperContract(network);

  const mintTxData =
    await pkpHelper.populateTransaction.mintNextAndAddAuthMethods(
      keyType,
      permittedAuthMethodTypes,
      permittedAuthMethodIds,
      permittedAuthMethodPubkeys,
      permittedAuthMethodScopes,
      addPkpEthAddressAsPermittedAddress,
      sendPkpToItself,
      { value: mintCost }
    );

  // on our new arb l3, the stylus gas estimation can be too low when interacting with stylus contracts.  manually estimate gas and add 5%.
  let gasLimit;

  try {
    gasLimit = await pkpHelper.provider.estimateGas(mintTxData);
    state.gasLimitBaseDefault = gasLimit;
    // since the gas limit is a BigNumber we have to use integer math and multiply by 200 then divide by 100 instead of just multiplying by 1.05
  } catch (e) {
    console.log("❗️ Error while estimating gas!");
    gasLimit = state.gasLimitBaseDefault;
    throw e;
  }
  gasLimit = gasLimit
    .mul(ethers5.BigNumber.from(state.gasLimitIncreasePercentage))
    .div(ethers5.BigNumber.from(100));
  // console.log("adjustedGasLimit:", gasLimit);

  // console.log("gasLimit: ", gasLimit.toString());
  // add the gas limit to the transaction data
  mintTxData.gasLimit = gasLimit;

  // now we mint:
  // console.log("pkpHelper");
  // console.log(pkpHelper);
  const mintTx = await pkpHelper.mintNextAndAddAuthMethods(
    keyType,
    permittedAuthMethodTypes,
    permittedAuthMethodIds,
    permittedAuthMethodPubkeys,
    permittedAuthMethodScopes,
    addPkpEthAddressAsPermittedAddress,
    sendPkpToItself,
    {
      value: mintCost,
      gasLimit,
    }
  );

  return mintTx.wait();
};

const extractTokenIdFromLogs = (receipt: any) => {
  const ERC721_TRANSFER_TOPIC = ethers5.utils.id(
    "Transfer(address,address,uint256)"
  );
  const transferLog = receipt.logs.find(
    (log: any) => log.topics[0] === ERC721_TRANSFER_TOPIC
  );
  if (!transferLog) throw new Error("Transfer event not found");

  // The tokenId is in topic[3] if indexed, or in `data` if not
  const tokenIdHex = transferLog.topics[3]; // topics[3] is the indexed tokenId
  const tokenId = ethers5.BigNumber.from(tokenIdHex).toString();
  return tokenId;
};

const mintPKPDirect = async (
  network: "datil" | "datil-test",
  authMethod: AuthMethod,
  customArgs: MintRequestBody
): Promise<IRelayPKP> => {
  const data = await prepareRelayRequestData(authMethod);
  if (customArgs && !validateMintRequestBody(customArgs)) {
    throw new Error("Invalid mint request body");
  }
  const body = prepareMintBody(data, customArgs ?? {});
  const mintRes = await mintPKP(network, body);

  // console.log("mintRes Before:", mintRes);
  // console.log("mintRes After");
  // console.log(mintRes);

  const tokenIdDec = extractTokenIdFromLogs(mintRes);
  // console.log("Minted tokenId:", tokenId);
  const tokenId = "0x" + BigInt(tokenIdDec).toString(16);
  const pkpContract = getPkpNftContract(network);
  const publicKey = await pkpContract.getPubkey(tokenIdDec);
  // console.log("publicKey");
  // console.log(publicKey);

  // console.log("pre compute:");
  const ethAddress = ethers5.utils.computeAddress(publicKey);
  // console.log("ethAddress");
  // console.log(ethAddress);

  const pkp: IRelayPKP = {
    tokenId,
    publicKey,
    ethAddress,
  };

  return pkp; // TODO: return the minted PKP
};

export const SelfRelay = {
  mintPKPDirect,
};
