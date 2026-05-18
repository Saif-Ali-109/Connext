import { expect } from "chai";
import { network } from "hardhat";
import type { ChatRegistry } from "../typechain-types";

const { ethers } = await network.create();

describe("ChatRegistry", function () {
  let chatRegistry: ChatRegistry;
  let owner: any;
  let otherAccount: any;

  beforeEach(async function () {
    [owner, otherAccount] = await ethers.getSigners();
    chatRegistry = await ethers.deployContract("ChatRegistry") as unknown as ChatRegistry;
  });

  it("Should register an identity", async function () {
    const pubKey = ethers.toUtf8Bytes("test-public-key");
    await chatRegistry.registerIdentity(pubKey);
    expect(await chatRegistry.getEncryptionKey(owner.address)).to.equal(ethers.hexlify(pubKey));
  });

  it("Should emit MessageSent and transfer tip", async function () {
    const messageHash = ethers.keccak256(ethers.toUtf8Bytes("hello world"));
    const tipAmount = ethers.parseEther("0.1");

    const initialBalance = await ethers.provider.getBalance(otherAccount.address);

    const tx = await chatRegistry.sendMessage(otherAccount.address, messageHash, { value: tipAmount });
    const receipt = await tx.wait();
    const event = receipt?.logs
      .map((log) => {
        try {
          return chatRegistry.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((log) => log?.name === "MessageSent");

    expect(event?.args.from).to.equal(owner.address);
    expect(event?.args.to).to.equal(otherAccount.address);
    expect(event?.args.messageHash).to.equal(messageHash);
    expect(event?.args.tipAmount).to.equal(tipAmount);
    expect(typeof event?.args.timestamp).to.equal("bigint");

    const finalBalance = await ethers.provider.getBalance(otherAccount.address);
    expect(finalBalance - initialBalance).to.equal(tipAmount);
  });
});
