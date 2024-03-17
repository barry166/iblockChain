import crypto from "crypto";
import dgram from "dgram";
import readline from "readline";
import { sign, verifySignature, keys } from "./rsa.js";
import { isEqualObj } from "../utils.js";

const defaultPort = "8888";
class BlockChain {
  constructor() {
    this.data = []; // 还没打包的交易数据
    this.difficulty = 4; // 难度值
    this.blockChain = [BlockChain.initialBlock];
    this.peers = [];
    // 种子节点
    this.seed = { address: "127.0.0.1", port: defaultPort };
    this.udp = dgram.createSocket("udp4");
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    this.init();
  }

  init() {
    this.bindP2P();
    this.bindEvent();
  }

  bindP2P() {
    this.udp.on("message", (message, rinfo) => {
      const { type, data } = JSON.parse(message);
      if (type) {
        this.dispatch({ type, data }, rinfo);
      }
    });

    this.udp.on("listening", () => {
      const address = this.udp.address();
      console.log(`节点正在监听 ${address.address}:${address.port}`);
    });

    const port = process.argv[2];
    this.startNode(port);
  }

  bindEvent() {
    this.rl.on("line", (input) => {
      if (input.startsWith("send ")) {
        const message = input.split(" ").slice(1).join(" ");
        this.boardcast({ type: "chat", data: JSON.stringify(message) });
      } else if (input.startsWith("peers")) {
        console.log(this.peers);
      } else {
        console.log("未知命令");
      }
    });
    process.on("exit", () => {
      console.log("退出进程");
    });
  }

  startNode(port) {
    this.udp.bind(port || 0);
    if (port !== defaultPort) {
      // 通知其他节点，连接到新节点
      this.send(
        {
          type: "newpeer",
        },
        this.seed.port,
        this.seed.address
      );
      this.peers.push(this.seed);
    }
  }

  dispatch(action, rinfo) {
    switch (action.type) {
      case "newpeer":
        console.log(`连接到新节点 ${rinfo.address}:${rinfo.port}`);
        this.boardcast({ type: "sayhi", data: rinfo });
        this.send(
          {
            type: "peerlist",
            data: {
              peers: this.peers,
            },
          },
          rinfo.port,
          rinfo.address
        );
        console.log("rinfo", rinfo);
        this.peers.push(rinfo);
        break;

      case "sayhi":
        // 给别人一个hi
        let data = action.data;
        this.peers.push(data);
        // 和新加入节点打个招呼
        console.log(
          "[信息]: 听说新朋友来了，打个招呼，相识就是缘",
          data.port,
          data.address
        );

        this.send({ type: "hi" }, data.port, data.address);
        break;

      case "peerlist":
        // 本地获取到 所有节点，hi一下新朋友
        const newPeers = action.data.peers;
        console.log("newPeers", newPeers, "this.peers", this.peers);
        this.addPeers(newPeers);
        this.boardcast({ type: "hi" });
        break;

      case "hi":
        // hi没有意义，udp打洞给网件加白名单用的
        break;
      case "chat":
        console.log(`==> ${action.data}`);
        break;
      default:
        console.log("未知action", action);
    }
  }

  send(message, port, host) {
    console.log(message, port, host);
    this.udp.send(JSON.stringify(message), port, host, (err) => {
      if (err) {
        console.log(`发送消息到 ${host}:${port} 失败：`, err);
      }
    });
  }

  boardcast(message) {
    this.peers.forEach((peer) => {
      this.send(message, peer.port, peer.address);
    });
  }

  addPeers(newPeers) {
    newPeers.forEach((peer) => {
      if (!this.peers.find((v) => isEqualObj(v, peer))) {
        this.peers.push(peer);
      }
    });
  }

  // 挖矿
  mine(address = keys.publicKey) {
    if (
      !this.data.every((v, index) => {
        const res = this.isValidTransfer(v);
        // console.log(`第${index}笔交易是否合法：${res}`);
        return res;
      })
    ) {
      console.log("有不合法的交易");
      return;
    }

    const startTime = new Date().getTime();
    const newBlock = this.createBlock();
    if (!this.validateBlock(newBlock)) {
      console.log("不合法的区块或链");
      return false;
    }
    this.transfer("0", address, 100);
    this.blockChain.push(newBlock);
    this.data = [];
    const endTime = new Date().getTime();
    console.log(
      `挖矿成功，耗时${endTime - startTime}ms，算了${newBlock.nonce}次，进账100`
    );
    return newBlock;
  }

