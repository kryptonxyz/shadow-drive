import * as anchor from "@project-serum/anchor";
import { SHDW_DRIVE_ENDPOINT } from "../utils/common";
import { ShadowDriveResponse } from "../types";
import fetch from "cross-fetch";
import { bs58 } from "@project-serum/anchor/dist/cjs/utils/bytes";
import nacl from "tweetnacl";
/**
 *
 * @param {anchor.web3.PublicKey} key - Publickey of Storage Account
 * @param {string} url - Shadow Drive URL of the file you are requesting to delete.
 * @param {string} version - ShadowDrive version (v1 or v2)
 * @returns {ShadowDriveResponse} - Confirmed transaction ID
 */

export default async function deleteFile(
  key: anchor.web3.PublicKey,
  url: string,
  version: string
): Promise<ShadowDriveResponse> {
  let selectedAccount;
  switch (version.toLocaleLowerCase()) {
    case "v1":
      selectedAccount = await this.program.account.storageAccount.fetch(key);
      break;
    case "v2":
      selectedAccount = await this.program.account.storageAccountV2.fetch(key);
      break;
  }
  const fileData = await fetch(`${SHDW_DRIVE_ENDPOINT}/get-object-data`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      location: url,
    }),
  });
  const fileDataResponse = await fileData.json();
  const fileOwnerOnChain = new anchor.web3.PublicKey(
    fileDataResponse.file_data["owner-account-pubkey"]
  );
  if (!fileOwnerOnChain.equals(this.wallet.publicKey)) {
    return Promise.reject(new Error("Permission denied: Not file owner"));
  }
  try {
    let deleteFileResponse;
    const msg = Buffer.from(
      `Shadow Drive Signed Message:\nStorageAccount: ${key}\nFile to delete: ${url}`
    );
    let msgSig: Uint8Array;
    if (!this.wallet.signMessage) {
      msgSig = nacl.sign.detached(msg, this.wallet.payer.secretKey);
    } else {
      msgSig = await this.wallet.signMessage(msg);
    }
    const encodedMsg = bs58.encode(msgSig);
    deleteFileResponse = await fetch(`${SHDW_DRIVE_ENDPOINT}/delete-file`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        signer: this.wallet.publicKey,
        message: encodedMsg,
        location: url,
      }),
    });
    if (!deleteFileResponse.ok) {
      return Promise.reject(
        new Error(`Server response status code: ${deleteFileResponse.status} \n 
					  Server response status message: ${(await deleteFileResponse.json()).error}`)
      );
    }
    const responseJson = await deleteFileResponse.json();
    return Promise.resolve(responseJson);
  } catch (e) {
    return Promise.reject(new Error(e));
  }
}