  // 转账
  transfer(from, to, amount) {
    const trans = { from, to, amount };
    const signTrans = { ...trans, trans, sign: sign(trans) };
    if (from !== "0" && this.balance(from) < amount) {
      console.log("余额不足");
      return false;
    }
    this.data.push(signTrans);
    return signTrans;
  }

  // 是否是合法转账
  isValidTransfer(signTrans) {
    return signTrans.from === "0"
      ? true
      : verifySignature(signTrans.trans, signTrans.sign, keys.publicKey);
  }

  computeBlockHash({ index, previousHash, timestamp, data, nonce }) {
    return this.computeHash(index, previousHash, timestamp, data, nonce);
  }

  // 计算哈希
  computeHash(index, previousHash, timestamp, data, nonce) {
    return crypto
      .createHash("sha256")
      .update(index + previousHash + timestamp + data + nonce)
      .digest("hex");
  }

  // 创建新区块
  createBlock() {
    let timestamp = new Date().getTime();
    let nonce = 0;
    const previousHash = this.blockChain[this.blockChain.length - 1].hash;
    const index = this.blockChain.length;
    const data = this.data;
    let hash = this.computeHash(index, previousHash, timestamp, data, nonce);
    while (hash.substring(0, this.difficulty) !== "0".repeat(this.difficulty)) {
      nonce++;
      timestamp = new Date().getTime();
      hash = this.computeHash(index, previousHash, timestamp, data, nonce);
    }

    return {
      index,
      timestamp,
      nonce,
      previousHash,
      hash,
      data,
    };
  }

  // 余额
  balance(address = keys.publicKey) {
    let balance = 0;
    for (const block of this.blockChain) {
      if (!Array.isArray(block.data)) continue;
      for (const trans of block.data) {
        if (trans.from === address) {
          balance -= trans.amount;
        }
        if (trans.to === address) {
          balance += trans.amount;
        }
      }
    }
    return balance;
  }

  // 校验区块
  validateBlock(
    block,
    lastBlock = this.blockChain[this.blockChain.length - 1]
  ) {
    if (lastBlock.index + 1 !== block.index) {
      console.log(`第${block.index}块区块索引不正确`);
      return false;
    } else if (lastBlock.timestamp > block.timestamp) {
      console.log(`第${block.index}块区块时间戳不正确`);
      return false;
    } else if (lastBlock.hash !== block.previousHash) {
      console.log(`第${block.index}块区块哈希指向不正确`);
      return false;
    } else if (block.hash !== this.computeBlockHash(block)) {
      // 校验区块哈希计算是否正确
      console.log(`第${block.index}块区块哈希整体计算不正确`);
      return false;
    } else if (
      block.hash.substring(0, this.difficulty) !== "0".repeat(this.difficulty)
    ) {
      console.log(`第${block.index}块区块哈希格式计算不正确`);
      return false;
    }
    return true;
  }

  // 校验链
  validateChain() {
    if (
      JSON.stringify(this.blockChain[0]) !==
      JSON.stringify(BlockChain.initialBlock)
    ) {
      console.log("创世区块不合法");
      return false;
    }
    for (let i = 1; i < this.blockChain.length; i++) {
      const currentBlock = this.blockChain[i];
      const previousBlock = this.blockChain[i - 1];
      if (!this.validateBlock(currentBlock, previousBlock)) {
        return false;
      }
    }
    return true;
  }

  static get initialBlock() {
    return {
      index: 0,
      previousHash: "0",
      data: "Welcome to Block Chain",
      hash: "00000aa1fbf27775ab79612bcb8171b3a9e02efe32fa628450ba6e729cf03996",
      timestamp: 1710649178570,
      nonce: 0,
    };
  }
}

export default BlockChain;
